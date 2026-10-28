// Hook input and output for both IDEs. Claude Code and Cursor both send one JSON
// object on standard input and read one JSON object from standard output; they
// differ in event names (PascalCase vs camelCase) and in the response fields.
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { findProjectDir, sameRepository, worktreeRoot } from './project.mjs'

export async function readHookInput({ timeoutMs = 5000 } = {}) {
  if (process.stdin.isTTY) return {}
  const chunks = []
  await new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs)
    process.stdin.on('data', (c) => chunks.push(c))
    process.stdin.on('end', () => {
      clearTimeout(timer)
      resolve()
    })
    process.stdin.on('error', () => {
      clearTimeout(timer)
      resolve()
    })
  })
  const text = Buffer.concat(chunks).toString('utf8').trim()
  if (text === '') return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new Error('hook input is not valid JSON')
  }
}

// "claude" for Claude Code (PascalCase events), "cursor" for Cursor (camelCase).
export function detectTool(input) {
  const event = input.hook_event_name ?? ''
  if (/^[A-Z]/.test(event)) return 'claude'
  if (/^[a-z]/.test(event)) return 'cursor'
  return process.env.CURSOR_VERSION ? 'cursor' : 'claude'
}

// The projects a hook acts on: `anchor`, the session's project (from the IDE's
// project directory), and `primary`, the one the agent works in. The agent's
// current directory (`cwd`) moves the primary project only into another
// worktree of the anchor's repository (Claude Code keeps CLAUDE_PROJECT_DIR at
// the original root in a worktree session while `cwd` follows the agent), never
// into a sub-folder of the same worktree or into another repository. When the
// session's folder is not in a git repository (a folder holding several
// checkouts), the repository `cwd` lies in is the primary project.
export function projectDirsFrom(input) {
  const candidates = [process.env.CLAUDE_PROJECT_DIR, process.env.CURSOR_PROJECT_DIR, Array.isArray(input.workspace_roots) ? input.workspace_roots[0] : undefined, input.cwd, process.cwd()]
  const anchor = findProjectDir(candidates.find((c) => typeof c === 'string' && c !== ''))
  if (typeof input.cwd !== 'string' || input.cwd === '') return { primary: anchor, anchor }
  const here = findProjectDir(input.cwd)
  if (here === anchor) return { primary: anchor, anchor }
  const anchorTree = worktreeRoot(anchor)
  const hereTree = worktreeRoot(here)
  if (anchorTree === null) return { primary: hereTree === null ? anchor : here, anchor }
  const otherWorktree = hereTree !== null && hereTree !== anchorTree && sameRepository(here, anchor)
  return { primary: otherWorktree ? here : anchor, anchor }
}

export const projectDirFrom = (input) => projectDirsFrom(input).primary

// The real path of the longest existing prefix of an absolute path, with the rest
// appended: symbolic links are resolved even for a file that does not exist yet.
function realPath(abs) {
  const rest = []
  let current = abs
  for (;;) {
    try {
      return path.join(realpathSync.native(current), ...rest)
    } catch {
      const parent = path.dirname(current)
      if (parent === current) return abs
      rest.unshift(path.basename(current))
      current = parent
    }
  }
}

// Converts an absolute or relative path from a tool call into a repository-relative
// POSIX path, or null when it lies outside the project. Symbolic links are
// resolved first, so a link cannot hide which file an edit really changes.
export function toProjectPath(projectDir, filePath) {
  if (typeof filePath !== 'string' || filePath === '') return null
  const root = realPath(path.resolve(projectDir))
  const abs = realPath(path.resolve(projectDir, filePath))
  const rel = path.relative(root, abs)
  if (rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)) return null
  return rel.split(path.sep).join('/')
}

// The worktree an edited file belongs to (`root`) and its POSIX path there
// (`rel`), or null when the file is outside the project. A file in another
// worktree of the project's repository, next to it or nested in it, belongs to
// that worktree and is judged by its configuration and task. A file in a
// submodule belongs to the project that contains it. When the project folder is
// not in a git repository, a file in any checkout below it is judged by that
// checkout.
export function editLocation(projectDir, filePath) {
  if (typeof filePath !== 'string' || filePath === '') return null
  const abs = realPath(path.resolve(projectDir, filePath))
  const root = findProjectDir(path.dirname(abs))
  // A session folder outside git holds checkouts: each file is judged by its own.
  const judged = worktreeRoot(root) !== null && (worktreeRoot(projectDir) === null || sameRepository(root, projectDir))
  const rel = judged ? toProjectPath(root, abs) : null
  if (rel) return { root, rel }
  const inProject = toProjectPath(projectDir, abs)
  return inProject ? { root: path.resolve(projectDir), rel: inProject } : null
}

// The target file of an edit or write tool call. Claude Code documents
// `file_path` (and `notebook_path` for notebooks). Cursor does not document the
// tool_input fields of preToolUse, so common names are tried in order.
export function editTarget(toolInput) {
  if (!toolInput || typeof toolInput !== 'object') return null
  for (const key of ['file_path', 'notebook_path', 'path', 'target_file', 'filePath', 'file', 'target']) {
    if (typeof toolInput[key] === 'string' && toolInput[key] !== '') return toolInput[key]
  }
  return null
}

export function emit(value) {
  process.stdout.write(`${JSON.stringify(value)}\n`)
}

// Claude Code PreToolUse decision.
export function claudePreTool(decision, reason) {
  emit({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason } })
}

// Cursor permission hooks (preToolUse, beforeShellExecution) must always answer:
// with failClosed, an empty response blocks the action.
export function cursorPermission(permission, message) {
  const out = { permission }
  if (message) {
    out.user_message = message
    out.agent_message = message
  }
  emit(out)
}

export function contextResponse(tool, eventName, text) {
  if (tool === 'claude') emit({ hookSpecificOutput: { hookEventName: eventName, additionalContext: text } })
  else emit({ additional_context: text })
}

// Runs a hook body and turns unexpected errors into a clear message on stderr and
// a non-zero exit, which both IDEs treat as a failed hook (blocking when the hook
// is configured to fail closed).
export async function runHook(body) {
  try {
    await body()
  } catch (error) {
    process.stderr.write(`PAACM hook error: ${error && error.message ? error.message : String(error)}\n`)
    process.exitCode = 1
  }
}
