// Loads the single source of kit content (src/content/ plus the runtime in
// src/runtime/) and renders the three outputs the kit distributes:
//   1. the plugin for both IDEs (plugins/paacm/),
//   2. the two marketplace manifests at the repository root,
//   3. the project-install payload consumed by `paacm init` and `paacm upgrade`.
// See src/content/README.md for the content layout.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listFiles, normalizeText, stableJson } from '../runtime/lib/fs.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
export const PACKAGE_ROOT = path.resolve(here, '..', '..')
export const CONTENT_DIR = path.join(PACKAGE_ROOT, 'src', 'content')
export const RUNTIME_DIR = path.join(PACKAGE_ROOT, 'src', 'runtime')

export const PLUGIN_DIR = 'plugins/paacm'
export const RUNTIME_SKILL = 'paacm'
export const AUTONOMY_LEVELS = ['L0', 'L1', 'L2', 'L3']
export const LAYERS = ['core', 'power']
export const IDES = ['claude', 'cursor']

// Where the runtime scripts are found, per install target. Hook commands are
// written against these prefixes.
export const SCRIPT_ROOTS = {
  projectClaude: '${CLAUDE_PROJECT_DIR}/.claude/skills/paacm/scripts',
  projectCursor: '.claude/skills/paacm/scripts',
  pluginClaude: '${CLAUDE_PLUGIN_ROOT}/skills/paacm/scripts',
  pluginCursor: '${CURSOR_PLUGIN_ROOT}/skills/paacm/scripts',
}

async function readText(dir, rel) {
  return normalizeText(await readFile(path.join(dir, ...rel.split('/')), 'utf8'))
}

async function readJson(dir, rel) {
  const text = await readText(dir, rel)
  try {
    return JSON.parse(text)
  } catch (error) {
    throw new Error(`src/content/${rel}: invalid JSON (${error.message})`)
  }
}

export async function loadContent(contentDir = CONTENT_DIR, runtimeDir = RUNTIME_DIR) {
  const files = await listFiles(contentDir)
  const has = (rel) => files.includes(rel)
  const kit = await readJson(contentDir, 'kit.json')
  for (const key of ['name', 'version', 'description', 'author', 'license', 'marketplace']) {
    if (!(key in kit)) throw new Error(`src/content/kit.json: missing "${key}"`)
  }

  const skills = new Map()
  for (const rel of files.filter((f) => f.startsWith('skills/'))) {
    const [, name, ...rest] = rel.split('/')
    if (!skills.has(name)) skills.set(name, new Map())
    skills.get(name).set(rest.join('/'), await readText(contentDir, rel))
  }
  if (!skills.has(RUNTIME_SKILL)) throw new Error(`src/content/skills/${RUNTIME_SKILL}/ is required`)

  const pick = async (prefix, ext) => {
    const out = new Map()
    for (const rel of files.filter((f) => f.startsWith(prefix) && f.endsWith(ext) && !f.slice(prefix.length).includes('/'))) {
      out.set(rel.slice(prefix.length), await readText(contentDir, rel))
    }
    return out
  }

  const runtime = new Map()
  for (const rel of await listFiles(runtimeDir)) {
    runtime.set(rel, await readText(runtimeDir, rel))
  }

  const profiles = { claude: {}, cursor: {} }
  for (const ide of IDES) {
    for (const level of AUTONOMY_LEVELS) {
      const rel = `profiles/${ide}/${level}.json`
      if (has(rel)) profiles[ide][level] = await readJson(contentDir, rel)
    }
  }

  return {
    kit,
    agentsBlock: await readText(contentDir, 'instructions/AGENTS.md'),
    claudeBlock: await readText(contentDir, 'instructions/CLAUDE.md'),
    skills,
    agents: await pick('agents/', '.md'),
    claudeHooks: await readJson(contentDir, 'hooks/claude.json'),
    cursorHooks: await readJson(contentDir, 'hooks/cursor.json'),
    profiles,
    project: {
      config: await readJson(contentDir, 'project/paacm.json'),
      checks: await readText(contentDir, 'project/checks.conf'),
      gitignore: await readText(contentDir, 'project/gitignore'),
    },
    runtime,
  }
}

