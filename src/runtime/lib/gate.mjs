// The gate: the protected-path audit followed by the check tier for the current
// task's route. The result and the consecutive-failure count are recorded in the
// task state. Exit codes: 0 passed, 1 a check failed, 2 invalid configuration,
// 3 a required tier has no checks, 4 a protected test file or the gate's own
// configuration changed after the tests were approved.
import path from 'node:path'
import { auditTask } from './audit.mjs'
import { MANIFEST_PATH, missingTiers, parseManifest } from './checks.mjs'
import { loadConfig, TIERS, tierForRoute } from './config.mjs'
import { readTextOrNull, sha256, writeFileAtomic } from './fs.mjs'
import { git, head, uncommittedPaths } from './git.mjs'
import { isMissingTool, runChecks } from './runner.mjs'
import { currentTask, TASKS_DIR, taskDir, writeState } from './task.mjs'

export const GATE = { PASSED: 0, FAILED: 1, CONFIG: 2, UNCONFIGURED: 3, PROTECTED: 4 }
const LOG_LIMIT = 8 * 1024 * 1024

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

export { tierForRoute }

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
  // With a task, the whole run (the gate's lines and every check's output) is
  // also saved as .agent/tasks/<task>/gate.log, for the writer, the reviewer and
  // the report; the console can then stay short (paacm gate --quiet). Only the
  // last LOG_LIMIT characters are kept, so a check that prints without end
  // cannot exhaust the memory of the gate (or of the stop hook running it).
  let transcript = ''
  let dropped = false
  const keep = (text) => {
    transcript += text
    if (transcript.length > 2 * LOG_LIMIT) {
      transcript = transcript.slice(-LOG_LIMIT)
      dropped = true
    }
  }
  const userLog = log
  const userSink = sink
  log = (line) => {
    keep(`${line}\n`)
    userLog(line)
  }
  sink = (text) => {
    keep(text)
    if (userSink) userSink(text)
  }
  const saveLog = async () => {
    if (!state) return
    log(`Full output: ${TASKS_DIR}/${state.id}/gate.log`)
    const cut = dropped || transcript.length > LOG_LIMIT
    const text = cut ? `[… earlier output dropped; the last ${LOG_LIMIT} characters follow …]\n${transcript.slice(-LOG_LIMIT)}` : transcript
    await writeFileAtomic(path.join(taskDir(projectDir, state.id), 'gate.log'), text)
  }
  const requiredTier = tierForRoute(config, state)
  const effectiveTier = tier ?? requiredTier
  const audit = auditTask(projectDir, config, state)
  const record = async (passed, failed, missingTool = false) => {
    if (!state) return null
    state.gateFailures = passed ? 0 : (state.gateFailures ?? 0) + 1
    state.lastGate = {
      at: new Date().toISOString(),
      head: head(projectDir),
      tier: effectiveTier,
      passed,
      failed,
      ...(missingTool ? { missingTool: true } : {}),
      dirty: uncommittedPaths(projectDir).some((p) => !p.startsWith('.agent/tasks/')),
      fingerprint: worktreeFingerprint(projectDir),
    }
    await writeState(projectDir, state)
    return state.gateFailures
  }

  for (const w of audit.warnings) {
    log(w.origin === 'merge' ? `NOTE protected configuration changed by a merge, not by this task's own commits: ${w.path}` : `WARN protected configuration changed in this task: ${w.path} (the report must state who approved it)`)
  }
  if (audit.violations.length) {
    for (const v of audit.violations) log(`PROTECTED ${v.path}${v.detail ? `: ${v.detail}` : ' changed after the tests were approved'}`)
    log('GATE FAILED: protected test files or the gate configuration changed after the tests were approved. Undo those edits, or stop with BLOCKED: trigger 4 if the change is needed. After the human approves it, run paacm task reopen-tests --reason "<the approved change>" (the IDE asks them to confirm), commit the change, then run paacm task approve-tests.')
    const failures = await record(false, 'protected-paths')
    await saveLog()
    return { code: GATE.PROTECTED, tier: effectiveTier, requiredTier, audit, results: [], gateFailures: failures, retryCap: config.gate.retryCap, task: state }
  }

  const missing = missingTiers(checks, effectiveTier)
  if (missing.length) {
    log(`UNCONFIGURED: tier(s) ${missing.join(', ')} have no checks in ${MANIFEST_PATH}. Report them under CHECKS NOT RUN and ask the human to configure them.`)
    await saveLog()
    return { code: GATE.UNCONFIGURED, tier: effectiveTier, requiredTier, audit, missing, results: [], gateFailures: state?.gateFailures ?? 0, retryCap: config.gate.retryCap, task: state }
  }

  const run = await runChecks(projectDir, checks, effectiveTier, { timeoutSec: config.checks.timeoutSec, sink, log })
  const failures = await record(run.passed, run.failed, run.results.some((r) => r.exitCode !== 0 && isMissingTool(r)))
  if (!run.passed && failures !== null && failures >= config.gate.retryCap) {
    log(`RETRY CAP REACHED: ${failures} consecutive failures. Stop trying; run paacm task block --trigger 5 --reason "<what fails>" and end your turn with BLOCKED.`)
  }
  await saveLog()
  return {
    code: run.passed ? GATE.PASSED : GATE.FAILED,
    tier: effectiveTier,
    requiredTier,
    audit,
    results: run.results,
    failed: run.failed,
    gateFailures: failures ?? 0,
    retryCap: config.gate.retryCap,
    task: state,
  }
}
