import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { commitAll, git, read, readOrNull, repo, runtime, writeFiles } from './helpers.mjs'

const pass = 'node -e "process.exit(0)"'
const fail = 'node -e "process.exit(1)"'
const state = async (dir, id) => JSON.parse(await read(dir, `.agent/tasks/${id}/state.json`))
const today = () => new Date().toISOString().slice(0, 10)

async function project(t, { checks = `quick|unit|${pass}\n`, files = {} } = {}) {
  return repo(t, { files: { '.agent/checks.conf': checks, 'src/a.js': 'export const a = 1\n', 'test/a.test.js': 'ok\n', ...files } })
}

test('task start creates the task folder, the pointer and the ignore file, and refuses a second active task', async (t) => {
  const dir = await project(t)
  const r = runtime(dir, 'task', 'start', '--slug', 'fix-a', '--route', 'standard', '--summary', 'Fix a')
  assert.equal(r.code, 0, r.out)
  const id = `${today()}-fix-a`
  assert.equal((await read(dir, '.agent/tasks/CURRENT')).trim(), id)
  const s = await state(dir, id)
  assert.equal(s.route, 'STANDARD')
  assert.equal(s.autonomy, 'L1')
  assert.equal(s.baseCommit, git(dir, 'rev-parse', 'HEAD'))
  assert.equal(await read(dir, '.agent/tasks/.gitignore'), '*\n')
  assert.equal(git(dir, 'status', '--porcelain'), '', 'task state stays out of git')
  const second = runtime(dir, 'task', 'start', '--slug', 'other', '--route', 'FAST', '--summary', 'x')
  assert.equal(second.code, 1)
  assert.match(second.stderr, /still triaged/)
})

test('task start validates its arguments, and high-stakes forces DEEP at L1', async (t) => {
  const dir = await project(t)
  assert.match(runtime(dir, 'task', 'start', '--slug', 'Bad Slug', '--route', 'FAST', '--summary', 'x').stderr, /--slug/)
  assert.match(runtime(dir, 'task', 'start', '--slug', 'x', '--route', 'HUGE', '--summary', 'x').stderr, /--route/)
  assert.equal(runtime(dir, 'task', 'start', '--slug', 'x', '--route', 'FAST', '--bogus').code, 2)
  const r = runtime(dir, 'task', 'start', '--slug', 'auth', '--route', 'FAST', '--high-stakes', '--autonomy', 'L3', '--summary', 'auth change')
  assert.equal(r.code, 0, r.out)
  const s = await state(dir, `${today()}-auth`)
  assert.equal(s.route, 'DEEP')
  assert.equal(s.autonomy, 'L1')
  assert.equal(s.highStakes, true)
})

test('approving tests needs a commit and committed test files', async (t) => {
  const empty = await repo(t, { commit: false })
  runtime(empty, 'task', 'start', '--slug', 'x', '--route', 'FAST', '--summary', 'x')
  assert.match(runtime(empty, 'task', 'approve-tests').stderr, /no commits yet/)

  const dir = await project(t)
  runtime(dir, 'task', 'start', '--slug', 'x', '--route', 'STANDARD', '--summary', 'x')
  await writeFiles(dir, { 'test/new.test.js': 'new\n' })
  assert.match(runtime(dir, 'task', 'approve-tests').stderr, /commit the tests before approving them; uncommitted test files: test\/new\.test\.js/)
  const sha = commitAll(dir, 'tests')
  assert.equal(runtime(dir, 'task', 'approve-tests').code, 0)
  assert.equal((await state(dir, `${today()}-x`)).testsApprovedAt, sha)
})

test('the gate exits 0, 1, 2, 3 or 4 and counts consecutive failures up to the retry cap', async (t) => {
  const dir = await project(t, { checks: `quick|unit|${fail}\n` })
  const id = `${today()}-g`
  runtime(dir, 'task', 'start', '--slug', 'g', '--route', 'STANDARD', '--summary', 'gate')

  for (let i = 1; i <= 3; i++) {
    const r = runtime(dir, 'gate')
    assert.equal(r.code, 1)
    assert.equal((await state(dir, id)).gateFailures, i)
    if (i === 3) assert.match(r.stdout, /RETRY CAP REACHED: 3 consecutive failures/)
  }

  await writeFiles(dir, { '.agent/checks.conf': `quick|unit|${pass}\n` })
  commitAll(dir)
  assert.equal(runtime(dir, 'gate').code, 0)
  const s = await state(dir, id)
  assert.equal(s.gateFailures, 0)
  assert.equal(s.lastGate.passed, true)

  assert.equal(runtime(dir, 'gate', '--tier', 'full').code, 3, 'a tier without checks fails closed')

  await writeFiles(dir, { '.agent/checks.conf': 'quick|unit\n' })
  assert.equal(runtime(dir, 'gate').code, 2, 'a malformed manifest is a configuration error')
  await writeFiles(dir, { '.agent/checks.conf': `quick|unit|${pass}\n` })

  assert.equal(runtime(dir, 'task', 'approve-tests').code, 0)
  await writeFiles(dir, { 'test/a.test.js': 'weakened\n' })
  commitAll(dir, 'edit a test')
  const p = runtime(dir, 'gate')
  assert.equal(p.code, 4)
  assert.match(p.stdout, /PROTECTED test\/a\.test\.js changed after the tests were approved/)
  assert.equal(runtime(dir, 'audit').code, 4)
})

