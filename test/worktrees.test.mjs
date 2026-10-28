// Worktrees: a repository can have linked worktrees next to the project or
// nested in it (for example under .claude/worktrees/), each with its own task.
// The hooks and the runtime judge a file by the worktree it is in, and a
// session that moved into a worktree works on that worktree's task.
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { commitAll, git, hook, repo, runtime, tempDir, writeFiles } from './helpers.mjs'

const pass = 'node -e "process.exit(0)"'
const fail = 'node -e "process.exit(1)"'
const files = { '.agent/checks.conf': `quick|unit|${pass}\n`, 'src/a.js': 'a\n', 'test/a.test.js': 'ok\n' }

const decision = (r) => (r.json ? r.json.hookSpecificOutput.permissionDecision : 'allow')
const edit = (projectDir, file, extra = {}) => hook('protect', { hook_event_name: 'PreToolUse', tool_name: 'Edit', tool_input: { file_path: file }, ...extra }, { projectDir })

function approvedTask(dir, slug) {
  assert.equal(runtime(dir, 'task', 'start', '--slug', slug, '--route', 'STANDARD', '--summary', 'x').code, 0)
  assert.equal(runtime(dir, 'task', 'approve-tests').code, 0)
}

test("protect: a nested worktree is judged by its own rules and task, not as the main checkout's .claude/ folder", async (t) => {
  const dir = await repo(t, { files })
  const nested = path.join(dir, '.claude', 'worktrees', 'x')
  git(dir, 'worktree', 'add', '-q', '-b', 'x', nested)
  approvedTask(nested, 'nested')

  assert.equal(decision(edit(dir, path.join(nested, 'src', 'a.js'))), 'allow', 'an ordinary source file in the worktree')
  assert.equal(decision(edit(dir, path.join(nested, 'test', 'a.test.js'))), 'deny', "the worktree's own approved tests")
  assert.equal(decision(edit(dir, path.join(nested, '.claude', 'settings.json'))), 'ask', "the worktree's agent settings")
  assert.equal(decision(edit(dir, path.join(dir, 'test', 'a.test.js'))), 'allow', 'the main checkout has no approved tests')
})

test('protect: a sibling worktree of the same repository is protected, another repository is not', async (t) => {
  const dir = await repo(t, { files })
  const sibling = path.join(tempDir(t), 'wt')
  git(dir, 'worktree', 'add', '-q', '-b', 's', sibling)
  approvedTask(sibling, 'sibling')
  assert.equal(decision(edit(dir, path.join(sibling, 'test', 'a.test.js'))), 'deny')
  assert.equal(decision(edit(dir, path.join(sibling, '.github', 'workflows', 'ci.yml'))), 'ask')
  assert.equal(decision(edit(dir, path.join(sibling, 'src', 'a.js'))), 'allow')

  const other = await repo(t, { files })
  approvedTask(other, 'other')
  assert.equal(decision(edit(dir, path.join(other, 'test', 'a.test.js'))), 'allow', 'another repository is outside the project')
  assert.equal(decision(edit(dir, path.join(other, 'test', 'a.test.js'), { cwd: other })), 'allow', 'moving into another repository does not change the project')
})

test('protect: a session started in a subdirectory still protects the approved tests', async (t) => {
  const dir = await repo(t, { files })
  approvedTask(dir, 'sub')
  assert.equal(decision(edit(path.join(dir, 'src'), path.join(dir, 'test', 'a.test.js'))), 'deny')
})

