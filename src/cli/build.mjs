// `paacm build` writes the committed build output (the plugin and both
// marketplace manifests) from src/content and src/runtime.
// `paacm build --check` writes nothing and fails when the committed files differ.
import { readFile, rm } from 'node:fs/promises'
import path from 'node:path'
import { loadContent, PACKAGE_ROOT, PLUGIN_DIR, renderBuild } from '../lib/content.mjs'
import { fromPosix, listFiles, readTextOrNull, writeFileAtomic } from '../runtime/lib/fs.mjs'
import { validateContent } from './validate.mjs'

export async function diffBuild(root = PACKAGE_ROOT, content) {
  const expected = renderBuild(content)
  const changes = []
  for (const [rel, text] of expected) {
    const actual = await readTextOrNull(fromPosix(root, rel))
    if (actual === null) changes.push({ rel, change: 'missing' })
    else if (actual !== text) changes.push({ rel, change: 'differs' })
  }
  for (const rel of await listFiles(fromPosix(root, PLUGIN_DIR))) {
    const full = `${PLUGIN_DIR}/${rel}`
    if (!expected.has(full)) changes.push({ rel: full, change: 'stale' })
  }
  return { expected, changes }
}

export async function build(args, io) {
  const check = args.includes('--check')
  const unknown = args.filter((a) => a !== '--check')
  if (unknown.length) throw new Error(`build: unknown option ${unknown[0]}`)
  const content = await loadContent()
  const problems = await validateContent(content)
  if (problems.length) {
    for (const p of problems) io.err(`invalid: ${p}`)
    return 1
  }
  const { expected, changes } = await diffBuild(PACKAGE_ROOT, content)
  if (check) {
    if (changes.length === 0) {
      io.out(`build is up to date (${expected.size} files)`)
      return 0
    }
    for (const c of changes) io.err(`${c.change}: ${c.rel}`)
    io.err('build output is out of date; run `node bin/paacm.mjs build` and commit the result')
    return 1
  }
  for (const c of changes) {
    const abs = fromPosix(PACKAGE_ROOT, c.rel)
    if (c.change === 'stale') await rm(abs)
    else await writeFileAtomic(abs, expected.get(c.rel))
    io.out(`${c.change === 'stale' ? 'removed' : 'wrote'} ${c.rel}`)
  }
  io.out(changes.length ? `build complete (${changes.length} files changed)` : `build is up to date (${expected.size} files)`)
  return 0
}

export async function readBuildFile(rel) {
  return readFile(path.join(PACKAGE_ROOT, ...rel.split('/')), 'utf8')
}
