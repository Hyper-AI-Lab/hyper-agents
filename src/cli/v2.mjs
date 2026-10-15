// Migration from PAACM 2.0.0, whose installer copied 17 files into a project.
// Each file is compared with the exact 2.0.0 content (v2-manifest.json):
// unchanged files are removed and replaced by their PAACM 3 equivalents; files
// the user changed are kept and reported, and the upgrade stops only where a
// PAACM 3 file must occupy the same path.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fromPosix, readTextOrNull, sha256 } from '../runtime/lib/fs.mjs'

const here = path.dirname(fileURLToPath(import.meta.url))
const V2_SCRIPTS = ['scripts/agent-check', 'scripts/install-to-project.sh']
// The 2.0.0 manifest's own check of those two scripts.
const V2_SCRIPT_CHECK = 'quick|shell-syntax|sh -n scripts/agent-check scripts/install-to-project.sh'

export async function planV2Migration(targetDir) {
  const manifest = JSON.parse(await readFile(path.join(here, 'v2-manifest.json'), 'utf8'))
  const plan = []
  let found = 0
  for (const [rel, hash] of Object.entries(manifest.files)) {
    const text = await readTextOrNull(fromPosix(targetDir, rel))
    if (text === null) continue
    found++
    if (sha256(text) === hash) {
      plan.push({ path: rel, action: 'remove', reason: 'PAACM 2 file, unchanged' })
      continue
    }
    if (rel === '.agent/checks.conf') {
      plan.push({ path: rel, action: 'keep-existing', keepExisting: rel, text })
    } else if (rel === 'AGENTS.md' || rel === 'CLAUDE.md') {
      plan.push({ path: rel, action: 'keep', reason: 'contains PAACM 2 text you changed; the PAACM 3 block is added at the top, so remove the old PAACM 2 text by hand' })
    } else if (rel === '.claude/skills/paacm/SKILL.md') {
      plan.push({ path: rel, action: 'conflict', reason: 'the PAACM 2 skill was changed by hand, and the PAACM 3 skill must replace it; move your changes elsewhere and delete this file' })
    } else {
      plan.push({ path: rel, action: 'keep', reason: 'PAACM 2 file you changed; PAACM 3 does not use it, so delete it when you no longer need it' })
    }
  }
  // That check can pass only while both scripts remain, so a kept manifest
  // loses it when either one is removed or already gone.
  const checks = plan.find((p) => p.action === 'keep-existing')
  if (checks) {
    const lines = checks.text.split(/(?<=\n)/)
    const kept = lines.filter((line) => line.trim() !== V2_SCRIPT_CHECK)
    const bothStay = V2_SCRIPTS.every((s) => plan.some((p) => p.path === s && p.action !== 'remove'))
    if (!bothStay && kept.length < lines.length) checks.rewrite = kept.join('')
    const stale = /scripts\/(agent-check|install-to-project\.sh)/.test(checks.rewrite ?? checks.text)
    checks.reason = [
      'your check manifest is kept (the format is unchanged)',
      checks.rewrite !== undefined ? 'its PAACM 2 shell-syntax check of the removed scripts is removed' : null,
      stale ? `remove its ${checks.rewrite !== undefined ? 'other ' : ''}lines that reference scripts/agent-check or scripts/install-to-project.sh, which PAACM 3 no longer has` : null,
    ]
      .filter(Boolean)
      .join('; ')
    delete checks.text
  }
  if (found === 0) throw new Error(`no PAACM 2 files found in ${targetDir}; use \`paacm init\` instead`)
  return plan
}
