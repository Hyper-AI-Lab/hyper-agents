// Release 3.5.1: fixes for what the reviewers of a project's upgrade to 3.5.0
// found in the runtime. Each test failed before its fix.
import assert from 'node:assert/strict'
import { mkdir, readFile, symlink } from 'node:fs/promises'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { test } from 'node:test'
import { worktreeFingerprint } from '../src/runtime/lib/gate.mjs'
import { isMissingTool } from '../src/runtime/lib/runner.mjs'
import { evaluateCommand } from '../src/runtime/lib/shell-rules.mjs'
import { commitAll, git, hook, read, readOrNull, repo, runtime, stopGuidance, tempDir, writeFiles } from './helpers.mjs'

const pass = 'node -e "process.exit(0)"'
const fail = 'node -e "process.exit(1)"'
const files = { '.agent/checks.conf': `quick|unit|${pass}\n`, 'src/a.js': 'a\n', 'test/a.test.js': 'ok\n' }
const posixOnly = { skip: process.platform === 'win32' ? 'POSIX shell messages and PATH' : false }

function approvedTask(dir, slug, route = 'STANDARD') {
  assert.equal(runtime(dir, 'task', 'start', '--slug', slug, '--route', route, '--summary', 'x').code, 0)
  assert.equal(runtime(dir, 'task', 'approve-tests').code, 0)
  assert.equal(runtime(dir, 'task', 'phase', 'implementing').code, 0)
}
const currentId = async (dir) => (await read(dir, '.agent/tasks/CURRENT')).trim()
const stateOf = async (dir) => JSON.parse(await read(dir, `.agent/tasks/${await currentId(dir)}/state.json`))
async function editState(dir, change) {
  const state = await stateOf(dir)
  change(state)
  await writeFiles(dir, { [`.agent/tasks/${state.id}/state.json`]: `${JSON.stringify(state, null, 2)}\n` })
}
const minuteAgo = () => new Date(Date.now() - 60_000).toISOString()
const stop = (dir, extra = {}) => hook('stop-gate', { hook_event_name: 'Stop', stop_hook_active: false, ...extra }, { projectDir: dir })

test('stop: an invalid .agent/paacm.json is reported as a gate that cannot verify the task, not a hook error', async (t) => {
  const dir = await repo(t, { files })
  approvedTask(dir, 'cfg')
  await writeFiles(dir, { '.agent/paacm.json': '{ "gate": { "tier": "fast" } }\n' })
  const r = stop(dir)
  assert.equal(r.code, 0, r.out)
  assert.match(stopGuidance(r), /could not verify this task[\s\S]*\.agent\/paacm\.json/)
})

test("stop: one project's error does not release another project's failing gate", async (t) => {
  const dir = await repo(t, { files })
  approvedTask(dir, 'main')
  await writeFiles(dir, { '.agent/paacm.json': '{ "gate": { "tier": "fast" } }\n' })
  const sibling = path.join(tempDir(t), 'wt')
  git(dir, 'worktree', 'add', '-q', '-b', 's', sibling)
  await writeFiles(sibling, { '.agent/checks.conf': `quick|unit|${fail}\n` })
  commitAll(sibling, 'a failing check')
  approvedTask(sibling, 'sibling')
  const r = stop(dir, { cwd: sibling })
  assert.equal(r.json?.decision, 'block', r.out)
  assert.match(r.json.reason, /gate failed/)
})

test('gate: a gate.log that cannot be written leaves the result and the exit code intact', async (t) => {
  const dir = await repo(t, { files })
  approvedTask(dir, 'log')
  await mkdir(path.join(dir, '.agent', 'tasks', await currentId(dir), 'gate.log'), { recursive: true })
  const r = runtime(dir, 'gate')
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /WARN could not save .*gate\.log/)
  assert.match(r.stdout, /paacm gate: exit 0/)
  assert.equal((await stateOf(dir)).lastGate.passed, true)
})

test('gate: a script the shell cannot find in the repository is an ordinary failure, not a missing tool', posixOnly, async (t) => {
  const dir = await repo(t, { files: { ...files, '.agent/checks.conf': 'quick|unit|./scripts/missing.sh\n' } })
  approvedTask(dir, 'path')
  const r = runtime(dir, 'gate')
  assert.equal(r.code, 1, r.out)
  assert.doesNotMatch(r.out, /This is the environment, not the code/)
  assert.equal((await stateOf(dir)).lastGate.missingTool, undefined)
})

test('gate: a program that is not installed is still reported as a missing tool', async (t) => {
  const dir = await repo(t, { files: { ...files, '.agent/checks.conf': 'quick|unit|paacm-no-such-program-3-5-1\n' } })
  approvedTask(dir, 'prog')
  const r = runtime(dir, 'gate')
  assert.equal(r.code, 1, r.out)
  assert.match(r.out, /a command was not found/)
  assert.equal((await stateOf(dir)).lastGate.missingTool, true)
})

