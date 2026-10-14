// Validators for every kind of file the kit generates. Each returns a list of
// problems (empty when valid) so callers can report all problems at once.
// The rules follow the formats documented by Claude Code 2.1.299 and Cursor 3.24
// (docs/research/07-claude-code-and-cursor.md).
import { splitFrontmatter } from './frontmatter.mjs'

const NAME_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

// Fields this kit may use in SKILL.md: the open Agent Skills standard plus the
// documented Claude Code and Cursor extensions the kit relies on.
const SKILL_FIELDS = new Set([
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
  'disable-model-invocation',
  'user-invocable',
  'argument-hint',
  'paths',
])

// Subagent fields: Claude Code's `tools`/`model`/`effort`/`maxTurns` and Cursor's
// `readonly`/`is_background`/`model`. Each tool ignores the other's fields.
const AGENT_FIELDS = new Set(['name', 'description', 'tools', 'disallowedTools', 'model', 'effort', 'maxTurns', 'color', 'readonly', 'is_background'])

const RULE_FIELDS = new Set(['description', 'globs', 'alwaysApply'])

// Claude Code hook events documented in the hooks reference (v2.1.299).
export const CLAUDE_HOOK_EVENTS = new Set([
  'SessionStart',
  'InstructionsLoaded',
  'UserPromptSubmit',
  'UserPromptExpansion',
  'PreToolUse',
  'PermissionRequest',
  'PermissionDenied',
  'PostToolUse',
  'PostToolUseFailure',
  'PostToolBatch',
  'Notification',
  'SubagentStart',
  'SubagentStop',
  'Stop',
  'StopFailure',
  'PreCompact',
  'PostCompact',
  'SessionEnd',
  'TaskCreated',
  'TaskCompleted',
  'TeammateIdle',
  'ConfigChange',
  'CwdChanged',
  'DirectoryAdded',
  'FileChanged',
  'WorktreeCreate',
  'WorktreeRemove',
  'Elicitation',
  'ElicitationResult',
])

// Cursor hook events documented in cursor.com/docs/hooks (3.24): 18 agent events,
// 2 Tab events and the app-lifecycle event.
export const CURSOR_HOOK_EVENTS = new Set([
  'beforeTabFileRead',
  'afterTabFileEdit',
  'workspaceOpen',
  'sessionStart',
  'sessionEnd',
  'preToolUse',
  'postToolUse',
  'postToolUseFailure',
  'subagentStart',
  'subagentStop',
  'beforeShellExecution',
  'afterShellExecution',
  'beforeMCPExecution',
  'afterMCPExecution',
  'beforeReadFile',
  'afterFileEdit',
  'beforeSubmitPrompt',
  'preCompact',
  'stop',
  'afterAgentResponse',
  'afterAgentThought',
])

export function validateSkill(text, dirName, file) {
  const problems = []
  let fm
  try {
    fm = splitFrontmatter(text, file)
  } catch (error) {
    return [error.message]
  }
  const { data, body } = fm
  for (const key of Object.keys(data)) {
    if (!SKILL_FIELDS.has(key)) problems.push(`${file}: unsupported skill field "${key}"`)
  }
  if (typeof data.name !== 'string' || !NAME_RE.test(data.name) || data.name.length > 64) {
    problems.push(`${file}: "name" must be lowercase letters, digits and hyphens, at most 64 characters`)
  } else if (data.name !== dirName) {
    problems.push(`${file}: "name" (${data.name}) must equal its folder name (${dirName})`)
  }
  if (typeof data.description !== 'string' || data.description.length < 1 || data.description.length > 1024) {
    problems.push(`${file}: "description" is required and must be 1-1024 characters`)
  }
  for (const flag of ['disable-model-invocation', 'user-invocable']) {
    if (flag in data && typeof data[flag] !== 'boolean') problems.push(`${file}: "${flag}" must be true or false`)
  }
  const bodyLines = body.split('\n').length
  if (bodyLines > 500) problems.push(`${file}: body has ${bodyLines} lines; keep SKILL.md under 500 lines and move detail to references/`)
  if (body.trim() === '') problems.push(`${file}: body is empty`)
  return problems
}

export function validateAgent(text, stem, file) {
  const problems = []
  let fm
  try {
    fm = splitFrontmatter(text, file)
  } catch (error) {
    return [error.message]
  }
  const { data, body } = fm
  for (const key of Object.keys(data)) {
    if (!AGENT_FIELDS.has(key)) problems.push(`${file}: unsupported subagent field "${key}"`)
  }
  if (typeof data.name !== 'string' || !NAME_RE.test(data.name)) {
    problems.push(`${file}: "name" must be lowercase letters, digits and hyphens`)
  } else if (data.name !== stem) {
    problems.push(`${file}: "name" (${data.name}) must equal the file name (${stem})`)
  }
  if (typeof data.description !== 'string' || data.description.trim() === '') problems.push(`${file}: "description" is required`)
  if ('readonly' in data && typeof data.readonly !== 'boolean') problems.push(`${file}: "readonly" must be true or false`)
  if ('is_background' in data && typeof data.is_background !== 'boolean') problems.push(`${file}: "is_background" must be true or false`)
  if (body.trim() === '') problems.push(`${file}: the body (the subagent's system prompt) is empty`)
  return problems
}