test('a DEEP task is gated on the full tier', async (t) => {
  const dir = await project(t)
  runtime(dir, 'task', 'start', '--slug', 'd', '--route', 'DEEP', '--summary', 'deep')
  const r = runtime(dir, 'gate', '--json')
  assert.equal(r.code, 3)
  assert.equal(JSON.parse(r.stdout).tier, 'full')
})

test('task done requires a passing gate at the current commit with a clean tree', async (t) => {
  const dir = await project(t)
  const id = `${today()}-done`
  runtime(dir, 'task', 'start', '--slug', 'done', '--route', 'FAST', '--summary', 'x')
  assert.match(runtime(dir, 'task', 'done').stderr, /latest gate did not pass/)
  await writeFiles(dir, { 'src/a.js': 'export const a = 2\n' })
  assert.equal(runtime(dir, 'gate').code, 0)
  assert.match(runtime(dir, 'task', 'done').stderr, /uncommitted changes since the gate: src\/a\.js/)
  commitAll(dir)
  assert.match(runtime(dir, 'task', 'done').stderr, /HEAD is now/)
  assert.equal(runtime(dir, 'gate').code, 0)
  assert.equal(runtime(dir, 'task', 'done').code, 0)
  assert.equal((await state(dir, id)).status, 'done')
  assert.equal(await readOrNull(dir, '.agent/tasks/CURRENT'), null)
})

test('block records the trigger and clears the pointer; resume brings the task back', async (t) => {
  const dir = await project(t)
  const id = `${today()}-blk`
  runtime(dir, 'task', 'start', '--slug', 'blk', '--route', 'STANDARD', '--summary', 'x')
  assert.equal(runtime(dir, 'task', 'block', '--trigger', '8', '--reason', 'x').code, 1)
  const b = runtime(dir, 'task', 'block', '--trigger', '2', '--reason', 'no database')
  assert.equal(b.code, 0)
  assert.match(b.stdout, /BLOCKED: trigger 2 — no database/)
  assert.equal((await state(dir, id)).status, 'blocked')
  assert.equal(await readOrNull(dir, '.agent/tasks/CURRENT'), null)
  assert.equal(runtime(dir, 'task', 'resume', id).code, 0)
  assert.equal(runtime(dir, 'task', 'phase', 'implementing').code, 0)
  const s = await state(dir, id)
  assert.equal(s.status, 'implementing')
  assert.equal(s.blocked, null)
  assert.match(await read(dir, `.agent/tasks/${id}/progress.md`), /BLOCKED: trigger 2 — no database[\s\S]*resumed[\s\S]*blocked → implementing/)
})

test('review-input gives the reviewer the diff, the acceptance criteria and the gate result', async (t) => {
  const dir = await project(t)
  const id = `${today()}-rev`
  runtime(dir, 'task', 'start', '--slug', 'rev', '--route', 'STANDARD', '--summary', 'x')
  await writeFiles(dir, { [`.agent/tasks/${id}/SPEC.md`]: '# Spec\n\n## 6. Acceptance criteria\n\n1. a is 2\n\n## 7. Done when\n\nnpm test\n', 'src/a.js': 'export const a = 2\n' })
  runtime(dir, 'gate')
  const r = runtime(dir, 'task', 'review-input')
  assert.equal(r.code, 0)
  const text = await read(dir, r.stdout.trim())
  assert.match(text, /1\. a is 2/)
  assert.doesNotMatch(text, /npm test/, 'only the acceptance criteria section is included')
  assert.match(text, /-export const a = 1\n\+export const a = 2/)
  assert.match(text, /Latest gate: tier quick, passed/)
  assert.match(text, /- src\/a\.js/)
})

test('the audit warns about executable configuration changed during the task', async (t) => {
  const dir = await project(t)
  runtime(dir, 'task', 'start', '--slug', 'cfg', '--route', 'STANDARD', '--summary', 'x')
  await writeFiles(dir, { '.github/workflows/ci.yml': 'on: push\n' })
  const r = runtime(dir, 'audit', '--json')
  assert.equal(r.code, 0)
  assert.deepEqual(JSON.parse(r.stdout).warnings, [{ path: '.github/workflows/ci.yml', kind: 'config' }])
})

test('the runtime finds the project root from a subfolder, and check validates its arguments', async (t) => {
  const dir = await project(t)
  await mkdir(path.join(dir, 'src', 'deep'), { recursive: true })
  const r = runtime(path.join(dir, 'src', 'deep'), 'check', '--list')
  assert.equal(r.code, 0)
  assert.match(r.stdout, /quick \| unit \|/)
  assert.equal(runtime(dir, 'check').code, 2)
  assert.equal(runtime(dir, 'check', '--tier', 'nightly').code, 2)
  assert.equal(runtime(dir, 'check', '--tier', 'full').code, 3)
  assert.equal(runtime(dir, 'nonsense').code, 2)
  assert.ok(!existsSync(path.join(dir, 'src', 'deep', '.agent')))
})
