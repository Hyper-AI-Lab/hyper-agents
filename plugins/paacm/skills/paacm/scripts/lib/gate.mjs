// The gate: the protected-path audit followed by the check tier for the current
// task's route. The result and the consecutive-failure count are recorded in the
// task state. Exit codes: 0 passed, 1 a check failed, 2 invalid configuration,
// 3 a required tier has no checks, 4 a protected test file changed.
import path from 'node:path'
import { auditTask } from './audit.mjs'
import { MANIFEST_PATH, missingTiers, parseManifest } from './checks.mjs'
import { loadConfig, TIERS } from './config.mjs'
import { readTextOrNull, sha256 } from './fs.mjs'
import { git, head, uncommittedPaths } from './git.mjs'
import { runChecks } from './runner.mjs'
import { currentTask, writeState } from './task.mjs'

export const GATE = { PASSED: 0, FAILED: 1, CONFIG: 2, UNCONFIGURED: 3, PROTECTED: 4 }

export async function loadChecks(projectDir) {
  const text = await readTextOrNull(path.join(projectDir, ...MANIFEST_PATH.split('/')))
  if (text === null) return []
  return parseManifest(text)
}

// Identifies the exact state of the working tree: HEAD plus every uncommitted
// change (tracked diffs and untracked files). Task files are excluded.
export function worktreeFingerprint(projectDir) {
  const tracked = git(projectDir, ['diff', '--no-color', 'HEAD', '--', '.', ':(exclude).agent/tasks'], { allowFail: true }).stdout
  const untracked = git(projectDir, ['ls-files', '--others', '--exclude-standard', '-z'], { allowFail: true }).stdout
  return sha256(`${head(projectDir) ?? ''}\0${tracked}\0${untracked}`)
}

// A gate result for this exact working tree recorded within `withinMs`, or null.
// The stop hook uses it so that the same stop event delivered twice (Cursor also
// runs Claude Code's hooks through its third-party import) neither runs the
// checks twice nor counts one failure twice.
export function recentGate(projectDir, state, withinMs = 15_000) {
  const g = state && state.lastGate
  if (!g || !g.fingerprint || !g.at) return null
  const age = Date.now() - Date.parse(g.at)
  if (!(age >= 0 && age < withinMs)) return null
  return g.fingerprint === worktreeFingerprint(projectDir) ? g : null
}

export function tierForRoute(config, state) {
  if (state && state.route === 'DEEP') return config.gate.deepTier
  return config.gate.tier
}

export async function runGate(projectDir, { tier, log = () => {}, sink } = {}) {
  let config
  let checks
  try {
    config = await loadConfig(projectDir)
    checks = await loadChecks(projectDir)
  } catch (error) {
    log(`CONFIG ERROR: ${error.message}`)
    return { code: GATE.CONFIG, error: error.message }
  }
  if (tier !== undefined && !TIERS.includes(tier)) {
    log(`CONFIG ERROR: unknown tier "${tier}"`)
    return { code: GATE.CONFIG, error: `unknown tier "${tier}"` }
  }
  const state = await currentTask(projectDir)
  const effectiveTier = tier ?? tierForRoute(config, state)
  const audit = auditTask(projectDir, config, state)
  const record = async (passed, failed) => {
    if (!state) return null
    state.gateFailures = passed ? 0 : (state.gateFailures ?? 0) + 1
    state.lastGate = {
      at: new Date().toISOString(),
      head: head(projectDir),
      tier: effectiveTier,
      passed,
      failed,
      dirty: uncommittedPaths(projectDir).some((p) => !p.startsWith('.agent/tasks/')),
      fingerprint: worktreeFingerprint(projectDir),
    }
    await writeState(projectDir, state)
    return state.gateFailures
  }

  for (const w of audit.warnings) log(`WARN protected configuration changed in this task: ${w.path} (the report must state who approved it)`)
  if (audit.violations.length) {
    for (const v of audit.violations) log(`PROTECTED ${v.path}${v.detail ? `: ${v.detail}` : ' changed after the tests were approved'}`)
    log('GATE FAILED: protected test files changed. Undo those edits, or stop with BLOCKED: trigger 4 if the change is needed.')
    const failures = await record(false, 'protected-paths')
    return { code: GATE.PROTECTED, tier: effectiveTier, audit, results: [], gateFailures: failures, retryCap: config.gate.retryCap, task: state }
  }

  const missing = missingTiers(checks, effectiveTier)
  if (missing.length) {
    log(`UNCONFIGURED: tier(s) ${missing.join(', ')} have no checks in ${MANIFEST_PATH}. Report them under CHECKS NOT RUN and ask the human to configure them.`)
    return { code: GATE.UNCONFIGURED, tier: effectiveTier, audit, missing, results: [], gateFailures: state?.gateFailures ?? 0, retryCap: config.gate.retryCap, task: state }
  }

  const run = await runChecks(projectDir, checks, effectiveTier, { timeoutSec: config.checks.timeoutSec, sink, log })
  const failures = await record(run.passed, run.failed)
  if (!run.passed && failures !== null && failures >= config.gate.retryCap) {
    log(`RETRY CAP REACHED: ${failures} consecutive failures. Stop trying; run paacm task block --trigger 5 --reason "<what fails>" and end your turn with BLOCKED.`)
  }
  return {
    code: run.passed ? GATE.PASSED : GATE.FAILED,
    tier: effectiveTier,
    audit,
    results: run.results,
    failed: run.failed,
    gateFailures: failures ?? 0,
    retryCap: config.gate.retryCap,
    task: state,
  }
}
