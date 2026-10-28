// The audit separates protected configuration the task changed itself from
// changes that arrived by merging another branch, so a report does not claim
// approvals for changes the task never made. Violations stay strict: a merge
// cannot bring in a change to an approved test.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { commitAll, git, repo, runtime, writeFiles } from './helpers.mjs'

const pass = 'node -e "process.exit(0)"'
const files = {
  '.agent/checks.conf': `quick|unit|${pass}\n`,
  '.github/workflows/ci.yml': 'a\n',
  '.github/workflows/c.yml': 'x\n',
  'src/a.js': 'a\n',
  'test/a.test.js': 'ok\n',
}

function mergeWithConflict(dir, branch) {
  try {
    git(dir, 'merge', '-q', '--no-edit', branch)
  } catch {
    // A conflict: the test resolves it and commits the merge.
  }
}

test('the audit tells configuration changed by a merge from the task’s own changes', async (t) => {
  const dir = await repo(t, { files })
  const main = git(dir, 'rev-parse', '--abbrev-ref', 'HEAD')
  git(dir, 'switch', '-q', '-c', 'dev')
  await writeFiles(dir, { '.github/workflows/merged.yml': 'dev\n', '.github/workflows/c.yml': 'dev\n' })
  commitAll(dir, 'dev work')
  git(dir, 'switch', '-q', main)
  assert.equal(runtime(dir, 'task', 'start', '--slug', 'm', '--route', 'STANDARD', '--summary', 'x').code, 0)
  await writeFiles(dir, { '.github/workflows/ci.yml': 'own\n', '.github/workflows/c.yml': 'main\n' })
  commitAll(dir, 'own work')
  mergeWithConflict(dir, 'dev')
  await writeFiles(dir, { '.github/workflows/c.yml': 'resolved\n' })
  commitAll(dir, 'merge dev')
  await writeFiles(dir, { '.cursor/hooks.json': '{}\n' })

  const json = JSON.parse(runtime(dir, 'audit', '--json').stdout)
  const origins = Object.fromEntries(json.warnings.map((w) => [w.path, w.origin]))
  assert.deepEqual(origins, {
    '.cursor/hooks.json': 'task',
    '.github/workflows/c.yml': 'task',
    '.github/workflows/ci.yml': 'task',
    '.github/workflows/merged.yml': 'merge',
  })
  const text = runtime(dir, 'audit').stdout
  assert.match(text, /WARN \.github\/workflows\/ci\.yml: protected configuration changed in this task/)
  assert.match(text, /NOTE \.github\/workflows\/merged\.yml: protected configuration changed by a merge, not by this task's own commits/)
  assert.match(text, /Audit clean \(3 configuration warning\(s\); 1 change\(s\) from merges\)/)
  assert.match(runtime(dir, 'gate').stdout, /NOTE protected configuration changed by a merge[^\n]*merged\.yml/)
})

test('a merge cannot bring in a change to an approved test', async (t) => {
  const dir = await repo(t, { files })
  const main = git(dir, 'rev-parse', '--abbrev-ref', 'HEAD')
  git(dir, 'switch', '-q', '-c', 'side')
  await writeFiles(dir, { 'test/a.test.js': 'weakened\n' })
  commitAll(dir, 'side edit')
  git(dir, 'switch', '-q', main)
  runtime(dir, 'task', 'start', '--slug', 'v', '--route', 'STANDARD', '--summary', 'x')
  assert.equal(runtime(dir, 'task', 'approve-tests').code, 0)
  git(dir, 'merge', '-q', '--no-edit', 'side')
  const r = runtime(dir, 'gate')
  assert.equal(r.code, 4, r.out)
  assert.match(r.out, /PROTECTED test\/a\.test\.js/)
})
