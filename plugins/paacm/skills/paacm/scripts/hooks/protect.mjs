// Protect hook (Claude Code PreToolUse on edit tools, Cursor preToolUse on Write
// and Delete). Refuses edits to approved tests and gates edits to executable
// configuration. Configured to fail closed: if this script cannot decide, the
// edit is blocked.
import { loadConfig } from '../lib/config.mjs'
import { shortSha } from '../lib/git.mjs'
import { matchesAny } from '../lib/glob.mjs'
import { claudePreTool, cursorPermission, detectTool, editTarget, projectDirFrom, readHookInput, runHook, toProjectPath } from '../lib/hookio.mjs'
import { currentTask } from '../lib/task.mjs'

runHook(async () => {
  const input = await readHookInput()
  const tool = detectTool(input)
  const projectDir = projectDirFrom(input)
  const allow = () => {
    if (tool === 'cursor') cursorPermission('allow')
  }

  const target = editTarget(input.tool_input)
  const rel = target ? toProjectPath(projectDir, target) : null
  if (!rel || rel === '.agent/tasks' || rel.startsWith('.agent/tasks/')) return allow()

  const config = await loadConfig(projectDir)
  const task = await currentTask(projectDir)

  if (task && task.testsApprovedAt && matchesAny(rel, config.protect.tests)) {
    const reason = `PAACM: ${rel} is a test file, and the tests were approved at ${shortSha(task.testsApprovedAt)}. Tests are read-only during implementation. If this test is wrong or contradicts the specification, stop with BLOCKED: trigger 4 and show the conflicting lines.`
    return tool === 'claude' ? claudePreTool('deny', reason) : cursorPermission('deny', reason)
  }

  if (matchesAny(rel, config.protect.config)) {
    const reason = `PAACM: ${rel} is executable configuration (agent settings, hooks, CI, or the check manifest). Change it only if the human explicitly asked for this specific change.`
    if (tool === 'claude') return claudePreTool('ask', reason)
    return cursorPermission('deny', `${reason} Ask the human in the conversation; they can make the edit, or remove the pattern from protect.config in .agent/paacm.json for the duration of the change.`)
  }

  return allow()
})