// Replaces every {{SCRIPTS}} token in the strings of a JSON value.
export function withScripts(value, scripts) {
  if (typeof value === 'string') return value.split('{{SCRIPTS}}').join(scripts)
  if (Array.isArray(value)) return value.map((v) => withScripts(v, scripts))
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, withScripts(v, scripts)]))
  }
  return value
}

// Files of one skill as they are installed: the authored files plus, for the
// runtime skill, the runtime under scripts/ and the core rules the session-start
// hook injects when the project has no AGENTS.md block (plugin installs).
function skillFiles(content, name) {
  const out = new Map(content.skills.get(name))
  if (name === RUNTIME_SKILL) {
    for (const [rel, text] of content.runtime) out.set(`scripts/${rel}`, text)
    out.set('scripts/core-rules.md', content.agentsBlock)
  }
  return out
}

// The plugin's always-applied Cursor rule. A plugin cannot ship AGENTS.md, and
// Cursor cloud agents do not run session-start hooks, so the core rules reach
// Cursor through this rule. Generated from the same AGENTS.md block.
const PROJECT_RUNTIME_SENTENCE =
  "`node .claude/skills/paacm/scripts/paacm.mjs <command>`, run from the repository root. When PAACM is installed as a plugin, the session-start message gives the runtime's exact path."
const PLUGIN_RUNTIME_SENTENCE = "the `paacm.mjs` script in the `paacm` skill's `scripts/` folder, run with `node` from the repository root; the session-start message gives its exact path."

export function pluginCoreRule(content) {
  if (!content.agentsBlock.includes(PROJECT_RUNTIME_SENTENCE)) {
    throw new Error('instructions/AGENTS.md no longer contains the runtime sentence the plugin rule rewrites; update PROJECT_RUNTIME_SENTENCE in src/lib/content.mjs')
  }
  const body = content.agentsBlock.replace(PROJECT_RUNTIME_SENTENCE, PLUGIN_RUNTIME_SENTENCE).replace(/\n+Project-specific facts[\s\S]*$/, '\n')
  return `---\ndescription: PAACM core rules for agentic coding in this workspace\nalwaysApply: true\n---\n\n${body}`
}

// Claude Code model aliases. Cursor accepts only `inherit` or a full model ID, so
// subagents that Cursor reads (project .cursor/agents overrides and the plugin,
// whose agents both IDEs read) use `inherit` instead of an alias.
const CLAUDE_MODEL_ALIASES = new Set(['haiku', 'sonnet', 'opus', 'fable'])

export function cursorSafeAgent(text) {
  return text.replace(/^(model:\s*)([A-Za-z0-9._-]+)\s*$/m, (line, prefix, value) => (CLAUDE_MODEL_ALIASES.has(value) ? `${prefix}inherit` : line))
}

// The agents that need a Cursor override in a project install: those whose model
// is a Claude Code alias.
export function cursorAgentOverrides(content) {
  const out = new Map()
  for (const [file, text] of content.agents) {
    const safe = cursorSafeAgent(text)
    if (safe !== text) out.set(file, safe)
  }
  return out
}

function pluginManifestBase(kit) {
  return {
    name: kit.name,
    version: kit.version,
    description: kit.description,
    author: kit.author,
    homepage: kit.homepage,
    repository: kit.repository,
    license: kit.license,
    keywords: kit.keywords,
  }
}

// Output 1: the plugin directory, keyed by POSIX path relative to the repository root.
export function renderPlugin(content) {
  const out = new Map()
  const put = (rel, text) => out.set(`${PLUGIN_DIR}/${rel}`, text)
  const base = pluginManifestBase(content.kit)
  put('.claude-plugin/plugin.json', stableJson(base))
  put('.cursor-plugin/plugin.json', stableJson({ ...base, hooks: './hooks/cursor-hooks.json' }))
  for (const name of [...content.skills.keys()].sort()) {
    for (const [rel, text] of [...skillFiles(content, name)].sort(([a], [b]) => (a < b ? -1 : 1))) {
      put(`skills/${name}/${rel}`, text)
    }
  }
  for (const [file, text] of content.agents) put(`agents/${file}`, cursorSafeAgent(text))
  put('rules/paacm-core.mdc', pluginCoreRule(content))
  put('hooks/hooks.json', stableJson(withScripts(content.claudeHooks, SCRIPT_ROOTS.pluginClaude)))
  put('hooks/cursor-hooks.json', stableJson(withScripts(content.cursorHooks, SCRIPT_ROOTS.pluginCursor)))
  return out
}

