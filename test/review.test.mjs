// review-input.md: what the fresh-context reviewer sees. It has no shell, so the
// file must hold the whole change (new files too), stay readable when the change
// has generated or very large files, and point to the evidence the writer saved.
import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { commitAll, git, read, repo, runtime, writeFiles } from './helpers.mjs'

const pass = 'node -e "process.exit(0)"'
const today = () => new Date().toISOString().slice(0, 10)

async function started(t, files = {}) {
  const dir = await repo(t, { files: { '.agent/checks.conf': `quick|unit|${pass}\n`, 'src/a.js': 'export const a = 1\n', ...files } })
  runtime(dir, 'task', 'start', '--slug', 'rv', '--route', 'STANDARD', '--summary', 'x')
  return dir
}

async function reviewInput(dir) {
  const r = runtime(dir, 'task', 'review-input')
  assert.equal(r.code, 0, r.out)
  return read(dir, r.stdout.trim())
}

test('review input contains the content of new, uncommitted files', async (t) => {
  const dir = await started(t)
  await writeFiles(dir, { 'src/fresh.js': 'export const fresh = 1\n' })
  const text = await reviewInput(dir)
  assert.match(text, /## Changed files[\s\S]*src\/fresh\.js \(\+1 −0\)/)
  assert.match(text, /\+export const fresh = 1/)
  const gitDir = git(dir, 'rev-parse', '--absolute-git-dir')
  assert.deepEqual(readdirSync(gitDir).filter((n) => n.startsWith('paacm-review-index')), [], 'the temporary index is removed')
  assert.match(git(dir, 'status', '--porcelain'), /\?\? src\/fresh\.js/, 'the real index is untouched')
})

test('generated and very large diffs are kept in separate files the reviewer can read', async (t) => {
  const dir = await started(t, { '.gitattributes': 'dist/** linguist-generated\n' })
  const big = Array.from({ length: 3000 }, (_, i) => `row ${i} ${'x'.repeat(40)}`).join('\n')
  await writeFiles(dir, { 'src/a.js': 'export const a = 2\n', 'dist/bundle.js': 'generated output\n', 'data/big.txt': `${big}\n` })
  commitAll(dir)
  const text = await reviewInput(dir)
  const id = `${today()}-rv`
  assert.match(text, /\+export const a = 2/)
  assert.doesNotMatch(text, /\+generated output/)
  assert.doesNotMatch(text, /\+row 10 /)
  const listed = [...text.matchAll(/^- (\S+) \((?:[^)]*)\): (\.agent\/tasks\/\S+\.diff)$/gm)].map((m) => [m[1], m[2]])
  assert.deepEqual(listed.map(([p]) => p).sort(), ['data/big.txt', 'dist/bundle.js'])
  for (const [p, file] of listed) {
    assert.ok(file.startsWith(`.agent/tasks/${id}/review-diffs/`), file)
    assert.match(await read(dir, file), p === 'dist/bundle.js' ? /\+generated output/ : /\+row 10 /)
  }
  assert.match(text, /dist\/bundle\.js \([^)]*generated[^)]*\)/)
})

test('the diff fence is longer than any backtick run inside the diff', async (t) => {
  const dir = await started(t)
  await writeFiles(dir, { 'README.md': '# Title\n\n````js\nconst x = 1\n````\n' })
  const text = await reviewInput(dir)
  const fence = /^(`{3,})diff$/m.exec(text)
  assert.ok(fence, 'a diff fence exists')
  assert.ok(fence[1].length >= 5, `fence ${fence[1]} must be longer than the four backticks in the diff`)
  assert.ok(text.trimEnd().endsWith(fence[1]), 'the fence is closed with the same length')
})

test('the evidence section points to the gate log, the configuration warnings and the files saved for reviewers', async (t) => {
  const dir = await started(t)
  const id = `${today()}-rv`
  await writeFiles(dir, { '.github/workflows/ci.yml': 'on: push\n', [`.agent/tasks/${id}/kb-stale.md`]: 'stale notes: none\n', [`.agent/tasks/${id}/inputs/attached.txt`]: 'untrusted\n' })
  commitAll(dir)
  runtime(dir, 'gate')
  const text = await reviewInput(dir)
  const evidence = text.slice(text.indexOf('## Evidence'), text.indexOf('## Changed files'))
  assert.match(evidence, new RegExp(`Full output: \\.agent/tasks/${id}/gate\\.log`))
  assert.match(evidence, /\.github\/workflows\/ci\.yml: protected configuration changed/)
  assert.match(evidence, new RegExp(`\\.agent/tasks/${id}/kb-stale\\.md`))
  assert.doesNotMatch(evidence, /attached\.txt|gate\.log\n- |state\.json|progress\.md/)
  assert.equal(existsSync(path.join(dir, '.agent', 'tasks', id, 'review-diffs')), false, 'no separate diffs when none are needed')
})

test('a "## " line inside a code block does not end the reviewer checklist', async (t) => {
  const checklist = ['# Review', '', '## Reviewer checklist', '', '- item one', '', '```md', '## not a heading', '```', '', '- item two', '', '## For the writer', '', '- writer only', ''].join('\n')
  const dir = await started(t, { '.agent/extensions/08-review.md': checklist })
  await writeFiles(dir, { 'src/a.js': 'export const a = 3\n' })
  const text = await reviewInput(dir)
  assert.match(text, /item one[\s\S]*## not a heading[\s\S]*item two/)
  assert.doesNotMatch(text, /writer only/)
})
