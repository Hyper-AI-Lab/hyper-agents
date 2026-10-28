// Protect hook (Claude Code PreToolUse on edit tools, Cursor preToolUse on Write
// and Delete). Refuses edits to approved tests and gates edits to executable
// configuration. A file is judged by the worktree it is in, with that worktree's
// configuration and task, so a linked worktree next to the project or nested in
// it is protected like the project. Configured to fail closed: if this script
// cannot decide, the edit is blocked.
import { isProtectedConfig, isProtectedTest, loadConfig } from '../lib/config.mjs'
import { shortSha } from '../lib/git.mjs'
import { CASE_INSENSITIVE_FS, matchesAny } from '../lib/glob.mjs'
import { claudePreTool, cursorPermission, detectTool, editLocation, editTarget, projectDirFrom, readHookInput, runHook } from '../lib/hookio.mjs'
import { currentTask } from '../lib/task.mjs'

runHook(async () => {
  const input = await readHookInput()
  const tool = detectTool(input)
  const projectDir = projectDirFrom(input)
  const allow = () => {
    if (tool === 'cursor') cursorPermission('allow')
  }

  const deny = (reason) => (tool === 'claude' ? claudePreTool('deny', reason) : cursorPermission('deny', reason))
  const target = editTarget(input.tool_input)
  if (!target) {
    return deny('PAACM: the protect hook could not find the file this edit targets in the tool call, so it cannot check it against the protected paths. Report this to the human; the edit is refused until the hook recognises the tool.')
  }
  const location = editLocation(projectDir, target)
  if (!location) return allow()
  const { root, rel } = location
  const opts = { ignoreCase: CASE_INSENSITIVE_FS }
  if (matchesAny(rel, ['.agent/tasks/CURRENT', '.agent/tasks/*/state.json'], opts)) {
    return deny(`PAACM: ${rel} is task state, written only by the paacm runtime. Change it with the paacm task commands (phase, approve-tests, block, done, resume).`)
  }
  if (matchesAny(rel, ['.agent/tasks', '.agent/tasks/**'], opts)) return allow()

  const config = await loadConfig(root)
  const task = await currentTask(root)

  if (task && task.testsApprovedAt && isProtectedTest(rel, config)) {
    const reason = `PAACM: ${rel} is a test file, and the tests were approved at ${shortSha(task.testsApprovedAt)}. Tests are read-only during implementation. If this test is wrong or contradicts the specification, stop with BLOCKED: trigger 4 and show the conflicting lines.`
    return deny(reason)
  }

  if (isProtectedConfig(rel, config)) {
    const reason = `PAACM: ${rel} is executable configuration (agent settings, hooks, CI, or the check manifest). Change it only if the human explicitly asked for this specific change.`
    if (tool === 'claude') return claudePreTool('ask', reason)
    return cursorPermission('deny', `${reason} Ask the human in the conversation; they can make the edit, or remove the pattern from protect.config in .agent/paacm.json for the duration of the change.`)
  }

  return allow()
})
