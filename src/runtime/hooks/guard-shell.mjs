// Shell guard (Claude Code PreToolUse on Bash and PowerShell, Cursor
// beforeShellExecution). Denies the most damaging command patterns and asks the
// human before consequential ones. Configured to fail closed.
import { claudePreTool, cursorPermission, detectTool, readHookInput, runHook } from '../lib/hookio.mjs'
import { evaluateCommand } from '../lib/shell-rules.mjs'

runHook(async () => {
  const input = await readHookInput()
  const tool = detectTool(input)
  const command = tool === 'claude' ? input.tool_input?.command : input.command
  const verdict = evaluateCommand(command)
  if (!verdict) {
    if (tool === 'cursor') cursorPermission('allow')
    return
  }
  const reason =
    verdict.decision === 'deny'
      ? `PAACM shell guard: blocked because this command ${verdict.reason} (rule ${verdict.id}). Find a safer way, or ask the human to run it themselves.`
      : `PAACM shell guard: this command ${verdict.reason} (rule ${verdict.id}). It needs the human's explicit approval for this specific action.`
  if (tool === 'claude') claudePreTool(verdict.decision, reason)
  else cursorPermission(verdict.decision, reason)
})
