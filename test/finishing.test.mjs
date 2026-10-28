// Finishing a task: `paacm task done` closes only a task that went through its
// phases, has approved tests, a passing gate at the route's tier and a report
// that says done; the stop hook nudges an open task to finish (once), and the
// runtime says which reference to read next.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commitAll, hook, read, repo, runtime, stopGuidance, writeFiles } from './helpers.mjs'

const pass = 'node -e "process.exit(0)"'
const fail = 'node -e "process.exit(1)"'
const today = () => new Date().toISOString().slice(0, 10)
const done = (dir) => runtime(dir, 'task', 'done')
const report = (dir, id, outcome) => writeFiles(dir, { [`.agent/tasks/${id}/REPORT.md`]: `OUTCOME: ${outcome}\nROUTE / AUTONOMY: x\n` })

async function project(t, checks = `quick|unit|${pass}\nfull|e2e|${pass}\n`) {
  return repo(t, { files: { '.agent/checks.conf': checks, 'src/a.js': 'a\n', 'test/a.test.js': 'ok\n' } })
}

test('task done needs phase 8, approved tests, a passing gate and a REPORT.md that says done', async (t) => {
  const dir = await project(t)
  const id = `${today()}-std`
  runtime(dir, 'task', 'start', '--slug', 'std', '--route', 'STANDARD', '--summary', 'x')
  assert.match(done(dir).stderr, /task .*-std is triaged; a STANDARD task is done after phase 8[\s\S]*paacm task phase reviewing[\s\S]*08-review\.md/)
  runtime(dir, 'task', 'phase', 'reviewing')
  assert.match(done(dir).stderr, /tests were never approved[\s\S]*paacm task approve-tests/)
  runtime(dir, 'task', 'approve-tests')
  assert.match(done(dir).stderr, /latest gate did not pass/)
  assert.equal(runtime(dir, 'gate').code, 0)
  assert.match(done(dir).stderr, /write \.agent\/tasks\/.*-std\/REPORT\.md[\s\S]*09-deliver\.md/)
  await writeFiles(dir, { [`.agent/tasks/${id}/REPORT.md`]: 'OUTCOME: <done | blocked (trigger N)> — <one sentence>\n' })
  assert.match(done(dir).stderr, /REPORT\.md has no filled-in OUTCOME line/)
  await report(dir, id, 'blocked (trigger 2) — the e2e service is missing')
  assert.match(done(dir).stderr, /says blocked[\s\S]*paacm task block/)
  await report(dir, id, 'done — a fixed')
  const r = done(dir)
  assert.equal(r.code, 0, r.out)
  assert.equal(JSON.parse(await read(dir, `.agent/tasks/${id}/state.json`)).status, 'done')
})

test("task done needs a gate at the route's tier; a FAST task needs phase 7", async (t) => {
  const dir = await project(t)
  const deep = `${today()}-deep`
  runtime(dir, 'task', 'start', '--slug', 'deep', '--route', 'DEEP', '--summary', 'x')
  runtime(dir, 'task', 'approve-tests')
  runtime(dir, 'task', 'phase', 'reviewing')
  await report(dir, deep, 'done — x')
  assert.equal(runtime(dir, 'gate', '--tier', 'quick').code, 0)
  assert.match(done(dir).stderr, /last gate ran the quick tier; a DEEP task needs full or higher/)
  assert.equal(runtime(dir, 'gate').code, 0)
  assert.equal(done(dir).code, 0)

  const fast = `${today()}-fast`
  runtime(dir, 'task', 'start', '--slug', 'fast', '--route', 'FAST', '--summary', 'x')
  runtime(dir, 'task', 'approve-tests')
  assert.equal(runtime(dir, 'gate').code, 0)
  await report(dir, fast, 'done — x')
  assert.match(done(dir).stderr, /a FAST task is done after phase 7[\s\S]*paacm task phase verifying/)
  runtime(dir, 'task', 'phase', 'verifying')
  assert.equal(done(dir).code, 0)
})

test('stop gate: a STANDARD task still triaged with changed files is told to follow the phases, once', async (t) => {
  const dir = await project(t)
  runtime(dir, 'task', 'start', '--slug', 'tri', '--route', 'STANDARD', '--summary', 'x')
  const stop = (extra = {}) => hook('stop-gate', { hook_event_name: 'Stop', stop_hook_active: false, ...extra }, { projectDir: dir })
  assert.equal(stop().json, null, 'nothing changed yet: asking the human at intake is fine')
  await writeFiles(dir, { 'src/a.js': 'changed\n' })
  assert.match(stopGuidance(stop()), /still triaged[\s\S]*paacm task phase/)
  assert.equal(stop({ stop_hook_active: true }).json, null)
})

