// Stop gate (Claude Code Stop, Cursor stop). The agent may not finish an
// implementation while the gate fails. It may always stop to ask for approval
// (before implementation), after `paacm task block`, or with a BLOCKED: report.
// An open task whose gate is green, or a STANDARD or DEEP task that changed files
// without recording its phases, is nudged once; the next stop is let through, so
// an agent waiting for the human is never held. A nudge is guidance, not a
// failure: Claude Code gets it as additionalContext, which continues the turn
// like a block (with the same stop_hook_active protection) but is not shown to
// the user as a hook error. A failing gate blocks.
import { loadConfig, tierAtLeast, tierForRoute } from '../lib/config.mjs'
import { GATE, recentGate, runGate, worktreeFingerprint } from '../lib/gate.mjs'
import { changedSince, head, uncommittedPaths } from '../lib/git.mjs'
import { detectTool, emit, projectDirFrom, readHookInput, runHook } from '../lib/hookio.mjs'
import { isMissingTool } from '../lib/runner.mjs'
import { referencePath } from '../lib/references.mjs'
import { changedThisSession, sessionIdFrom } from '../lib/session.mjs'
import { currentTask, writeState } from '../lib/task.mjs'

const GATED = new Set(['implementing', 'verifying', 'reviewing'])
const NUDGE_DEDUP_MS = 15_000
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
  const guide = (text) => (tool === 'claude' ? emit({ hookSpecificOutput: { hookEventName: 'Stop', additionalContext: text } }) : emit({ followup_message: text }))

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
      return guide(
        `PAACM: ${sinceStart ? `${changed.length} file(s) changed in this session` : `${changed.length} file(s) have uncommitted changes`} and no PAACM task is active (${list}). If this was a coding request, start a task with \`paacm task start\` and verify with \`paacm gate\` before finishing. If the user asked for these edits outside PAACM, or they are not yours, say so in your answer.`,
      )
    }
    return allow()
  }
  if (task.status === 'blocked' || task.status === 'done') return allow()

  // A nudge is given once: never on a continuation, and not again when the same
  // stop arrives twice (Cursor also runs the Claude Code hooks it imports).
  const nudge = async (kind, message) => {
    if (continuation) return allow()
    const fingerprint = worktreeFingerprint(projectDir)
    const last = task.lastNudge
    if (last && last.kind === kind && last.fingerprint === fingerprint && Date.now() - Date.parse(last.at) < NUDGE_DEDUP_MS) return allow()
    task.lastNudge = { kind, fingerprint, at: new Date().toISOString() }
    await writeState(projectDir, task)
    return guide(message)
  }
  const waiting = 'If you are waiting for the human (a question or an approval), say so in your answer and stop again.'
  const missingTool = (label, details) =>
    `PAACM gate could not run check ${label}: a command was not found.${details}\n\nThis is the environment, not the code, so do not change code to get around it. Ask the human to install the tool, or record the check under CHECKS NOT RUN and stop with \`paacm task block --trigger 2 --reason "<the missing tool>"\`.`

  const changes = task.status === 'triaged' && changedSince(projectDir, task.baseCommit).some((p) => !isTaskFile(p))
  if (changes && task.route !== 'FAST') {
    return nudge(
      'phases',
      `PAACM: task ${task.id} (${task.route}) is still triaged, but files outside the task folder changed. Follow the phases: record each one with \`paacm task phase <phase>\`, which names the reference to read, get the approvals they ask for, and verify with \`paacm gate\`. ${waiting}`,
    )
  }
  if (!GATED.has(task.status) && !changes) return allow()

  const finish = () =>
    nudge(
      'finish',
      `PAACM: the gate is green, but task ${task.id} is still ${task.status}. If the work is complete, finish it: ${task.route === 'FAST' ? '' : `review it first if you have not (${referencePath(projectDir, '08-review.md')}), then `}write REPORT.md and run \`paacm task done\` (${referencePath(projectDir, '09-deliver.md')}). ${waiting}`,
    )

  const config = await loadConfig(projectDir)
  const required = tierForRoute(config, task)
  const g = task.lastGate
  const dirty = uncommittedPaths(projectDir).some((p) => !isTaskFile(p))
  if (g && g.passed && g.head === head(projectDir) && !dirty && !g.dirty && tierAtLeast(g.tier, required)) return finish()

  const duplicate = recentGate(projectDir, task)
  if (duplicate && tierAtLeast(duplicate.tier, required)) {
    if (duplicate.passed) return finish()
    if (duplicate.missingTool) return block(missingTool(duplicate.failed, ' See the previous gate output.'))
    return block(`PAACM gate failed on this exact working tree a moment ago (check ${duplicate.failed}); see the previous gate message, fix the cause, then finish again.`)
  }

  const lines = []
  const result = await runGate(projectDir, { log: (l) => lines.push(l) })
  if (result.code === GATE.PASSED) return finish()

  const log = lines.slice(-12).join('\n')
  if (result.code === GATE.UNCONFIGURED || result.code === GATE.CONFIG) {
    if (continuation) return allow()
    return guide(
      `PAACM gate could not verify this task:\n${log}\n\nYou cannot fix this by changing code. List the missing checks under CHECKS NOT RUN in the report, and ask the human to configure .agent/checks.conf (or fix .agent/paacm.json). Use \`paacm task block --trigger 2 --reason "<what is missing>"\` if the task cannot be verified without it.`,
    )
  }

  const last = result.results?.length ? result.results[result.results.length - 1] : null
  const tail = last ? (last.outputTail || '').trim().split('\n').slice(-30).join('\n') : ''
  if (last && isMissingTool(last)) return block(missingTool(last.label, ` The check exited ${last.exitCode}.\n\n${log}${tail ? `\n\nLast output of the check:\n${tail}` : ''}`))
  if (result.gateFailures >= result.retryCap) {
    return block(
      `PAACM gate failed ${result.gateFailures} times in a row; the retry cap (${result.retryCap}) is reached. Do not try another fix. Run \`paacm task block --trigger 5 --reason "<what still fails and why>"\`, write REPORT.md, and end your turn with a BLOCKED: line.\n\n${log}`,
    )
  }
  return block(
    `PAACM gate failed (attempt ${result.gateFailures} of ${result.retryCap}); you cannot finish yet.\n\n${log}${tail ? `\n\nLast output of the failing check:\n${tail}` : ''}\n\nFix the cause without editing tests, CI, .agent/checks.conf or hook files, then finish again. If the requirement and the tests conflict, use BLOCKED: trigger 4.`,
  )
})
