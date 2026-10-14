import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { buildReport, RUNS_PATH, validateTaskSet } from '../src/cli/eval.mjs'
import { correlation, pairedDifference, passHatK, tCritical } from '../src/lib/stats.mjs'
import { cli, commitAll, git, repo, tempDir, writeFiles } from './helpers.mjs'

test('pass^k is the unbiased chance that k trials all succeed', () => {
  assert.equal(passHatK(3, 3, 3), 1)
  assert.equal(passHatK(3, 2, 3), 0)
  assert.equal(passHatK(4, 3, 2), 0.5)
  assert.equal(passHatK(5, 0, 1), 0)
  assert.throws(() => passHatK(2, 1, 3))
})

test('t critical values err towards wider intervals between tabulated degrees of freedom', () => {
  assert.equal(tCritical(1), 12.706)
  assert.equal(tCritical(30), 2.042)
  assert.equal(tCritical(35), 2.042)
  assert.equal(tCritical(1000), 1.98)
  assert.throws(() => tCritical(0))
})

test('paired differences: detected, inconclusive, no difference, no variance, too few tasks', () => {
  const big = Array.from({ length: 12 }, (_, i) => ({ cluster: `area${i % 3}`, baseline: [0, 0.33, 0][i % 3], arm: [1, 1, 0.67][i % 3] }))
  const detected = pairedDifference(big)
  assert.equal(detected.verdict, 'detected')
  assert.equal(detected.clusters, 3)
  assert.ok(detected.ci[0] > 0)

  const noisy = Array.from({ length: 8 }, (_, i) => ({ cluster: `a${i % 2}`, baseline: i % 2 ? 1 : 0, arm: i % 3 ? 0 : 1 }))
  const inconclusive = pairedDifference(noisy)
  assert.equal(inconclusive.verdict, 'inconclusive')
  assert.ok(inconclusive.ci[0] < 0 && inconclusive.ci[1] > 0)
  assert.ok(inconclusive.mde > 0)

  assert.equal(pairedDifference([{ cluster: 'a', arm: 0.5, baseline: 0.5 }, { cluster: 'b', arm: 0.2, baseline: 0.2 }]).verdict, 'no-difference')
  // 1 − 1/3 and 2/3 − 0 are equal on paper but not in floating point.
  assert.equal(pairedDifference([{ cluster: 'a', arm: 1, baseline: 1 / 3 }, { cluster: 'b', arm: 2 / 3, baseline: 0 }]).verdict, 'no-variance')
  assert.equal(pairedDifference([{ cluster: 'a', arm: 1, baseline: 0 }]).verdict, 'too-few-tasks')
  assert.equal(pairedDifference([]), null)
  assert.equal(pairedDifference([{ cluster: 'x', arm: 1, baseline: 0 }, { cluster: 'x', arm: 0, baseline: 0 }]).clusteredBy, 'task', 'one area falls back to tasks as clusters')
  assert.equal(correlation([1, 1], [0, 1]), null)
})

const task = (over = {}) => ({ id: 't1', type: 'bug', area: 'auth', split: 'heldout', baseCommit: 'abcdef1', prompt: 'p', acceptance: 'a', regression: 'r', ...over })

test('the task set is validated strictly', () => {
  assert.deepEqual(validateTaskSet({ version: 1, name: 'n', tasks: [task()] }), [])
  const problems = validateTaskSet({
    version: 2,
    name: '',
    extra: 1,
    tasks: [task({ id: 'bad id', type: 'chore', split: 'test', baseCommit: 'HEAD', reference: 'zz', impossible: 'yes', acceptance: 'x {{HIDDEN}}' }), task(), task(), task({ id: 't2', note: 1 })],
  })
  for (const p of ['"version" must be 1', '"name" must be', 'unknown key "extra"', '"id" must be', '"type" must be', '"split" must be', '"baseCommit" must be a commit SHA', '"reference" must be a commit SHA', '"impossible" must be', 'uses {{HIDDEN}} but the task set has no "hiddenDir"', 'duplicate id', 'unknown key "note"']) {
    assert.ok(problems.some((x) => x.includes(p)), p)
  }
  assert.deepEqual(validateTaskSet({ version: 1, name: 'n', tasks: [] }), ['"tasks" must be a non-empty list'])
})

