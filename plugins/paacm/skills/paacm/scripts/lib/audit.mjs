// The protected-path audit. It catches edits that bypassed the protect hook,
// for example through shell commands.
//   - Test files changed since the approved test baseline are violations: the
//     writer must undo them or escalate (the gate fails with exit 4).
//   - The gate's own configuration (the check manifest and .agent/paacm.json, which
//     holds the protect patterns and the retry cap) changed since the approved
//     test baseline is a violation too: weakening a check or emptying the test
//     patterns would otherwise pass the gate. A change the human approved is
//     followed by paacm task reopen-tests (which the human confirms) and a new
//     paacm task approve-tests.
//   - Other executable configuration changed since the task started is reported
//     as a warning: such edits pass through the IDE's approval prompt, and the
//     completion report must account for each one. Each warning has an origin:
//     "task" for a change the task made itself (its own commits, a merge's
//     conflict resolution, a branch merged locally, uncommitted edits), "merge"
//     for one that arrived only by merging a branch already on a remote, such
//     as the base branch, where it was reviewed.
import { CONFIG_PATH, isProtectedConfig, isProtectedTest } from './config.mjs'
import { changedSince, commitExists, ownChangesSince } from './git.mjs'
import { CASE_INSENSITIVE_FS, matchesAny } from './glob.mjs'

const GATE_CONFIG = ['.agent/checks.conf', CONFIG_PATH]

const isTaskFile = (p) => p === '.agent/tasks' || p.startsWith('.agent/tasks/')

export function auditTask(projectDir, config, state) {
  const result = { violations: [], warnings: [], baseline: null }
  if (!state) return result
  if (state.testsApprovedAt) {
    if (!commitExists(projectDir, state.testsApprovedAt)) {
      result.violations.push({ path: '(baseline)', kind: 'tests', detail: `the approved test baseline ${state.testsApprovedAt} no longer exists (rewritten history); after the human re-approves the tests, run paacm task reopen-tests --reason "<what they approved>" and then paacm task approve-tests` })
    } else {
      result.baseline = state.testsApprovedAt
      for (const p of changedSince(projectDir, state.testsApprovedAt)) {
        if (isTaskFile(p)) continue
        if (matchesAny(p, GATE_CONFIG, { ignoreCase: CASE_INSENSITIVE_FS })) result.violations.push({ path: p, kind: 'config' })
        else if (isProtectedTest(p, config)) result.violations.push({ path: p, kind: 'tests' })
      }
    }
  }
  if (state.baseCommit && commitExists(projectDir, state.baseCommit)) {
    const flagged = new Set(result.violations.map((v) => v.path))
    const changedConfig = changedSince(projectDir, state.baseCommit).filter((p) => !isTaskFile(p) && !flagged.has(p) && isProtectedConfig(p, config))
    const own = changedConfig.length ? ownChangesSince(projectDir, state.baseCommit) : new Set()
    for (const p of changedConfig) result.warnings.push({ path: p, kind: 'config', origin: own.has(p) ? 'task' : 'merge' })
  }
  return result
}
