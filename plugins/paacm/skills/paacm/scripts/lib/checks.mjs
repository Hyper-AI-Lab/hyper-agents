// The check manifest .agent/checks.conf.
//
// Format: one check per line, `tier|label|command`. Blank lines and lines whose
// first non-space character is `#` are ignored. Tiers are `quick`, `full` and
// `security`. Labels use letters, digits, dot, underscore and hyphen. The command
// is everything after the second `|`, so commands may contain pipes. Windows
// (CRLF) line endings are accepted.
//
// The whole manifest is validated before any check runs, so a malformed line can
// never be discovered after earlier checks have already executed.
import { TIERS } from './config.mjs'

export const MANIFEST_PATH = '.agent/checks.conf'
const LABEL_RE = /^[A-Za-z0-9._-]+$/

export function parseManifest(text) {
  const checks = []
  const errors = []
  const labels = new Set()
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  lines.forEach((rawLine, index) => {
    const line = rawLine.replace(/\r$/, '')
    const n = index + 1
    if (line.trim() === '' || line.trimStart().startsWith('#')) return
    const first = line.indexOf('|')
    const second = first === -1 ? -1 : line.indexOf('|', first + 1)
    if (first === -1 || second === -1) {
      errors.push(`line ${n}: expected tier|label|command`)
      return
    }
    const tier = line.slice(0, first).trim()
    const label = line.slice(first + 1, second).trim()
    const command = line.slice(second + 1).trim()
    if (!TIERS.includes(tier)) errors.push(`line ${n}: unknown tier "${tier}" (use ${TIERS.join(', ')})`)
    if (!LABEL_RE.test(label)) errors.push(`line ${n}: invalid label "${label}" (letters, digits, . _ - only)`)
    else if (labels.has(label)) errors.push(`line ${n}: duplicate label "${label}"`)
    if (command === '') errors.push(`line ${n}: empty command for "${label}"`)
    labels.add(label)
    checks.push({ tier, label, command, line: n })
  })
  if (errors.length) throw new Error(`invalid check manifest: ${errors.join('; ')}`)
  return checks
}

// Which tiers a mode runs, cumulatively: quick ⊂ full ⊂ security.
export function tiersFor(mode) {
  if (mode === 'quick') return ['quick']
  if (mode === 'full') return ['quick', 'full']
  if (mode === 'security') return ['quick', 'full', 'security']
  throw new Error(`unknown check mode "${mode}"`)
}

// Fail-closed preflight: every tier the mode needs must have at least one check.
export function missingTiers(checks, mode) {
  return tiersFor(mode).filter((tier) => !checks.some((c) => c.tier === tier))
}
