// `paacm validate` checks every piece of kit content against the formats the two
// IDEs document, and checks that the rendered outputs are well formed.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { AUTONOMY_LEVELS, cursorSafeAgent, IDES, loadContent, PACKAGE_ROOT, pluginCoreRule, renderMarketplaces, renderPlugin, renderProject } from '../lib/content.mjs'
import {
  validateAgent,
  validateClaudeHooks,
  validateCursorHooks,
  validateMarketplace,
  validatePluginManifest,
  validateRule,
  validateSkill,
} from '../lib/validate.mjs'
import { parseManifest } from '../runtime/lib/checks.mjs'
import { validateConfig } from '../runtime/lib/config.mjs'

export async function validateContent(content) {
  const problems = []
  for (const [name, files] of content.skills) {
    const skill = files.get('SKILL.md')
    if (!skill) {
      problems.push(`skills/${name}: SKILL.md is missing`)
      continue
    }
    problems.push(...validateSkill(skill, name, `skills/${name}/SKILL.md`))
  }
  for (const [file, text] of content.agents) {
    problems.push(...validateAgent(text, file.replace(/\.md$/, ''), `agents/${file}`))
    problems.push(...validateAgent(cursorSafeAgent(text), file.replace(/\.md$/, ''), `agents/${file} (Cursor form)`))
  }
  try {
    problems.push(...validateRule(pluginCoreRule(content), 'plugins/paacm/rules/paacm-core.mdc'))
  } catch (error) {
    problems.push(error.message)
  }
  problems.push(...validateClaudeHooks(content.claudeHooks, 'hooks/claude.json'))
  problems.push(...validateCursorHooks(content.cursorHooks, 'hooks/cursor.json'))
  problems.push(...validateConfig(content.project.config).map((p) => `project/paacm.json: ${p}`))
  try {
    parseManifest(content.project.checks)
  } catch (error) {
    problems.push(`project/checks.conf: ${error.message}`)
  }

  const plugin = renderPlugin(content)
  const json = (map, rel) => JSON.parse(map.get(rel))
  problems.push(...validatePluginManifest(json(plugin, 'plugins/paacm/.claude-plugin/plugin.json'), 'plugins/paacm/.claude-plugin/plugin.json'))
  problems.push(...validatePluginManifest(json(plugin, 'plugins/paacm/.cursor-plugin/plugin.json'), 'plugins/paacm/.cursor-plugin/plugin.json'))
  const markets = renderMarketplaces(content)
  for (const rel of markets.keys()) problems.push(...validateMarketplace(json(markets, rel), rel))

  const pkg = JSON.parse(await readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'))
  if (pkg.version !== content.kit.version) problems.push(`package.json version ${pkg.version} differs from src/content/kit.json version ${content.kit.version}`)

  // Every combination of options must render without error.
  for (const layer of ['core', 'power']) {
    for (const autonomy of AUTONOMY_LEVELS) {
      for (const ides of [['claude'], ['cursor'], IDES]) {
        try {
          renderProject(content, { ides, layer, autonomy })
        } catch (error) {
          problems.push(`project payload (${ides.join('+')}, ${layer}, ${autonomy}): ${error.message}`)
        }
      }
    }
  }
  return problems
}

export async function validate(args, io) {
  if (args.length) throw new Error(`validate: unknown option ${args[0]}`)
  const problems = await validateContent(await loadContent())
  if (problems.length) {
    for (const p of problems) io.err(p)
    io.err(`${problems.length} problem(s) found`)
    return 1
  }
  io.out('kit content is valid')
  return 0
}