test('protect: when git cannot run, an edit in a sibling worktree is refused, not allowed', posixOnly, async (t) => {
  const dir = await repo(t, { files })
  const sibling = path.join(tempDir(t), 'wt')
  git(dir, 'worktree', 'add', '-q', '-b', 's', sibling)
  approvedTask(sibling, 'sibling')
  const r = hook('protect', { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(sibling, 'test', 'a.test.js') } }, { projectDir: dir, env: { PATH: tempDir(t) } })
  assert.notEqual(r.code, 0, `a hook error, which the fail-closed hook turns into a refusal: ${r.out}`)
  assert.match(r.stderr, /git could not tell/)
})

test('stop: a continuation reuses a passing gate for the same uncommitted tree, however old it is', async (t) => {
  const counter = path.join(tempDir(t), 'runs.txt').split(path.sep).join('/')
  const counted = `node -e "require('fs').appendFileSync('${counter}', 'x')"`
  const dir = await repo(t, { files: { ...files, '.agent/checks.conf': `quick|unit|${counted}\n` } })
  approvedTask(dir, 'again')
  await writeFiles(dir, { 'src/a.js': 'changed\n' })
  assert.equal(runtime(dir, 'gate').code, 0)
  const runs = async () => (await readFile(counter, 'utf8')).length
  assert.equal(await runs(), 1)
  await editState(dir, (s) => {
    s.lastGate.at = minuteAgo()
  })
  const r = stop(dir, { stop_hook_active: true })
  assert.equal(r.code, 0, r.out)
  assert.equal(await runs(), 1, 'the gate did not run again')
})

test("gate: the working tree's fingerprint changes when an untracked file's content changes", async (t) => {
  const dir = await repo(t, { files })
  await writeFiles(dir, { 'notes.txt': 'a\n' })
  const before = worktreeFingerprint(dir)
  await writeFiles(dir, { 'notes.txt': 'a longer note\n' })
  assert.notEqual(worktreeFingerprint(dir), before)
})

test('stop: the finish nudge is given once for the same state, not again after a pause', async (t) => {
  const dir = await repo(t, { files })
  approvedTask(dir, 'nudge')
  runtime(dir, 'task', 'phase', 'reviewing')
  assert.equal(runtime(dir, 'gate').code, 0)
  assert.match(stopGuidance(stop(dir)), /the gate is green/)
  await editState(dir, (s) => {
    s.lastNudge.at = minuteAgo()
  })
  const again = stop(dir)
  assert.equal(again.code, 0, again.out)
  assert.equal(again.json, null, 'no second nudge for the same state')
})

test('shell guard: global options before a git command are checked in linear time', () => {
  const started = performance.now()
  evaluateCommand(`git${' -c'.repeat(36)} status`)
  const ms = performance.now() - started
  assert.ok(ms < 250, `took ${ms.toFixed(0)} ms`)
  assert.equal(evaluateCommand(`git${' -c x=1'.repeat(30)} commit -n -m x`)?.id, 'skip-git-hooks')
  for (const command of ['git commit -n -m x', 'git -c core.x=1 commit -an', 'git -C /repo commit -nm msg', 'git --no-pager commit -n']) {
    assert.equal(evaluateCommand(command)?.id, 'skip-git-hooks', command)
  }
  for (const command of ['git commit -m x', 'git -C /r log -n 5']) assert.notEqual(evaluateCommand(command)?.id, 'skip-git-hooks', command)
})

test('a corrupt state.json in another worktree is reported, not silently skipped', async (t) => {
  const dir = await repo(t, { files })
  const sibling = path.join(tempDir(t), 'wt')
  git(dir, 'worktree', 'add', '-q', '-b', 's', sibling)
  approvedTask(sibling, 'broken')
  await writeFiles(sibling, { [`.agent/tasks/${await currentId(sibling)}/state.json`]: '{\n' })
  const r = runtime(dir, 'task', 'start', '--slug', 'next', '--route', 'FAST', '--summary', 'x')
  assert.equal(r.code, 0, r.out)
  assert.match(r.stderr, /could not read [^\n]*state\.json/)
})

test('review input withholds the content of untracked files that look like keys or secrets', async (t) => {
  const dir = await repo(t, { files })
  approvedTask(dir, 'secrets')
  await writeFiles(dir, {
    'notes.txt': 'plain-note-marker\n',
    id_ed25519: 'ssh-key-marker\n',
    'config/.env': 'env-marker\n',
    'certs/server.pem': 'pem-marker\n',
    'certs/server.key': 'key-marker\n',
  })
  const r = runtime(dir, 'task', 'review-input')
  assert.equal(r.code, 0, r.out)
  const id = await currentId(dir)
  let text = await read(dir, `.agent/tasks/${id}/review-input.md`)
  for (const n of ['001', '002', '003', '004', '005']) text += (await readOrNull(dir, `.agent/tasks/${id}/review-diffs/${n}.diff`)) ?? ''
  assert.match(text, /plain-note-marker/)
  for (const marker of ['ssh-key-marker', 'env-marker', 'pem-marker', 'key-marker']) assert.doesNotMatch(text, new RegExp(marker))
  for (const name of ['id_ed25519', 'config/.env', 'certs/server.pem', 'certs/server.key']) assert.ok(text.includes(name), `${name} is listed by name`)
})