test('protect: a file in a submodule is judged by the project that contains it', async (t) => {
  const lib = await repo(t, { files: { 'test/b.test.js': 'ok\n' } })
  const dir = await repo(t, { files })
  git(dir, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', lib, 'vendor/lib')
  commitAll(dir, 'add submodule')
  approvedTask(dir, 'sub')
  assert.equal(decision(edit(dir, path.join(dir, 'vendor', 'lib', 'test', 'b.test.js'))), 'deny')
  const status = runtime(path.join(dir, 'vendor', 'lib'), 'task', 'status')
  assert.match(status.stdout, /-sub — x/, 'the runtime finds the task from inside the submodule')
})

test('hooks follow a session into a worktree of the same repository (cwd), even when CLAUDE_PROJECT_DIR stays at the main checkout', async (t) => {
  const dir = await repo(t, { files })
  const nested = path.join(dir, '.claude', 'worktrees', 'y')
  git(dir, 'worktree', 'add', '-q', '-b', 'y', nested)
  await writeFiles(nested, { '.agent/checks.conf': `quick|unit|${fail}\n` })
  commitAll(nested, 'failing check')
  assert.equal(runtime(nested, 'task', 'start', '--slug', 'wt', '--route', 'FAST', '--summary', 'in the worktree').code, 0)
  assert.equal(runtime(nested, 'task', 'phase', 'implementing').code, 0)

  const start = hook('session-start', { hook_event_name: 'SessionStart', session_id: `wt-${process.pid}`, cwd: nested }, { projectDir: dir })
  const context = start.json.hookSpecificOutput.additionalContext
  assert.match(context, /## Current task: \d{4}-\d{2}-\d{2}-wt/)
  assert.match(context, /PAACM runtime: `node \.claude\/skills\/paacm\/scripts\/paacm\.mjs|PAACM runtime: `node "/)

  const stop = hook('stop-gate', { hook_event_name: 'Stop', session_id: `wt-${process.pid}`, cwd: nested, stop_hook_active: false }, { projectDir: dir })
  assert.equal(stop.json?.decision, 'block', "the worktree's failing gate blocks the stop")
  assert.match(stop.json.reason, /gate failed/)
})

test('the runtime never climbs out of a worktree into the checkout that contains it', async (t) => {
  const dir = await repo(t, { files })
  const nested = path.join(dir, '.claude', 'worktrees', 'old')
  git(dir, 'worktree', 'add', '-q', '-b', 'old', nested)
  await writeFiles(dir, { '.agent/paacm.json': '{}\n' })
  commitAll(dir, 'configure paacm')
  assert.equal(existsSync(path.join(nested, '.agent', 'paacm.json')), false, 'the worktree is on a commit without .agent/paacm.json')

  assert.equal(runtime(nested, 'task', 'start', '--slug', 'inner', '--route', 'FAST', '--summary', 'x').code, 0)
  const id = `${new Date().toISOString().slice(0, 10)}-inner`
  assert.equal(existsSync(path.join(nested, '.agent', 'tasks', id, 'state.json')), true)
  assert.equal(existsSync(path.join(dir, '.agent', 'tasks', id)), false)
})

test("the stop gate still holds the session's own task when the agent's cwd moves into a worktree or a sub-project", async (t) => {
  const dir = await repo(t, { files: { ...files, '.agent/checks.conf': `quick|unit|${fail}\n`, 'sub/.agent/paacm.json': '{}\n' } })
  const nested = path.join(dir, '.claude', 'worktrees', 'w')
  git(dir, 'worktree', 'add', '-q', '-b', 'w', nested)
  runtime(dir, 'task', 'start', '--slug', 'main', '--route', 'STANDARD', '--summary', 'x')
  runtime(dir, 'task', 'phase', 'implementing')
  const stop = (cwd, extra = {}) => hook('stop-gate', { hook_event_name: 'Stop', stop_hook_active: false, cwd, ...extra }, { projectDir: dir })
  assert.equal(stop(dir).json?.decision, 'block')
  assert.equal(stop(nested).json?.decision, 'block', "moving into a worktree without a task does not release the main checkout's failing gate")
  assert.equal(stop(path.join(dir, 'sub')).json?.decision, 'block', 'a sub-project folder of the same worktree does not move the project')
  const cursor = hook('stop-gate', { hook_event_name: 'stop', status: 'completed', loop_count: 0, workspace_roots: [dir], cwd: path.join(dir, 'sub') }, { projectDir: dir })
  assert.match(cursor.json.followup_message, /gate failed/)
})

test('with a session root that is not a git repository, edits and stops are judged by the repository they are in', async (t) => {
  const ws = tempDir(t)
  const app = path.join(ws, 'app')
  await writeFiles(app, { ...files, '.agent/checks.conf': `quick|unit|${fail}\n` })
  git(app, 'init', '-q')
  commitAll(app, 'base')
  approvedTask(app, 'ws')
  runtime(app, 'task', 'phase', 'implementing')
  assert.equal(decision(edit(ws, path.join(app, 'test', 'a.test.js'))), 'deny')
  assert.equal(decision(edit(ws, path.join(app, '.github', 'workflows', 'ci.yml'))), 'ask')
  const stop = hook('stop-gate', { hook_event_name: 'Stop', stop_hook_active: false, cwd: app }, { projectDir: ws })
  assert.equal(stop.json?.decision, 'block')
})

test('a nested .agent/paacm.json does not become a second set of protect rules', async (t) => {
  const dir = await repo(t, { files: { ...files, 'sub/test/b.test.js': 'ok\n' } })
  approvedTask(dir, 'nested-config')
  assert.equal(decision(edit(dir, path.join(dir, 'sub', '.agent', 'paacm.json'))), 'ask', 'creating it is a configuration change')
  await writeFiles(dir, { 'sub/.agent/paacm.json': JSON.stringify({ protect: { tests: [], config: [] } }) })
  assert.equal(decision(edit(dir, path.join(dir, 'sub', 'test', 'b.test.js'))), 'deny', 'the session project still judges files in its own worktree')
  assert.equal(decision(edit(dir, path.join(dir, 'sub', 'test', 'b.test.js'), { cwd: path.join(dir, 'sub') })), 'deny')
})

test('with a non-git session folder and cwd in one checkout, the other checkouts keep their rules, and an edited one holds the stop', async (t) => {
  const ws = tempDir(t)
  const checkout = async (name, check) => {
    const dir = path.join(ws, name)
    await writeFiles(dir, { ...files, '.agent/checks.conf': `quick|unit|${check}\n` })
    git(dir, 'init', '-q')
    commitAll(dir, 'base')
    approvedTask(dir, name)
    runtime(dir, 'task', 'phase', 'implementing')
    return dir
  }
  const app = await checkout('app', pass)
  const other = await checkout('other', fail)
  const session = `ws-${process.pid}`
  assert.equal(decision(edit(ws, path.join(other, 'test', 'a.test.js'), { cwd: app })), 'deny', "the sibling checkout's approved tests")
  assert.equal(decision(edit(ws, path.join(other, '.github', 'workflows', 'ci.yml'), { cwd: app })), 'ask')

  const stop = () => hook('stop-gate', { hook_event_name: 'Stop', session_id: session, stop_hook_active: false, cwd: app }, { projectDir: ws })
  assert.notEqual(stop().json?.decision, 'block', 'a checkout this session never edited does not hold its stop')
  hook('post-edit', { hook_event_name: 'PostToolUse', session_id: session, tool_name: 'Edit', tool_input: { file_path: path.join(other, 'src', 'a.js') }, cwd: app }, { projectDir: ws })
  const held = stop()
  assert.equal(held.json?.decision, 'block', 'the edited checkout with a failing gate holds the stop')
  assert.match(held.json.reason, /gate failed/)
})
