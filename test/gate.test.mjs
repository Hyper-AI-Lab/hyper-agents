// Gate output: a short form for agents (`--quiet`) with the full output kept in
// the task folder, and a missing tool reported as the environment, not the code.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hook, read, repo, runtime } from './helpers.mjs'

const today = () => new Date().toISOString().slice(0, 10)
const noisy = `quick|noisy|node -e "for (let i = 0; i < 100; i++) console.log('line ' + i)"`
const bad = `quick|bad|node -e "console.log('boom'); process.exit(1)"`

test('gate --quiet prints the check lines and the failing tail; the full output is saved in the task folder', async (t) => {
  const dir = await repo(t, { files: { '.agent/checks.conf': `${noisy}\n${bad}\n` } })
  runtime(dir, 'task', 'start', '--slug', 'q', '--route', 'FAST', '--summary', 'x')
  const r = runtime(dir, 'gate', '--quiet')
  assert.equal(r.code, 1)
  assert.match(r.stdout, /PASS \[quick\] noisy/)
  assert.doesNotMatch(r.stdout, /line 50/, 'passing output is not printed')
  assert.match(r.stdout, /FAIL \[quick\] bad exit 1[\s\S]*boom/)
  assert.match(r.stdout, /Full output: \.agent\/tasks\/.*-q\/gate\.log/)
  assert.match(r.stdout, /paacm gate: exit 1\n$/)
  const log = await read(dir, `.agent/tasks/${today()}-q/gate.log`)
  assert.match(log, /line 50[\s\S]*boom[\s\S]*FAILED: bad/)

  const full = runtime(dir, 'gate')
  assert.match(full.stdout, /line 50/, 'without --quiet the output streams as before')
})

test('check --quiet prints the check lines and the failing tail only', async (t) => {
  const dir = await repo(t, { files: { '.agent/checks.conf': `${noisy}\n${bad}\n` } })
  const r = runtime(dir, 'check', '--tier', 'quick', '--quiet')
  assert.equal(r.code, 1)
  assert.doesNotMatch(r.stdout, /line 50/)
  assert.match(r.stdout, /FAIL \[quick\] bad[\s\S]*boom[\s\S]*paacm check: exit 1/)
})

test('a check whose program is missing is reported as a missing tool, not as failing code', async (t) => {
  const dir = await repo(t, { files: { '.agent/checks.conf': 'quick|tool|definitely-missing-tool-xyz --version\n' } })
  runtime(dir, 'task', 'start', '--slug', 'm', '--route', 'FAST', '--summary', 'x')
  runtime(dir, 'task', 'phase', 'implementing')
  const r = runtime(dir, 'gate')
  assert.match(r.stdout, /HINT \[quick\] tool: a command was not found[\s\S]*not the code[\s\S]*CHECKS NOT RUN[\s\S]*trigger 2/)
  const stop = hook('stop-gate', { hook_event_name: 'Stop', stop_hook_active: false }, { projectDir: dir })
  assert.match(stop.json.reason, /a command was not found[\s\S]*trigger 2/)
  assert.doesNotMatch(stop.json.reason, /Fix the cause without editing tests/)
})