// Output 2: marketplace manifests for both IDEs.
export function renderMarketplaces(content) {
  const { kit } = content
  const entry = { name: kit.name, description: kit.description, version: kit.version }
  return new Map([
    [
      '.claude-plugin/marketplace.json',
      stableJson({
        name: kit.marketplace.name,
        owner: kit.marketplace.owner,
        metadata: { description: kit.marketplace.description },
        plugins: [{ ...entry, source: `./${PLUGIN_DIR}` }],
      }),
    ],
    [
      '.cursor-plugin/marketplace.json',
      stableJson({
        name: kit.marketplace.name,
        owner: kit.marketplace.owner,
        metadata: { description: kit.marketplace.description },
        plugins: [{ ...entry, source: PLUGIN_DIR }],
      }),
    ],
  ])
}

// The committed build output: plugin plus marketplaces.
export function renderBuild(content) {
  return new Map([...renderPlugin(content), ...renderMarketplaces(content)])
}

// Output 3: the project payload. Each entry is one of:
//   { path, kind: 'file', text }        a file the kit owns entirely
//   { path, kind: 'block', text }       a marked block inside a Markdown file the user may also edit
//   { path, kind: 'json', format, value } keys merged into a JSON settings file the user may also edit
export function renderProject(content, options) {
  const ides = new Set(options.ides)
  const { layer, autonomy } = options
  if (!LAYERS.includes(layer)) throw new Error(`unknown layer "${layer}" (use ${LAYERS.join(' or ')})`)
  if (!AUTONOMY_LEVELS.includes(autonomy)) throw new Error(`unknown autonomy level "${autonomy}" (use ${AUTONOMY_LEVELS.join(', ')})`)
  for (const ide of ides) if (!IDES.includes(ide)) throw new Error(`unknown IDE "${ide}" (use ${IDES.join(' or ')})`)
  if (ides.size === 0) throw new Error('select at least one IDE')

  const entries = []
  const file = (p, text) => entries.push({ path: p, kind: 'file', text })

  entries.push({ path: 'AGENTS.md', kind: 'block', text: content.agentsBlock })
  if (ides.has('claude')) entries.push({ path: 'CLAUDE.md', kind: 'block', text: content.claudeBlock })

  for (const name of [...content.skills.keys()].sort()) {
    for (const [rel, text] of [...skillFiles(content, name)].sort(([a], [b]) => (a < b ? -1 : 1))) {
      file(`.claude/skills/${name}/${rel}`, text)
    }
  }

  const config = { ...content.project.config, autonomy, layer, ides: [...IDES.filter((i) => ides.has(i))] }
  file('.agent/paacm.json', stableJson(config))
  file('.agent/checks.conf', content.project.checks)
  file('.agent/.gitignore', content.project.gitignore)

  if (layer === 'power') {
    for (const [name, text] of content.agents) file(`.claude/agents/${name}`, text)
    if (ides.has('claude')) {
      const profile = content.profiles.claude[autonomy] ?? {}
      entries.push({
        path: '.claude/settings.json',
        kind: 'json',
        format: 'claude-settings',
        value: { ...profile, hooks: withScripts(content.claudeHooks, SCRIPT_ROOTS.projectClaude).hooks },
      })
    }
    if (ides.has('cursor')) {
      for (const [name, text] of cursorAgentOverrides(content)) file(`.cursor/agents/${name}`, text)
      entries.push({
        path: '.cursor/hooks.json',
        kind: 'json',
        format: 'cursor-hooks',
        value: withScripts(content.cursorHooks, SCRIPT_ROOTS.projectCursor),
      })
      const profile = content.profiles.cursor[autonomy]
      if (profile) entries.push({ path: '.cursor/permissions.json', kind: 'json', format: 'cursor-permissions', value: profile })
    }
  }
  return entries
}
