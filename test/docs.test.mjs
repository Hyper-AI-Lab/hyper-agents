// Every relative link in the repository's Markdown resolves to a file, and every
// #anchor to a heading in it. External links are not fetched: their availability
// is outside the repository's control and would make the check flaky.
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { listFiles } from '../src/runtime/lib/fs.mjs'
import { ROOT } from './helpers.mjs'

// GitHub's heading anchors: lower case, punctuation removed, spaces to hyphens.
const slug = (heading) =>
  heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\- _]/gu, '')
    .replace(/ /g, '-')

const anchorCache = new Map()
function anchors(file) {
  if (!anchorCache.has(file)) {
    const seen = new Map()
    const set = new Set()
    for (const line of readFileSync(file, 'utf8').replace(/```[\s\S]*?```/g, '').split('\n')) {
      const m = /^#{1,6}\s+(.*?)\s*#*\s*$/.exec(line)
      if (!m) continue
      const base = slug(m[1].replace(/`/g, ''))
      const n = seen.get(base) ?? 0
      seen.set(base, n + 1)
      set.add(n ? `${base}-${n}` : base)
    }
    anchorCache.set(file, set)
  }
  return anchorCache.get(file)
}

test('relative links and anchors in the Markdown files resolve', async () => {
  const files = (await listFiles(ROOT)).filter((f) => f.endsWith('.md') && !f.startsWith('node_modules/') && !f.startsWith('.git/'))
  assert.ok(files.length > 50)
  const broken = []
  for (const rel of files) {
    const abs = path.join(ROOT, ...rel.split('/'))
    const text = readFileSync(abs, 'utf8')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`\n]*`/g, '')
    for (const m of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const link = m[1]
      if (/^[a-z][a-z0-9+.-]*:/i.test(link)) continue
      const [target, fragment] = link.split('#')
      const resolved = target ? path.resolve(path.dirname(abs), decodeURIComponent(target)) : abs
      if (!existsSync(resolved)) {
        broken.push(`${rel}: ${link} (no such file)`)
        continue
      }
      if (fragment && resolved.endsWith('.md') && !anchors(resolved).has(fragment.toLowerCase())) broken.push(`${rel}: ${link} (no such heading)`)
    }
  }
  assert.deepEqual(broken, [])
})