test('stop gate: a green gate does not end an open task without one nudge to finish', async (t) => {
  const dir = await project(t)
  runtime(dir, 'task', 'start', '--slug', 'open', '--route', 'STANDARD', '--summary', 'x')
  runtime(dir, 'task', 'phase', 'implementing')
  runtime(dir, 'task', 'approve-tests')
  await writeFiles(dir, { 'src/a.js': 'b\n' })
  commitAll(dir)
  assert.equal(runtime(dir, 'gate').code, 0)
  const claude = (extra = {}) => hook('stop-gate', { hook_event_name: 'Stop', stop_hook_active: false, ...extra }, { projectDir: dir })
  assert.match(stopGuidance(claude()), /gate is green, but task .*-open is still implementing[\s\S]*REPORT\.md[\s\S]*paacm task done[\s\S]*waiting for the human/)
  assert.equal(claude({ stop_hook_active: true }).json, null)

  // Cursor also runs the imported Claude Code hooks: the same stop arrives twice and is nudged once.
  await writeFiles(dir, { 'src/a.js': 'c\n' })
  commitAll(dir)
  assert.equal(runtime(dir, 'gate').code, 0)
  const cursor = hook('stop-gate', { hook_event_name: 'stop', status: 'completed', loop_count: 0, workspace_roots: [dir] }, { projectDir: dir })
  assert.match(cursor.json.followup_message, /paacm task done/)
  assert.equal(claude().json, null, 'the duplicate stop is not nudged again')
})

test("stop gate: a green gate below the route's tier does not count", async (t) => {
  const dir = await project(t, `quick|unit|${pass}\nfull|e2e|${fail}\n`)
  runtime(dir, 'task', 'start', '--slug', 'tier', '--route', 'DEEP', '--summary', 'x')
  runtime(dir, 'task', 'phase', 'implementing')
  assert.equal(runtime(dir, 'gate', '--tier', 'quick').code, 0)
  const r = hook('stop-gate', { hook_event_name: 'Stop', stop_hook_active: false }, { projectDir: dir })
  assert.match(r.json.reason, /PAACM gate failed \(attempt 1 of 3\)[\s\S]*e2e/)
})

test('the runtime says which reference to read next', async (t) => {
  const dir = await project(t)
  const start = runtime(dir, 'task', 'start', '--slug', 'hint', '--route', 'STANDARD', '--summary', 'x')
  assert.match(start.stdout, /References: [\s\S]*09-deliver\.md[\s\S]*paacm task done/)
  runtime(dir, 'task', 'phase', 'testing')
  assert.match(runtime(dir, 'task', 'approve-tests').stdout, /status implementing\nNext: read \S*06-implement\.md/, 'approve-tests says the task moved on')
  assert.match(runtime(dir, 'task', 'phase', 'implementing').stdout, /Next: read \S*06-implement\.md/)
  await writeFiles(dir, { '.agent/extensions/07-verify.md': '# Verify here\n' })
  assert.match(runtime(dir, 'task', 'phase', 'verifying').stdout, /Next: read \S*07-verify\.md and \.agent\/extensions\/07-verify\.md/)
  assert.match(runtime(dir, 'gate').stdout, /Next: phase 8, review[\s\S]*paacm task phase reviewing[\s\S]*08-review\.md/)
  runtime(dir, 'task', 'phase', 'reviewing')
  assert.match(runtime(dir, 'gate').stdout, /Next: phase 9, deliver[\s\S]*09-deliver\.md[\s\S]*paacm task done/)
  assert.doesNotMatch(runtime(dir, 'gate', '--json').stdout, /Next:/)
})

test('the stop gate keeps the result of the gate it ran itself when it then nudges', async (t) => {
  const dir = await project(t, `quick|unit|${fail}\nfull|e2e|${pass}\n`)
  const id = `${today()}-own`
  runtime(dir, 'task', 'start', '--slug', 'own', '--route', 'STANDARD', '--summary', 'x')
  runtime(dir, 'task', 'phase', 'implementing')
  runtime(dir, 'gate')
  runtime(dir, 'gate')
  await writeFiles(dir, { '.agent/checks.conf': `quick|unit|${pass}\nfull|e2e|${pass}\n` })
  commitAll(dir, 'fix the check')
  const stop = hook('stop-gate', { hook_event_name: 'Stop', stop_hook_active: false }, { projectDir: dir })
  assert.match(stopGuidance(stop), /gate is green/)
  const state = JSON.parse(await read(dir, `.agent/tasks/${id}/state.json`))
  assert.equal(state.lastGate.passed, true, 'the passing gate the hook ran is kept')
  assert.equal(state.gateFailures, 0)
  assert.equal(state.lastNudge.kind, 'finish')
})
