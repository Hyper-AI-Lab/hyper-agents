// The project configuration file .agent/paacm.json: its schema, defaults and loading.
import path from 'node:path'
import { readJsonOrNull } from './fs.mjs'

export const CONFIG_PATH = '.agent/paacm.json'
export const TIERS = ['quick', 'full', 'security']
const LEVELS = ['L0', 'L1', 'L2', 'L3']

export const DEFAULT_CONFIG = Object.freeze({
  autonomy: 'L1',
  layer: 'core',
  ides: ['claude', 'cursor'],
  gate: { tier: 'quick', deepTier: 'full', retryCap: 3 },
  checks: { timeoutSec: 900 },
  protect: { tests: [], config: [] },
  postEdit: [],
})

export function validateConfig(config) {
  const problems = []
  if (!config || typeof config !== 'object' || Array.isArray(config)) return ['must be a JSON object']
  const known = new Set(['version', 'autonomy', 'layer', 'ides', 'gate', 'checks', 'protect', 'postEdit'])
  for (const key of Object.keys(config)) if (!known.has(key)) problems.push(`unknown key "${key}"`)
  if ('autonomy' in config && !LEVELS.includes(config.autonomy)) problems.push(`"autonomy" must be one of ${LEVELS.join(', ')}`)
  if ('layer' in config && !['core', 'power'].includes(config.layer)) problems.push('"layer" must be "core" or "power"')
  if ('ides' in config && !(Array.isArray(config.ides) && config.ides.every((i) => ['claude', 'cursor'].includes(i)))) {
    problems.push('"ides" must be a list containing "claude" and/or "cursor"')
  }
  if ('gate' in config) {
    const g = config.gate
    if (!g || typeof g !== 'object') problems.push('"gate" must be an object')
    else {
      if ('tier' in g && !TIERS.includes(g.tier)) problems.push(`"gate.tier" must be one of ${TIERS.join(', ')}`)
      if ('deepTier' in g && !TIERS.includes(g.deepTier)) problems.push(`"gate.deepTier" must be one of ${TIERS.join(', ')}`)
      if ('retryCap' in g && !(Number.isInteger(g.retryCap) && g.retryCap >= 1 && g.retryCap <= 10)) problems.push('"gate.retryCap" must be an integer from 1 to 10')
    }
  }
  if ('checks' in config) {
    const c = config.checks
    if (!c || typeof c !== 'object') problems.push('"checks" must be an object')
    else if ('timeoutSec' in c && !(Number.isInteger(c.timeoutSec) && c.timeoutSec >= 1)) problems.push('"checks.timeoutSec" must be a positive integer')
  }
  if ('protect' in config) {
    const p = config.protect
    if (!p || typeof p !== 'object') problems.push('"protect" must be an object')
    else {
      for (const key of ['tests', 'config']) {
        if (key in p && !(Array.isArray(p[key]) && p[key].every((g) => typeof g === 'string' && g.trim() !== ''))) {
          problems.push(`"protect.${key}" must be a list of glob patterns`)
        }
      }
    }
  }
  if ('postEdit' in config) {
    if (!Array.isArray(config.postEdit)) problems.push('"postEdit" must be a list')
    else {
      for (const [i, entry] of config.postEdit.entries()) {
        if (!entry || typeof entry.glob !== 'string' || typeof entry.command !== 'string' || entry.command.trim() === '') {
          problems.push(`"postEdit[${i}]" needs "glob" and "command" strings`)
        }
      }
    }
  }
  return problems
}

// Loads and validates the configuration; missing keys take their defaults.
export async function loadConfig(projectDir) {
  const raw = await readJsonOrNull(path.join(projectDir, ...CONFIG_PATH.split('/')))
  if (raw === null) return { ...structuredClone(DEFAULT_CONFIG), present: false }
  const problems = validateConfig(raw)
  if (problems.length) throw new Error(`${CONFIG_PATH}: ${problems.join('; ')}`)
  const d = DEFAULT_CONFIG
  return {
    present: true,
    version: raw.version,
    autonomy: raw.autonomy ?? d.autonomy,
    layer: raw.layer ?? d.layer,
    ides: raw.ides ?? [...d.ides],
    gate: { ...d.gate, ...(raw.gate ?? {}) },
    checks: { ...d.checks, ...(raw.checks ?? {}) },
    protect: { tests: raw.protect?.tests ?? [], config: raw.protect?.config ?? [] },
    postEdit: raw.postEdit ?? [],
  }
}