export function validateRule(text, file) {
  const problems = []
  let fm
  try {
    fm = splitFrontmatter(text, file)
  } catch (error) {
    return [error.message]
  }
  const { data, body } = fm
  for (const key of Object.keys(data)) {
    if (!RULE_FIELDS.has(key)) problems.push(`${file}: unsupported rule field "${key}"`)
  }
  if ('alwaysApply' in data && typeof data.alwaysApply !== 'boolean') problems.push(`${file}: "alwaysApply" must be true or false`)
  if (!('alwaysApply' in data) && !('globs' in data) && !('description' in data)) {
    problems.push(`${file}: a rule needs alwaysApply, globs or description`)
  }
  if (body.split('\n').length > 500) problems.push(`${file}: keep rules under 500 lines`)
  return problems
}

export function validatePluginManifest(json, file) {
  const problems = []
  if (!json || typeof json !== 'object') return [`${file}: must be a JSON object`]
  if (typeof json.name !== 'string' || !NAME_RE.test(json.name)) problems.push(`${file}: "name" must be kebab-case`)
  else if (/^(claude-|anthropic-|anthropics-|cc-plugin-)/.test(json.name)) problems.push(`${file}: "name" may not start with a reserved prefix`)
  if ('version' in json && !/^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/.test(json.version)) problems.push(`${file}: "version" must be semantic`)
  if ('hooks' in json && (typeof json.hooks !== 'string' || !json.hooks.startsWith('./'))) {
    problems.push(`${file}: "hooks" must be a ./relative path`)
  }
  return problems
}

export function validateMarketplace(json, file) {
  const problems = []
  if (!json || typeof json !== 'object') return [`${file}: must be a JSON object`]
  if (typeof json.name !== 'string' || !NAME_RE.test(json.name)) problems.push(`${file}: "name" must be kebab-case`)
  if (!json.owner || typeof json.owner.name !== 'string') problems.push(`${file}: "owner.name" is required`)
  if (!Array.isArray(json.plugins) || json.plugins.length === 0) problems.push(`${file}: "plugins" must be a non-empty list`)
  else {
    for (const [i, p] of json.plugins.entries()) {
      if (typeof p.name !== 'string' || !NAME_RE.test(p.name)) problems.push(`${file}: plugins[${i}].name must be kebab-case`)
      if (typeof p.source !== 'string' || p.source.trim() === '') problems.push(`${file}: plugins[${i}].source is required`)
    }
  }
  return problems
}

export function validateClaudeHooks(json, file) {
  const problems = []
  const hooks = json && json.hooks
  if (!hooks || typeof hooks !== 'object') return [`${file}: "hooks" object is required`]
  for (const [event, groups] of Object.entries(hooks)) {
    if (!CLAUDE_HOOK_EVENTS.has(event)) problems.push(`${file}: unknown Claude Code hook event "${event}"`)
    if (!Array.isArray(groups)) {
      problems.push(`${file}: hooks.${event} must be a list`)
      continue
    }
    for (const [i, group] of groups.entries()) {
      if ('matcher' in group && typeof group.matcher !== 'string') problems.push(`${file}: hooks.${event}[${i}].matcher must be a string`)
      if (!Array.isArray(group.hooks) || group.hooks.length === 0) {
        problems.push(`${file}: hooks.${event}[${i}].hooks must be a non-empty list`)
        continue
      }
      for (const [j, h] of group.hooks.entries()) {
        const at = `${file}: hooks.${event}[${i}].hooks[${j}]`
        if (h.type !== 'command') problems.push(`${at}.type must be "command"`)
        if (typeof h.command !== 'string' || h.command === '') problems.push(`${at}.command is required`)
        if ('args' in h && !(Array.isArray(h.args) && h.args.every((a) => typeof a === 'string'))) problems.push(`${at}.args must be a list of strings`)
        if ('timeout' in h && !(Number.isInteger(h.timeout) && h.timeout > 0)) problems.push(`${at}.timeout must be a positive integer`)
        if ('onFailure' in h && !['continue', 'block'].includes(h.onFailure)) problems.push(`${at}.onFailure must be "continue" or "block"`)
      }
    }
  }
  return problems
}

export function validateCursorHooks(json, file) {
  const problems = []
  if (!json || json.version !== 1) problems.push(`${file}: "version" must be 1`)
  const hooks = json && json.hooks
  if (!hooks || typeof hooks !== 'object') return [...problems, `${file}: "hooks" object is required`]
  for (const [event, entries] of Object.entries(hooks)) {
    if (!CURSOR_HOOK_EVENTS.has(event)) problems.push(`${file}: unknown Cursor hook event "${event}"`)
    if (!Array.isArray(entries)) {
      problems.push(`${file}: hooks.${event} must be a list`)
      continue
    }
    for (const [i, h] of entries.entries()) {
      const at = `${file}: hooks.${event}[${i}]`
      if (typeof h.command !== 'string' || h.command === '') problems.push(`${at}.command is required`)
      if ('matcher' in h && typeof h.matcher !== 'string') problems.push(`${at}.matcher must be a string`)
      if ('failClosed' in h && typeof h.failClosed !== 'boolean') problems.push(`${at}.failClosed must be true or false`)
      if ('timeout' in h && !(Number.isInteger(h.timeout) && h.timeout > 0)) problems.push(`${at}.timeout must be a positive integer`)
      if ('loop_limit' in h && !(Number.isInteger(h.loop_limit) && h.loop_limit > 0)) problems.push(`${at}.loop_limit must be a positive integer`)
    }
  }
  return problems
}
