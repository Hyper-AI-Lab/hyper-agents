// Stop gate (Claude Code Stop, Cursor stop). The agent may not finish an
// implementation while the gate fails. It may always stop to ask for approval
// (before implementation), after `paacm task block`, or with a BLOCKED: report.
import { GATE, recentGate, runGate } from '../lib/gate.mjs'
import { changedSince, head, uncommittedPaths } from '../lib/git.mjs'
import { detectTool, emit, projectDirFrom, readHookInput, runHook } from '../lib/hookio.mjs'
import { changedThisSession, sessionIdFrom } from '../lib/session.mjs'
import { currentTask } from '../lib/task.mjs'

const GATED = new Set(['implementing', 'verifying', 'reviewing'])
const isTaskFile = (p) => p === '.agent/tasks' || p.startsWith('.agent/tasks/')

runHook(async () => {
  const input = await readHookInput()
  const tool = detectTool(input)
  const projectDir = projectDirFrom(input)
  const continuation = tool === 'claude' ? Boolean(input.stop_hook_active) : Number(input.loop_count ?? 0) > 0
  const allow = () => {
    if (tool === 'cursor') emit({})
  }
  const block = (reason) => (tool === 'claude' ? emit({ decision: 'block', reason }) : emit({ followup_message: reason }))

  if (tool === 'cursor' && input.status && input.status !== 'completed') return allow()
  const lastMessage = typeof input.last_assistant_message === 'string' ? input.last_assistant_message : ''
  if (/^\s*BLOCKED:/m.test(lastMessage)) return allow()

  const task = await currentTask(projectDir)
  if (!task) {
    // Without a session baseline, every uncommitted file is reported, worded so
    // that it does not claim the agent made the change.
    const sinceStart = await changedThisSession(projectDir, sessionIdFrom(input))
    const changed = (sinceStart ?? uncommittedPaths(projectDir)).filter((p) => !isTaskFile(p))
    if (changed.length && !continuation) {
      const list = `${changed.slice(0, 5).join(', ')}${changed.length > 5 ? ', …' : ''}`
      return block(
        `PAACM: ${sinceStart ? `${changed.length} file(s) changed in this session` : `${changed.length} file(s) have uncommitted changes`} and no PAACM task is active (${list}). If this was a coding request, start a task with \`paacm task start\` and verify with \`paacm gate\` before finishing. If the user asked for these edits outside PAACM, or they are not yours, say so in your answer.`,
      )
    }
    return allow()
  }
  if (task.status === 'blocked' || task.status === 'done') return allow()

  const fastWithChanges = task.status === 'triaged' && task.route === 'FAST' && changedSince(projectDir, task.baseCommit).some((p) => !isTaskFile(p))
  if (!GATED.has(task.status) && !fastWithChanges) return allow()

  const g = task.lastGate
  const dirty = uncommittedPaths(projectDir).some((p) => !isTaskFile(p))
  if (g && g.passed && g.head === head(projectDir) && !dirty && !g.dirty) return allow()

  const duplicate = recentGate(projectDir, task)
  if (duplicate) {
    if (duplicate.passed) return allow()
    return block(`PAACM gate failed on this exact working tree a moment ago (check ${duplicate.failed}); see the previous gate message, fix the cause, then finish again.`)
  }

  const lines = []
  const result = await runGate(projectDir, { log: (l) => lines.push(l) })
  if (result.code === GATE.PASSED) return allow()

  const log = lines.slice(-12).join('\n')
  if (result.code === GATE.UNCONFIGURED || result.code === GATE.CONFIG) {
    if (continuation) return allow()
    return block(
      `PAACM gate could not verify this task:\n${log}\n\nYou cannot fix this by changing code. List the missing checks under CHECKS NOT RUN in the report, and ask the human to configure .agent/checks.conf (or fix .agent/paacm.json). Use \`paacm task block --trigger 2 --reason "<what is missing>"\` if the task cannot be verified without it.`,
    )
  }

  const tail = result.results?.length ? (result.results[result.results.length - 1].outputTail || '').trim().split('\n').slice(-30).join('\n') : ''
  if (result.gateFailures >= result.retryCap) {
    return block(
      `PAACM gate failed ${result.gateFailures} times in a row; the retry cap (${result.retryCap}) is reached. Do not try another fix. Run \`paacm task block --trigger 5 --reason "<what still fails and why>"\`, write REPORT.md, and end your turn with a BLOCKED: line.\n\n${log}`,
    )
  }
  return block(
    `PAACM gate failed (attempt ${result.gateFailures} of ${result.retryCap}); you cannot finish yet.\n\n${log}${tail ? `\n\nLast output of the failing check:\n${tail}` : ''}\n\nFix the cause without editing tests, CI, .agent/checks.conf or hook files, then finish again. If the requirement and the tests conflict, use BLOCKED: trigger 4.`,
  )
})
