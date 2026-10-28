// Ways around the gates found in the 3.4.0 audit: edits the protect hook could
// not attribute, task state the writer could rewrite, gate configuration changed
// after the tests were approved, paths that hide their target, and shell commands
// that edit protected files or hide changes from git.
import assert from 'node:assert/strict'
import { symlinkSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { unquotedHidden } from '../src/cli/eval.mjs'
import { matchesAny } from '../src/runtime/lib/glob.mjs'
import { toProjectPath } from '../src/runtime/lib/hookio.mjs'
import { evaluateCommand } from '../src/runtime/lib/shell-rules.mjs'
import { commitAll, hook, repo, runtime, writeFiles } from './helpers.mjs'

const pass = 'node -e "process.exit(0)"'
const today = () => new Date().toISOString().slice(0, 10)

async function approved(t, files = {}) {
  const dir = await repo(t, { files: { '.agent/checks.conf': `quick|unit|${pass}\n`, 'src/a.js': 'a\n', 'test/a.test.js': 'ok\n', ...files } })
  runtime(dir, 'task', 'start', '--slug', 'h', '--route', 'STANDARD', '--summary', 'x')
  assert.equal(runtime(dir, 'task', 'approve-tests').code, 0)
  return dir
}

const claudeEdit = (dir, toolInput) => hook('protect', { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: toolInput }, { projectDir: dir })
const cursorWrite = (dir, toolInput) => hook('protect', { hook_event_name: 'preToolUse', tool_name: 'Write', tool_input: toolInput, workspace_roots: [dir] }, { projectDir: dir })

test('protect: an edit whose target cannot be found is refused, not allowed', async (t) => {
  const dir = await approved(t)
  assert.equal(cursorWrite(dir, { someNewField: path.join(dir, 'test/a.test.js') }).json.permission, 'deny')
  assert.equal(claudeEdit(dir, {}).json.hookSpecificOutput.permissionDecision, 'deny')
})

test('protect: the task state and the current-task pointer cannot be edited, other task files can', async (t) => {
  const dir = await approved(t)
  const id = `${today()}-h`
  assert.equal(claudeEdit(dir, { file_path: path.join(dir, `.agent/tasks/${id}/state.json`) }).json.hookSpecificOutput.permissionDecision, 'deny')
  assert.equal(cursorWrite(dir, { file_path: path.join(dir, '.agent/tasks/CURRENT') }).json.permission, 'deny')
  assert.deepEqual(cursorWrite(dir, { file_path: path.join(dir, `.agent/tasks/${id}/PLAN.md`) }).json, { permission: 'allow' })
})

test('protect: a path through a symbolic link is judged by its real location', async (t) => {
  const dir = await approved(t, { 'test/helper.js': 'h\n' })
  try {
    symlinkSync(path.join(dir, 'test'), path.join(dir, 'alias'), 'dir')
  } catch {
    t.skip('symbolic links are not available here')
    return
  }
  assert.equal(claudeEdit(dir, { file_path: path.join(dir, 'alias/helper.js') }).json.hookSpecificOutput.permissionDecision, 'deny')
})

test('toProjectPath keeps a file whose name starts with two dots inside the project', () => {
  const dir = path.resolve('/project')
  assert.equal(toProjectPath(dir, path.join(dir, '..x.test.js')), '..x.test.js')
  assert.equal(toProjectPath(dir, path.join(dir, '..', 'outside.txt')), null)
})

test('matchesAny can ignore case, for file systems that do', () => {
  assert.equal(matchesAny('Test/A.TEST.js', ['**/*.test.*']), false)
  assert.equal(matchesAny('Test/A.TEST.js', ['**/*.test.*'], { ignoreCase: true }), true)
})

test('gate: changing the check manifest after the tests were approved fails the gate', async (t) => {
  const dir = await approved(t)
  await writeFiles(dir, { '.agent/checks.conf': 'quick|unit|node -e "process.exit(0)" # weakened\n' })
  const r = runtime(dir, 'gate')
  assert.equal(r.code, 4, r.out)
  assert.match(r.out, /PROTECTED \.agent\/checks\.conf/)
})

test('gate: emptying the protected test patterns after approval does not hide a test edit', async (t) => {
  const dir = await approved(t)
  await writeFiles(dir, { '.agent/paacm.json': JSON.stringify({ protect: { tests: [] } }), 'test/a.test.js': 'changed\n' })
  const r = runtime(dir, 'gate')
  assert.equal(r.code, 4, r.out)
  assert.match(r.out, /PROTECTED \.agent\/paacm\.json/)
})

test('gate: a configuration change the human approved passes after reopen-tests and a new test baseline', async (t) => {
  const dir = await approved(t)
  await writeFiles(dir, { '.agent/checks.conf': `quick|unit|${pass}\nquick|lint|${pass}\n` })
  commitAll(dir)
  const gate = runtime(dir, 'gate')
  assert.equal(gate.code, 4)
  assert.match(gate.out, /paacm task reopen-tests/, 'the gate names the way to a new baseline')
  const again = runtime(dir, 'task', 'approve-tests')
  assert.equal(again.code, 1, 'approve-tests alone cannot accept the change')
  assert.match(again.out, /\.agent\/checks\.conf[\s\S]*reopen-tests/)
  assert.equal(runtime(dir, 'task', 'reopen-tests', '--reason', 'the human approved the lint check').code, 0)
  assert.equal(runtime(dir, 'task', 'approve-tests').code, 0)
  assert.equal(runtime(dir, 'gate').code, 0)
})

test('approve-tests cannot re-approve a test changed after the approval, for example through the shell', async (t) => {
  const dir = await approved(t)
  await writeFiles(dir, { 'test/a.test.js': 'weakened\n' })
  commitAll(dir, 'edit the approved test')
  const r = runtime(dir, 'task', 'approve-tests')
  assert.equal(r.code, 1, r.out)
  assert.match(r.out, /test\/a\.test\.js[\s\S]*reopen-tests/)
  assert.equal(runtime(dir, 'gate').code, 4, 'the old baseline still holds')
})

test('approve-tests moves a task out of testing, and accepts a new baseline when no frozen file changed', async (t) => {
  const dir = await repo(t, { files: { '.agent/checks.conf': `quick|unit|${pass}\n`, 'src/a.js': 'a\n', 'test/a.test.js': 'ok\n' } })
  runtime(dir, 'task', 'start', '--slug', 's', '--route', 'STANDARD', '--summary', 'x')
  runtime(dir, 'task', 'phase', 'testing')
  assert.equal(runtime(dir, 'task', 'approve-tests').code, 0)
  const status = () => JSON.parse(runtime(dir, 'task', 'status', '--json').stdout).status
  assert.equal(status(), 'implementing')
  await writeFiles(dir, { 'src/a.js': 'b\n' })
  commitAll(dir, 'implementation')
  assert.equal(runtime(dir, 'task', 'approve-tests').code, 0)
  assert.equal(runtime(dir, 'task', 'reopen-tests', '--reason', 'approved change').code, 0)
  assert.equal(status(), 'testing')
  assert.equal(runtime(dir, 'task', 'approve-tests').code, 0)
  assert.equal(status(), 'implementing')
})

test('shell guard: writing the gate configuration or the task state through the shell is denied', () => {
  for (const command of [
    "sed -i 's/full/quick/' .agent/checks.conf",
    'echo {} > .agent/paacm.json',
    `printf '{}' > .agent/tasks/${today()}-h/state.json`,
    'echo other > .agent/tasks/CURRENT',
    'cp /tmp/x.md .agent/extensions/08-review.md',
  ]) {
    assert.equal(evaluateCommand(command)?.decision, 'deny', command)
  }
  assert.equal(evaluateCommand('cat .agent/checks.conf'), null)
  assert.equal(evaluateCommand('node .claude/skills/paacm/scripts/paacm.mjs task log "x"'), null)
})

test('shell guard: hiding a file change from git needs approval', () => {
  assert.equal(evaluateCommand('git update-index --skip-worktree test/a.test.js')?.decision, 'ask')
  assert.equal(evaluateCommand('git update-index --assume-unchanged test/a.test.js')?.decision, 'ask')
  assert.equal(evaluateCommand('git update-index --refresh'), null)
})

test('eval: an unquoted {{HIDDEN}} placeholder is detected', () => {
  assert.equal(unquotedHidden('pytest {{HIDDEN}}/test_x.py'), true)
  assert.equal(unquotedHidden('pytest "{{HIDDEN}}/test_x.py"'), false)
  assert.equal(unquotedHidden("pytest '{{HIDDEN}}'"), false)
  assert.equal(unquotedHidden('npm test'), false)
})

// Found by running Claude Code headless on a fixture project with PAACM installed.

test('reopen-tests lets the writer make a test change the human approved, then re-approve', async (t) => {
  const dir = await approved(t)
  const edit = () => claudeEdit(dir, { file_path: path.join(dir, 'test/a.test.js') })
  assert.equal(edit().json.hookSpecificOutput.permissionDecision, 'deny')
  assert.equal(runtime(dir, 'task', 'reopen-tests').code, 2, 'the reason is required')
  const r = runtime(dir, 'task', 'reopen-tests', '--reason', 'the human asked for 30 instead of 3')
  assert.equal(r.code, 0, r.out)
  assert.equal(edit().json, null, 'the test is editable again')
  await writeFiles(dir, { 'test/a.test.js': 'changed\n' })
  commitAll(dir)
  assert.equal(runtime(dir, 'task', 'approve-tests').code, 0)
  assert.equal(runtime(dir, 'gate').code, 0)
  assert.equal(edit().json.hookSpecificOutput.permissionDecision, 'deny', 'read-only again after the new approval')
})

test('reopen-tests refuses when the tests are not approved', async (t) => {
  const dir = await repo(t, { files: { '.agent/checks.conf': `quick|unit|${pass}\n` } })
  runtime(dir, 'task', 'start', '--slug', 'n', '--route', 'STANDARD', '--summary', 'x')
  assert.equal(runtime(dir, 'task', 'reopen-tests', '--reason', 'x').code, 1)
})

test('shell guard: reopening the tests needs the human to confirm', () => {
  assert.equal(evaluateCommand('node .claude/skills/paacm/scripts/paacm.mjs task reopen-tests --reason "approved"')?.decision, 'ask')
  assert.equal(evaluateCommand('node .claude/skills/paacm/scripts/paacm.mjs task approve-tests'), null)
})

test('gate and check print their exit code, so the report can quote it', async (t) => {
  const dir = await approved(t)
  assert.match(runtime(dir, 'gate').stdout, /^paacm gate: exit 0$/m)
  assert.match(runtime(dir, 'check', '--tier', 'quick').stdout, /^paacm check: exit 0$/m)
})

test('shell guard: skipping git hooks needs approval', () => {
  const skips = [
    'git commit --no-verify -m x',
    'git commit -n -m x',
    'git commit -nm x',
    'git commit -am x -n',
    'git push --no-verify origin main',
    'git merge --no-verify feature',
    'git -c core.hooksPath=/dev/null commit -m x',
    'git config core.hooksPath /tmp/none',
    'git config --local core.hookspath .nohooks',
    'HUSKY=0 git commit -m x',
    'HUSKY_SKIP_HOOKS=1 git commit -m x',
    'SKIP=lint,test git commit -m x',
    'LEFTHOOK=0 git commit -m x',
  ]
  for (const command of skips) {
    const v = evaluateCommand(command)
    assert.equal(v?.decision, 'ask', command)
    assert.equal(v.id, 'skip-git-hooks', command)
  }
  assert.equal(evaluateCommand('git push -n origin main')?.id, 'git-push', 'push -n is a dry run')
  for (const command of ['git commit --amend -m "-n"', 'git commit --signoff -m x', 'git log -n 3', 'git config core.editor vim', 'SKIP=1 npm test']) {
    assert.equal(evaluateCommand(command), null, command)
  }
})

test('shell guard: deploy commands are caught with global options before the subcommand', () => {
  for (const command of ['terraform -chdir=infra apply', 'tofu -chdir=x destroy -auto-approve', 'kubectl --context prod apply -f x.yaml', 'helm --kube-context prod upgrade app ./chart', 'docker --context remote push registry/app:1', 'docker image push registry/app:1']) {
    assert.equal(evaluateCommand(command)?.id, 'publish-deploy', command)
  }
  for (const command of ['terraform -chdir=infra plan -out=apply.plan', 'kubectl get pods -l action=delete', 'helm template app ./chart', 'docker build -t app .']) {
    assert.equal(evaluateCommand(command), null, command)
  }
})

test('protect: CI actions and git-hook managers are protected configuration by default', async (t) => {
  const dir = await repo(t, { files: { 'src/a.js': 'a\n' } })
  const edit = (rel) => hook('protect', { hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { file_path: path.join(dir, rel) } }, { projectDir: dir })
  for (const rel of ['.github/actions/build/action.yml', '.husky/pre-commit', '.pre-commit-config.yaml', 'lefthook.yml', 'lefthook.yaml', '.lefthook.yml', 'lefthook-local.yml']) {
    assert.equal(edit(rel).json?.hookSpecificOutput.permissionDecision, 'ask', rel)
  }
  assert.equal(edit('src/a.js').json, null)
})
