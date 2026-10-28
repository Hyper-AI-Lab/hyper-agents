// Session baselines: the working tree as it was when a session started, kept in
// the clone's own git directory (per worktree, private to the clone's owner),
// never in a temporary folder that other accounts on the machine share.
import assert from 'node:assert/strict'
import { existsSync, readdirSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { git, hook, repo, tempDir, writeFiles } from './helpers.mjs'

const files = { '.agent/checks.conf': 'quick|unit|node -e "process.exit(0)"\n', 'src/a.js': 'a\n' }
let n = 0
const sessionId = () => `sessions-${process.pid}-${++n}`
const posix = process.platform !== 'win32'

function start(dir, id, tmp) {
  const env = tmp ? { TMPDIR: tmp, TMP: tmp, TEMP: tmp } : {}
  return hook('session-start', { hook_event_name: 'SessionStart', session_id: id, source: 'startup', cwd: dir }, { projectDir: dir, env })
}

test("a session baseline is kept in the clone's git directory, private to its owner, and never in the temporary folder", async (t) => {
  const dir = await repo(t, { files })
  const tmp = tempDir(t)
  assert.equal(start(dir, sessionId(), tmp).code, 0)
  const sessions = path.join(git(dir, 'rev-parse', '--absolute-git-dir'), 'paacm-sessions')
  const recorded = readdirSync(sessions).filter((f) => f.endsWith('.json'))
  assert.equal(recorded.length, 1)
  assert.equal(existsSync(path.join(tmp, 'paacm-sessions')), false)
  if (posix) {
    assert.equal(statSync(sessions).mode & 0o777, 0o700)
    assert.equal(statSync(path.join(sessions, recorded[0])).mode & 0o777, 0o600)
  }

  const linked = path.join(tempDir(t), 'wt')
  git(dir, 'worktree', 'add', '-q', '-b', 'wt', linked)
  assert.equal(start(linked, sessionId(), tmp).code, 0)
  const own = path.join(git(linked, 'rev-parse', '--absolute-git-dir'), 'paacm-sessions')
  assert.notEqual(own, sessions, 'each worktree has its own git directory')
  assert.equal(readdirSync(own).filter((f) => f.endsWith('.json')).length, 1)
})

test('session start still gives its context when the baseline cannot be recorded, and the stop hook falls back', async (t) => {
  const dir = await repo(t, { files })
  writeFileSync(path.join(git(dir, 'rev-parse', '--absolute-git-dir'), 'paacm-sessions'), 'not a folder\n')
  const id = sessionId()
  const r = start(dir, id)
  assert.equal(r.code, 0, r.stderr)
  const context = r.json.hookSpecificOutput.additionalContext
  assert.match(context, /# PAACM session context/)
  assert.match(context, /## Repository/)
  assert.match(context, /could not record the session baseline/)

  await writeFiles(dir, { 'src/b.js': 'new\n' })
  const stop = hook('stop-gate', { hook_event_name: 'Stop', session_id: id, stop_hook_active: false, cwd: dir }, { projectDir: dir })
  assert.match(stop.json.reason, /have uncommitted changes/, 'without a baseline every uncommitted file is listed')
})

test('baselines older than 30 days are removed when a session starts', async (t) => {
  const dir = await repo(t, { files })
  const sessions = path.join(git(dir, 'rev-parse', '--absolute-git-dir'), 'paacm-sessions')
  await mkdir(sessions, { recursive: true })
  const day = 24 * 60 * 60
  const now = Date.now() / 1000
  for (const [name, age] of [
    ['old.json', 31 * day],
    ['recent.json', 1 * day],
  ]) {
    const file = path.join(sessions, name)
    writeFileSync(file, '{"files":{}}')
    utimesSync(file, now - age, now - age)
  }
  assert.equal(start(dir, sessionId()).code, 0)
  assert.equal(existsSync(path.join(sessions, 'old.json')), false)
  assert.equal(existsSync(path.join(sessions, 'recent.json')), true)
})