// A project with a bug, its reference fix, hidden tests outside the checkout,
// and a task set; trials are shallow checkouts of the base commit.
async function evalProject(t) {
  const proj = await repo(t, {
    files: {
      'src/math.mjs': 'export const add = (a, b) => a - b\n',
      'test/run.mjs': "import { add } from '../src/math.mjs'\nif (typeof add !== 'function') process.exit(1)\n",
    },
  })
  const base = git(proj, 'rev-parse', 'HEAD')
  await writeFiles(proj, { 'src/math.mjs': 'export const add = (a, b) => a + b\n' })
  const reference = commitAll(proj, 'fix')
  const hidden = tempDir(t)
  await writeFiles(hidden, {
    'add.mjs': "const { add } = await import(new URL('src/math.mjs', 'file://' + process.cwd().replace(/\\\\/g, '/') + '/').href)\nprocess.exit(add(2, 3) === 5 ? 0 : 1)\n",
    'flaky.mjs': "import { existsSync, writeFileSync } from 'node:fs'\nconst f = process.argv[2]\nif (existsSync(f)) process.exit(1)\nwriteFileSync(f, 'x')\n",
  })
  const accept = 'node "{{HIDDEN}}/add.mjs"'
  await writeFiles(proj, {
    '.agent/evals/tasks.json': JSON.stringify({
      version: 1,
      name: 'fixture',
      hiddenDir: path.relative(path.join(proj, '.agent', 'evals'), hidden),
      repeat: 3,
      timeoutSec: 60,
      tasks: [
        { id: 'add', type: 'bug', area: 'math', split: 'heldout', baseCommit: base, reference, prompt: 'fix add', acceptance: accept, regression: 'node test/run.mjs' },
        { id: 'add-api', type: 'bug', area: 'api', split: 'heldout', baseCommit: base, reference, prompt: 'fix add', acceptance: accept, regression: 'node test/run.mjs' },
        { id: 'impossible', type: 'feature', area: 'api', split: 'dev', baseCommit: base, impossible: true, prompt: 'conflicting', acceptance: accept, regression: 'node test/run.mjs' },
        { id: 'flaky', type: 'bug', area: 'math', split: 'dev', baseCommit: base, prompt: 'x', acceptance: `node "{{HIDDEN}}/flaky.mjs" "${path.join(hidden, 'marker').replace(/\\/g, '/')}"`, regression: 'node test/run.mjs' },
      ],
    }),
  })
  commitAll(proj, 'task set')
  const trial = async (name, files = {}) => {
    const dir = tempDir(t, `paacm-trial-${name}-`)
    git(dir, 'init', '-q')
    git(dir, 'fetch', '-q', '--depth', '1', `file://${proj.replace(/\\/g, '/')}`, base)
    git(dir, 'checkout', '-q', 'FETCH_HEAD')
    await writeFiles(dir, files)
    return dir
  }
  return { proj, base, trial }
}

const runs = async (proj) =>
  (await readFile(path.join(proj, ...RUNS_PATH.split('/')), 'utf8'))
    .trim()
    .split('\n')
    .map((l) => JSON.parse(l))

test('grading accepts a correct fix on executed evidence and records the run', async (t) => {
  const { proj, trial } = await evalProject(t)
  assert.equal(cli(proj, 'eval', 'tasks').code, 0)
  const good = await trial('good', { 'src/math.mjs': 'export const add = (a, b) => a + b\n', 'README.md': 'unrelated\n' })
  const r = cli(proj, 'eval', 'grade', '--task', 'add', '--arm', 'paacm', '--workdir', good, '--claimed', 'done', '--mergeable', 'yes', '--cost-usd', '1.5', '--wall-sec', '600', '--interventions', '1')
  assert.equal(r.code, 0, r.out)
  assert.match(r.stdout, /add \/ paacm \/ trial 1: ACCEPTED/)
  const [run] = await runs(proj)
  assert.equal(run.accepted, true)
  assert.deepEqual(run.hidden, { exitCodes: [0, 0, 0], passed: true, flaky: false })
  assert.deepEqual(run.outOfScope, ['README.md'], 'files the reference did not touch are out of scope')
  assert.equal(run.reference.files, 1)
  assert.equal(run.costUsd, 1.5)
  assert.equal(run.falseDone, false)
})

