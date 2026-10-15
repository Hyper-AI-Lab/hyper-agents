import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { test } from 'node:test'
import { diffBuild } from '../src/cli/build.mjs'
import { validateContent } from '../src/cli/validate.mjs'
import { AUTONOMY_LEVELS, cursorSafeAgent, IDES, LAYERS, loadContent, PLUGIN_DIR, pluginCoreRules, renderPlugin, renderProject } from '../src/lib/content.mjs'
import { validateAgent, validateClaudeHooks, validateCursorHooks, validateRule, validateSkill } from '../src/lib/validate.mjs'
import { DEFAULT_CONFIG } from '../src/runtime/lib/config.mjs'
import { ROOT } from './helpers.mjs'

const content = await loadContent()

test('the kit content passes validation against both IDE formats', async () => {
  assert.deepEqual(await validateContent(content), [])
})

test('the committed plugin and marketplace files are exactly what the generator produces', async () => {
  const { changes } = await diffBuild(ROOT, content)
  assert.deepEqual(changes, [], 'run `node bin/paacm.mjs build` and commit the result')
})

test('every generated skill, agent, rule and hook file is valid', () => {
  const plugin = renderPlugin(content)
  let skills = 0
  let agents = 0
  for (const [rel, text] of plugin) {
    const inner = rel.slice(PLUGIN_DIR.length + 1)
    const skill = /^skills\/([^/]+)\/SKILL\.md$/.exec(inner)
    if (skill) {
      skills++
      assert.deepEqual(validateSkill(text, skill[1], rel), [])
    }
    const agent = /^agents\/([^/]+)\.md$/.exec(inner)
    if (agent) {
      agents++
      assert.deepEqual(validateAgent(text, agent[1], rel), [])
      assert.doesNotMatch(text, /^model:\s*(haiku|sonnet|opus|fable)\s*$/m, 'plugin agents use model: inherit for Cursor')
    }
    if (inner.startsWith('rules/')) assert.deepEqual(validateRule(text, rel), [])
  }
  assert.equal(skills, 3)
  assert.equal(agents, 3)
  assert.deepEqual(validateClaudeHooks(JSON.parse(plugin.get(`${PLUGIN_DIR}/hooks/hooks.json`)), 'hooks.json'), [])
  assert.deepEqual(validateCursorHooks(JSON.parse(plugin.get(`${PLUGIN_DIR}/hooks/cursor-hooks.json`)), 'cursor-hooks.json'), [])
  assert.equal(JSON.parse(plugin.get(`${PLUGIN_DIR}/.cursor-plugin/plugin.json`)).hooks, './hooks/cursor-hooks.json')
})

test('the plugin hooks reference only scripts that the plugin ships', () => {
  const plugin = renderPlugin(content)
  const text = plugin.get(`${PLUGIN_DIR}/hooks/hooks.json`) + plugin.get(`${PLUGIN_DIR}/hooks/cursor-hooks.json`)
  const scripts = [...text.matchAll(/skills\/paacm\/scripts\/(hooks\/[\w-]+\.mjs)/g)].map((m) => m[1])
  assert.ok(scripts.length >= 5)
  for (const s of scripts) assert.ok(plugin.has(`${PLUGIN_DIR}/skills/paacm/scripts/${s}`), s)
})

test('Claude Code accepts the plugin and the marketplace (when the claude CLI is installed)', (t) => {
  const probe = spawnSync('claude', ['--version'], { encoding: 'utf8', shell: process.platform === 'win32' })
  if (probe.status !== 0) return t.skip('claude CLI not installed')
  for (const target of [`${PLUGIN_DIR}`, '.']) {
    const r = spawnSync('claude', ['plugin', 'validate', target, ...(target === '.' ? [] : ['--strict'])], { cwd: ROOT, encoding: 'utf8', shell: process.platform === 'win32' })
    assert.equal(r.status, 0, `${target}: ${r.stdout}${r.stderr}`)
  }
})

test('the plugin core rules name the plugin locations, not the project ones', () => {
  const rules = pluginCoreRules(content)
  assert.doesNotMatch(rules, /\.claude\/skills\/paacm/)
  assert.match(rules, /\/paacm:paacm/)
  assert.doesNotMatch(rules, /Project-specific facts/)
  assert.match(content.agentsBlock, /`\/paacm <request>`/, 'the project block keeps the project wording')
  const plugin = renderPlugin(content)
  assert.equal(plugin.get(`${PLUGIN_DIR}/skills/paacm/scripts/core-rules.md`), rules)
})

test('Cursor-safe agents replace Claude Code model aliases only', () => {
  assert.match(cursorSafeAgent('---\nname: a\nmodel: haiku\n---\n'), /^model: inherit$/m)
  assert.match(cursorSafeAgent('---\nname: a\nmodel: claude-opus-5-5\n---\n'), /^model: claude-opus-5-5$/m)
})

test('every combination of IDE, layer and autonomy renders the expected files', () => {
  for (const layer of LAYERS) {
    for (const autonomy of AUTONOMY_LEVELS) {
      for (const ides of [['claude'], ['cursor'], IDES]) {
        const entries = renderProject(content, { ides, layer, autonomy })
        const paths = entries.map((e) => e.path)
        assert.equal(new Set(paths).size, paths.length, 'no path is rendered twice')
        assert.ok(paths.includes('AGENTS.md') && paths.includes('.agent/paacm.json') && paths.includes('.agent/checks.conf'))
        assert.ok(paths.includes('.claude/skills/paacm/scripts/paacm.mjs'))
        assert.equal(paths.includes('CLAUDE.md'), ides.includes('claude'))
        assert.equal(paths.includes('.claude/settings.json'), layer === 'power' && ides.includes('claude'))
        assert.equal(paths.includes('.cursor/hooks.json'), layer === 'power' && ides.includes('cursor'))
        assert.equal(paths.some((p) => p.startsWith('.claude/agents/')), layer === 'power')
        const config = JSON.parse(entries.find((e) => e.path === '.agent/paacm.json').text)
        assert.equal(config.autonomy, autonomy)
        assert.equal(config.layer, layer)
        assert.deepEqual(config.protect, DEFAULT_CONFIG.protect, 'the installed defaults equal the runtime defaults')
        assert.doesNotMatch(entries.find((e) => e.path === 'AGENTS.md').text, /paacm:(begin|end)/, 'the block text must not contain its own markers')
      }
    }
  }
  assert.throws(() => renderProject(content, { ides: [], layer: 'core', autonomy: 'L1' }))
  assert.throws(() => renderProject(content, { ides: ['vscode'], layer: 'core', autonomy: 'L1' }))
})

test('the autonomy profiles get stricter towards L0 and sandbox L2 and L3', () => {
  const settings = (autonomy) => renderProject(content, { ides: ['claude'], layer: 'power', autonomy }).find((e) => e.path === '.claude/settings.json').value
  assert.equal(settings('L0').permissions.defaultMode, 'plan')
  assert.equal(settings('L1').permissions.defaultMode, 'default')
  for (const level of ['L2', 'L3']) {
    assert.equal(settings(level).sandbox.enabled, true, level)
    assert.equal(settings(level).sandbox.failIfUnavailable, true, level)
  }
  for (const level of AUTONOMY_LEVELS) assert.ok(settings(level).permissions.deny.includes('Read(.env)'), level)
})
