// review-input.md: what the fresh-context reviewer sees. It has no shell, so the
// file must hold the whole change (new files too), stay readable when the change
// has generated or very large files, and point to the evidence the writer saved.
import assert from 'node:assert/strict'
import { existsSync, readdirSync, rmSync, symlinkSync } from 'node:fs'
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

test('a nested repository without commits does not stop the review input; it is named as not reviewed', async (t) => {
  const dir = await started(t)
  git(dir, 'init', '-q', path.join(dir, 'tools', 'scratch'))
  await writeFiles(dir, { 'tools/scratch/notes.txt': 'scratch\n', 'src/fresh.js': 'export const fresh = 2\n' })
  const text = await reviewInput(dir)
  assert.match(text, /\+export const fresh = 2/)
  assert.match(text, /could not be added to the review[^\n]*\n- 'tools\/scratch\/' does not have a commit checked out/)
})

test("a file git is told to skip (skip-worktree) keeps its local content out of the review input", async (t) => {
  const dir = await repo(t, { files: { '.agent/checks.conf': `quick|unit|${pass}\n`, 'config/local.env': 'API_KEY=placeholder\n' } })
  git(dir, 'update-index', '--skip-worktree', 'config/local.env')
  await writeFiles(dir, { 'config/local.env': 'API_KEY=sk-live-SECRET\n', 'src/a.js': 'export const a = 9\n' })
  runtime(dir, 'task', 'start', '--slug', 'rv', '--route', 'STANDARD', '--summary', 'x')
  const text = await reviewInput(dir)
  assert.doesNotMatch(text, /sk-live-SECRET|config\/local\.env/)
  assert.match(text, /\+export const a = 9/)
})

test('a file that became a symbolic link keeps the per-file split', { skip: process.platform === 'win32' && 'symbolic links need privileges on Windows' }, async (t) => {
  const dir = await started(t, { '.gitattributes': 'dist/** linguist-generated\n', 'link.txt': 'plain\n' })
  rmSync(path.join(dir, 'link.txt'))
  symlinkSync('src', path.join(dir, 'link.txt'))
  await writeFiles(dir, { 'dist/bundle.js': 'generated output\n' })
  const text = await reviewInput(dir)
  assert.doesNotMatch(text, /could not be split/)
  const separate = /^- dist\/bundle\.js \([^)]*generated\): (\S+)$/m.exec(text)
  assert.ok(separate, 'the generated file is kept apart')
  assert.match(await read(dir, separate[1]), /\+generated output/)
  assert.match(text, /-plain\n[\s\S]*\+src\n/, 'both sections of the type change are in the diff')
})

test('a submodule is shown by its commits even when git is set to show it as a log', async (t) => {
  const lib = await repo(t, { files: { 'x.txt': '1\n' } })
  const dir = await repo(t, { files: { '.agent/checks.conf': `quick|unit|${pass}\n`, '.gitattributes': 'dist/** linguist-generated\n' } })
  git(dir, '-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', lib, 'vendor/lib')
  commitAll(dir, 'submodule')
  git(dir, 'config', 'diff.submodule', 'log')
  runtime(dir, 'task', 'start', '--slug', 'rv', '--route', 'STANDARD', '--summary', 'x')
  await writeFiles(lib, { 'x.txt': '2\n' })
  commitAll(lib, 'lib change')
  git(path.join(dir, 'vendor', 'lib'), '-c', 'protocol.file.allow=always', 'pull', '-q', lib, 'HEAD')
  await writeFiles(dir, { 'dist/bundle.js': 'generated output\n' })
  const text = await reviewInput(dir)
  assert.doesNotMatch(text, /could not be split/)
  assert.match(text, /^\+Subproject commit [0-9a-f]+/m)
  const separate = /^- dist\/bundle\.js \([^)]*generated\): (\S+)$/m.exec(text)
  assert.ok(separate)
  assert.match(await read(dir, separate[1]), /\+generated output/)
})

test('a diff with very many backtick runs gets a fence without overflowing', async (t) => {
  const dir = await started(t)
  const many = {}
  for (let i = 0; i < 6; i++) many[`docs/ticks-${i}.md`] = `${'`x'.repeat(26_000)}\n`
  await writeFiles(dir, many)
  const text = await reviewInput(dir)
  assert.match(text, /^`{3,}diff$/m)
})

test('a symbolic link in the task folder does not hide the files saved for reviewers', { skip: process.platform === 'win32' && 'symbolic links need privileges on Windows' }, async (t) => {
  const dir = await started(t)
  const id = `${today()}-rv`
  await writeFiles(dir, { [`.agent/tasks/${id}/notes-for-review.md`]: 'look at the cache\n', 'src/a.js': 'export const a = 4\n' })
  symlinkSync('notes-for-review.md', path.join(dir, '.agent', 'tasks', id, 'scratch-link'))
  const text = await reviewInput(dir)
  const evidence = text.slice(text.indexOf('## Evidence'), text.indexOf('## Changed files'))
  assert.match(evidence, new RegExp(`\\.agent/tasks/${id}/notes-for-review\\.md`))
  assert.doesNotMatch(evidence, /could not be listed|scratch-link/)
})
