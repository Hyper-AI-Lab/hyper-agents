import assert from 'node:assert/strict'
import { test } from 'node:test'
import { missingTiers, parseManifest, tiersFor } from '../src/runtime/lib/checks.mjs'
import { runChecks, runOne } from '../src/runtime/lib/runner.mjs'
import { tempDir } from './helpers.mjs'

const node = (code) => `node -e ${JSON.stringify(code)}`

test('parseManifest reads tier|label|command lines, skipping comments and blank lines', () => {
  const checks = parseManifest('# comment\n\nquick|lint|npm run lint\n  # indented comment\nfull|e2e|a | b || c\n')
  assert.deepEqual(
    checks.map(({ tier, label, command }) => [tier, label, command]),
    [
      ['quick', 'lint', 'npm run lint'],
      ['full', 'e2e', 'a | b || c'],
    ],
  )
})

test('parseManifest accepts CRLF line endings and a byte-order mark (D4)', () => {
  const checks = parseManifest('﻿quick|a|echo a\r\nfull|b|echo b\r\n')
  assert.deepEqual(
    checks.map((c) => [c.tier, c.label, c.command]),
    [
      ['quick', 'a', 'echo a'],
      ['full', 'b', 'echo b'],
    ],
  )
})

test('parseManifest reports every malformed line at once, before anything runs (D2)', () => {
  assert.throws(
    () => parseManifest('quick|ok|true\nnope\nfast|x|true\nquick|bad label|true\nquick|ok|true\nquick|empty|\n'),
    (error) => {
      for (const part of ['line 2: expected tier|label|command', 'line 3: unknown tier "fast"', 'line 4: invalid label', 'line 5: duplicate label "ok"', 'line 6: empty command']) {
        assert.match(error.message, new RegExp(part.replace(/[|"]/g, '\\$&')))
      }
      return true
    },
  )
})

test('tiers are cumulative and a missing tier is reported', () => {
  assert.deepEqual(tiersFor('quick'), ['quick'])
  assert.deepEqual(tiersFor('security'), ['quick', 'full', 'security'])
  assert.throws(() => tiersFor('nightly'))
  const checks = parseManifest('quick|a|true\nsecurity|s|true\n')
  assert.deepEqual(missingTiers(checks, 'quick'), [])
  assert.deepEqual(missingTiers(checks, 'security'), ['full'])
})

test('a check that reads standard input gets end-of-file and cannot swallow later checks (D1)', async (t) => {
  const dir = tempDir(t)
  const checks = parseManifest(
    [
      `quick|reads-stdin|${node("let n=0;process.stdin.on('data',d=>n+=d.length).on('end',()=>process.exit(n===0?0:1))")}`,
      `quick|after|${node('process.exit(0)')}`,
    ].join('\n'),
  )
  const r = await runChecks(dir, checks, 'quick')
  assert.equal(r.passed, true)
  assert.deepEqual(
    r.results.map((x) => x.label),
    ['reads-stdin', 'after'],
  )
})

test('runChecks stops at the first failure and prints PASS, FAIL and a summary (D3)', async (t) => {
  const dir = tempDir(t)
  const checks = parseManifest([`quick|one|${node('process.exit(0)')}`, `quick|two|${node('console.log("boom");process.exit(3)')}`, `quick|three|${node('process.exit(0)')}`].join('\n'))
  const log = []
  const r = await runChecks(dir, checks, 'quick', { log: (l) => log.push(l) })
  assert.equal(r.passed, false)
  assert.equal(r.failed, 'two')
  assert.equal(r.skipped, 1)
  assert.equal(r.results[1].exitCode, 3)
  assert.match(r.results[1].outputTail, /boom/)
  assert.ok(log.some((l) => l.startsWith('PASS [quick] one')))
  assert.ok(log.some((l) => l.startsWith('FAIL [quick] two exit 3')))
  assert.equal(log.at(-1), 'FAILED: two (1 passed, 1 not run)')
})

test('runChecks runs only the tiers of the mode, in manifest order', async (t) => {
  const dir = tempDir(t)
  const checks = parseManifest([`full|f|${node('0')}`, `quick|q|${node('0')}`, `security|s|${node('0')}`].join('\n'))
  const r = await runChecks(dir, checks, 'full')
  assert.deepEqual(
    r.results.map((x) => x.label),
    ['f', 'q'],
  )
})

test('a check that exceeds the timeout is killed and reported with exit 124', async (t) => {
  const dir = tempDir(t)
  const started = Date.now()
  const r = await runOne(dir, { tier: 'quick', label: 'slow', command: node('setTimeout(()=>{},60000)') }, { timeoutSec: 1 })
  assert.equal(r.exitCode, 124)
  assert.equal(r.timedOut, true)
  assert.ok(Date.now() - started < 20_000)
})

test('a command that cannot start fails instead of passing', async (t) => {
  const dir = tempDir(t)
  const r = await runOne(dir, { tier: 'quick', label: 'missing', command: 'paacm-command-that-does-not-exist-123' })
  assert.notEqual(r.exitCode, 0)
})
