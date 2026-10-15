// The protected-path audit. It catches edits that bypassed the protect hook,
// for example through shell commands.
//   - Test files changed since the approved test baseline are violations: the
//     writer must undo them or escalate (the gate fails with exit 4).
//   - Executable configuration changed since the task started is reported as a
//     warning: such edits pass through the IDE's approval prompt, and the
//     completion report must account for each one.
import { changedSince, commitExists } from './git.mjs'
import { matchesAny } from './glob.mjs'

const isTaskFile = (p) => p === '.agent/tasks' || p.startsWith('.agent/tasks/')

export function auditTask(projectDir, config, state) {
  const result = { violations: [], warnings: [], baseline: null }
  if (!state) return result
  if (state.testsApprovedAt) {
    if (!commitExists(projectDir, state.testsApprovedAt)) {
      result.violations.push({ path: '(baseline)', kind: 'tests', detail: `the approved test baseline ${state.testsApprovedAt} no longer exists; run paacm task approve-tests after the human re-approves the tests` })
    } else {
      result.baseline = state.testsApprovedAt
      for (const p of changedSince(projectDir, state.testsApprovedAt)) {
        if (!isTaskFile(p) && matchesAny(p, config.protect.tests)) result.violations.push({ path: p, kind: 'tests' })
      }
    }
  }
  if (state.baseCommit && commitExists(projectDir, state.baseCommit)) {
    for (const p of changedSince(projectDir, state.baseCommit)) {
      if (!isTaskFile(p) && matchesAny(p, config.protect.config)) result.warnings.push({ path: p, kind: 'config' })
    }
  }
  return result
}
