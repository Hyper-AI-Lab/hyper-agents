// Post-edit checks (Claude Code PostToolUse on edit tools, Cursor postToolUse on
// Write). Runs the commands configured in .agent/paacm.json `postEdit` whose glob
// matches the edited file, with `{file}` replaced by the file's path, and feeds
// any failure back to the agent. Does nothing when no command matches.
import { spawnSync } from 'node:child_process'
import { loadConfig } from '../lib/config.mjs'
import { matchesAny } from '../lib/glob.mjs'
import { detectTool, editTarget, emit, projectDirFrom, readHookInput, runHook, toProjectPath } from '../lib/hookio.mjs'

const TIMEOUT_MS = 120_000
const quote = (p) => (process.platform === 'win32' ? `"${p.replace(/"/g, '""')}"` : `'${p.replace(/'/g, "'\\''")}'`)

runHook(async () => {
  const input = await readHookInput()
  const tool = detectTool(input)
  const projectDir = projectDirFrom(input)
  const done = () => {
    if (tool === 'cursor') emit({})
  }
  const target = editTarget(input.tool_input) ?? input.file_path
  const rel = target ? toProjectPath(projectDir, target) : null
  if (!rel || rel.startsWith('.agent/tasks/')) return done()
  const config = await loadConfig(projectDir)
  const commands = config.postEdit.filter((e) => matchesAny(rel, [e.glob]))
  if (commands.length === 0) return done()

  const failures = []
  for (const entry of commands) {
    const command = entry.command.split('{file}').join(quote(rel))
    const r = spawnSync(command, { cwd: projectDir, shell: true, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 })
    if (r.status !== 0) {
      const output = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim().split('\n').slice(-30).join('\n')
      failures.push(`\`${command}\` exited ${r.status ?? (r.error ? r.error.message : 'abnormally')}:\n${output}`)
    }
  }
  if (failures.length === 0) return done()
  const message = `PAACM post-edit checks failed for ${rel}. Fix these before continuing:\n\n${failures.join('\n\n')}`
  if (tool === 'claude') emit({ decision: 'block', reason: message })
  else emit({ additional_context: message })
})