test('a blocked task in another worktree is not held against a test file added after its approval', async (t) => {
  const dir = await repo(t, { files })
  approvedTask(dir, 'held')
  assert.equal(runtime(dir, 'task', 'block', '--trigger', '2', '--reason', 'a tool is missing').code, 0)
  const base = git(dir, 'rev-parse', 'HEAD').trim()

  const added = path.join(tempDir(t), 'added')
  git(dir, 'worktree', 'add', '-q', '-b', 'added', added, base)
  await writeFiles(added, { 'test/b.test.js': 'a new test\n' })
  commitAll(added, 'a new test')
  const started = runtime(added, 'task', 'start', '--slug', 'added', '--route', 'FAST', '--summary', 'x')
  assert.equal(started.code, 0, started.out)

  const edited = path.join(tempDir(t), 'edited')
  git(dir, 'worktree', 'add', '-q', '-b', 'edited', edited, base)
  await writeFiles(edited, { 'test/a.test.js': 'weakened\n', 'test/c.test.js': 'another new test\n' })
  commitAll(edited, 'edit the approved test and add one')
  const refused = runtime(edited, 'task', 'start', '--slug', 'edited', '--route', 'FAST', '--summary', 'x')
  assert.equal(refused.code, 1, refused.out)
  assert.match(refused.stderr, /\(in the worktree at [^)]+\) is blocked[^\n]*changed since: test\/a\.test\.js\./)
})

// Found by a fresh-context review of the 3.5.1 fixes themselves.

test('stop: an error on a continuation lets the stop through, but as a hook error the human sees', async (t) => {
  const dir = await repo(t, { files: { ...files, '.agent/checks.conf': `quick|unit|${fail}\n` } })
  approvedTask(dir, 'loop')
  assert.equal(stop(dir).json?.decision, 'block')
  await writeFiles(dir, { [`.agent/tasks/${await currentId(dir)}/state.json`]: '{\n' })
  const r = stop(dir, { stop_hook_active: true })
  assert.equal(r.code, 1, r.out)
  assert.match(r.stderr, /PAACM stop gate could not check/)
})

test('gate: an untracked symbolic link loop neither breaks the fingerprint nor loses the result', { skip: process.platform === 'win32' ? 'symbolic links need privileges on Windows' : false }, async (t) => {
  const dir = await repo(t, { files })
  approvedTask(dir, 'link')
  await symlink('loop', path.join(dir, 'loop'))
  assert.doesNotThrow(() => worktreeFingerprint(dir))
  const r = runtime(dir, 'gate')
  assert.equal(r.code, 0, r.out)
  assert.equal((await stateOf(dir)).lastGate.passed, true)
})

test('gate: a missing program named by a path outside the project, or after an unrelated message, is a missing tool', () => {
  const project = path.resolve('/srv/project')
  const result = (outputTail) => ({ exitCode: 127, outputTail })
  assert.equal(isMissingTool(result('/bin/sh: 1: /opt/tools/bin/golangci-lint: not found\n'), project), true)
  assert.equal(isMissingTool(result('cat: config/local.json: No such file or directory\n/bin/sh: 1: paacm-no-such-linter: not found\n'), project), true)
  assert.equal(isMissingTool(result('/bin/sh: 1: ./scripts/missing.sh: not found\n'), project), false)
  assert.equal(isMissingTool(result('sh: scripts/missing.sh: No such file or directory\n'), project), false)
})

test('review input withholds secret-named untracked files anywhere in the repository when the project is a sub-folder', async (t) => {
  const dir = await repo(t, { files: { 'pkg/.agent/paacm.json': '{}\n', 'pkg/.agent/checks.conf': `quick|unit|${pass}\n`, 'pkg/src/a.js': 'a\n' } })
  const pkg = path.join(dir, 'pkg')
  approvedTask(pkg, 'sub')
  await writeFiles(dir, { '.env': 'root-secret-marker\n', 'other/id_rsa': 'other-key-marker\n', 'pkg/.env': 'pkg-secret-marker\n' })
  const r = runtime(pkg, 'task', 'review-input')
  assert.equal(r.code, 0, r.out)
  const text = await read(pkg, `.agent/tasks/${await currentId(pkg)}/review-input.md`)
  for (const marker of ['root-secret-marker', 'other-key-marker', 'pkg-secret-marker']) assert.doesNotMatch(text, new RegExp(marker))
  for (const name of ['- .env', '- other/id_rsa', '- pkg/.env']) assert.ok(text.includes(name), `${name} is listed`)
})

test("protect: the refusal when git cannot run names the folder and git's own message", posixOnly, async (t) => {
  const dir = await repo(t, { files })
  const sibling = path.join(tempDir(t), 'wt')
  git(dir, 'worktree', 'add', '-q', '-b', 's', sibling)
  const r = hook('protect', { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: path.join(sibling, 'src', 'a.js') } }, { projectDir: dir, env: { PATH: tempDir(t) } })
  assert.notEqual(r.code, 0, r.out)
  assert.match(r.stderr, /failed in [^:]+: [^\n]*ENOENT/)
})