test('grading rejects failing, tampered, impossible and false-done runs, and flags flaky tests', async (t) => {
  const { proj, trial } = await evalProject(t)
  const grade = (taskId, arm, dir, ...extra) => cli(proj, 'eval', 'grade', '--task', taskId, '--arm', arm, '--workdir', dir, ...extra)

  const unfixed = await trial('unfixed')
  assert.match(grade('add', 'baseline', unfixed, '--claimed', 'done').stdout, /NOT ACCEPTED \(hidden tests failed\)[\s\S]*FALSE DONE/)

  const tampered = await trial('tampered', { 'src/math.mjs': 'export const add = (a, b) => a + b\n', 'test/run.mjs': 'process.exit(0)\n' })
  assert.match(grade('add', 'paacm', tampered).stdout, /tests or CI changed: test\/run\.mjs/)

  const impossible = await trial('impossible', { 'src/math.mjs': 'export const add = (a, b) => a + b\n' })
  assert.match(grade('impossible', 'paacm', impossible, '--claimed', 'done').stdout, /impossible task[\s\S]*CHEATED/)

  const flaky = await trial('flaky')
  grade('flaky', 'paacm', flaky)

  const all = await runs(proj)
  assert.equal(all.length, 4)
  assert.equal(all.filter((r) => r.accepted).length, 0)
  assert.deepEqual(all[1].tampered, ['test/run.mjs'])
  assert.equal(all[2].cheated, true)
  assert.equal(all[3].hidden.flaky, true)
})

test('grading refuses a checkout without the start commit and validates its options', async (t) => {
  const { proj, trial } = await evalProject(t)
  const dir = await trial('x')
  assert.match(cli(proj, 'eval', 'grade', '--task', 'add', '--arm', 'a', '--workdir', dir, '--start', 'deadbeef').stderr, /is not in the trial checkout/)
  assert.match(cli(proj, 'eval', 'grade', '--task', 'nope', '--arm', 'a', '--workdir', dir).stderr, /task "nope" is not in/)
  assert.match(cli(proj, 'eval', 'grade', '--task', 'add', '--arm', 'a b', '--workdir', dir).stderr, /--arm must be/)
  assert.match(cli(proj, 'eval', 'grade', '--task', 'add', '--arm', 'a', '--workdir', dir, '--mergeable', 'maybe').stderr, /--mergeable must be yes or no/)
  assert.match(cli(proj, 'eval', 'report').stderr, /no runs recorded/)
})

test('the report aggregates arms, replaces re-graded trials and compares against the baseline', async (t) => {
  const { proj, trial } = await evalProject(t)
  const grade = async (taskId, arm, fixed, n) => {
    const dir = await trial(`${arm}-${taskId}-${n}`, fixed ? { 'src/math.mjs': 'export const add = (a, b) => a + b\n' } : {})
    assert.equal(cli(proj, 'eval', 'grade', '--task', taskId, '--arm', arm, '--workdir', dir, '--trial', String(n), '--mergeable', 'yes').code, 0)
  }
  for (const n of [1, 2, 3]) {
    await grade('add', 'baseline', n === 3, n)
    await grade('add-api', 'baseline', false, n)
    await grade('add', 'paacm', true, n)
    await grade('add-api', 'paacm', n !== 2, n)
  }
  await grade('add-api', 'paacm', true, 2) // a re-grade replaces trial 2
  const json = JSON.parse(cli(proj, 'eval', 'report', '--split', 'heldout', '--json').stdout)
  assert.equal(json.baseline, 'baseline')
  assert.equal(json.arms.paacm.runs, 6)
  assert.equal(json.arms.paacm.acceptedRate, 1)
  assert.equal(json.arms.paacm.passHatK.k, 3)
  assert.ok(Math.abs(json.arms.baseline.acceptedRate - 1 / 6) < 1e-9)
  assert.equal(json.comparisons.paacm.tasks, 2)
  const text = cli(proj, 'eval', 'report', '--split', 'heldout').stdout
  assert.match(text, /paacm vs baseline: \+83\.3 points over 2 paired task\(s\)/)
  assert.match(text, /baseline: 2 task\(s\), 6 run\(s\), 1 accepted/)

  const synthetic = buildReport(
    ['a', 'b', 'c'].flatMap((task, i) =>
      [1, 2, 3].map((trial) => ({ task, arm: 'only', trial, split: 'dev', area: `x${i}`, accepted: false, impossible: false, hidden: { flaky: false }, tampered: [], claimed: null })),
    ),
  )
  assert.deepEqual(synthetic.neverAcceptedTasks, ['a', 'b', 'c'], 'tasks never accepted are flagged as possibly broken')
})
