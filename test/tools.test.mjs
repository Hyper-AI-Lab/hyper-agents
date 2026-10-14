import assert from 'node:assert/strict'
import { rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { detectChecks } from '../src/cli/detect.mjs'
import { main } from '../src/cli/main.mjs'
import { captureIo, cli, read, repo, tempDir, writeFiles } from './helpers.mjs'

const labels = (r) => r.proposals.map((p) => `${p.tier}|${p.label}|${p.command}`)

test('detect proposes checks from package.json scripts with the right package manager', async (t) => {
  const dir = tempDir(t)
  await writeFiles(dir, {
    'package.json': JSON.stringify({ scripts: { lint: 'eslint .', 'type-check': 'tsc', test: 'vitest', build: 'vite build', 'test:e2e': 'playwright test' } }),
    'pnpm-lock.yaml': '',
  })
  assert.deepEqual(labels(await detectChecks(dir)), [
    'quick|lint|pnpm run lint',
    'quick|typecheck|pnpm run type-check',
    'quick|unit-tests|pnpm run test',
    'full|build|pnpm run build',
    'full|integration-tests|pnpm run test:e2e',
    'security|dependency-audit|pnpm audit --audit-level=high',
  ])
})

test('detect ignores the npm placeholder test script and falls back to tsc for TypeScript', async (t) => {
  const dir = tempDir(t)
  await writeFiles(dir, { 'package.json': JSON.stringify({ scripts: { test: 'echo "Error: no test specified" && exit 1' } }), 'tsconfig.json': '{}' })
  assert.deepEqual(labels(await detectChecks(dir)), ['quick|typecheck|npx --no-install tsc --noEmit', 'security|dependency-audit|npm audit --audit-level=high'])
})

test('detect reads pyproject tools, Makefile targets, Cargo and Go', async (t) => {
  const py = tempDir(t)
  await writeFiles(py, { 'pyproject.toml': '[tool.ruff]\nline-length = 100\n[tool.mypy]\n[dependency-groups]\ndev = ["pytest>=8"]\n', 'uv.lock': '', Makefile: 'test:\n\tpytest\nVERSION := 1\nlint: deps\n' })
  assert.deepEqual(labels(await detectChecks(py)), [
    'quick|make-lint|make lint',
    'quick|make-test|make test',
    'quick|ruff-lint|uv run ruff check .',
    'quick|ruff-format|uv run ruff format --check .',
    'quick|mypy|uv run mypy .',
    'quick|pytest|uv run pytest -q',
  ])
  const rust = tempDir(t)
  await writeFiles(rust, { 'Cargo.toml': '[package]\n', 'go.mod': 'module x\n' })
  assert.deepEqual(
    (await detectChecks(rust)).proposals.map((p) => p.label),
    ['cargo-fmt', 'cargo-clippy', 'cargo-test', 'cargo-build', 'go-vet', 'go-test', 'go-build'],
  )
  const none = tempDir(t)
  assert.match((await detectChecks(none)).notes.join(), /write \.agent\/checks\.conf by hand/)
})

test('detect --write appends only new labels and keeps the manifest valid', async (t) => {
  const dir = await repo(t, { files: { 'package.json': JSON.stringify({ scripts: { lint: 'eslint .', test: 'vitest' } }), '.agent/checks.conf': '# mine\nquick|lint|make lint\n' } })
  const dry = cli(dir, 'detect')
  assert.equal(dry.code, 0)
  assert.match(dry.stdout, /quick\|lint\|npm run lint .*\(label already configured\)/)
  assert.equal(await read(dir, '.agent/checks.conf'), '# mine\nquick|lint|make lint\n', 'nothing is written without --write')
  assert.equal(cli(dir, 'detect', '--write').code, 0)
  const text = await read(dir, '.agent/checks.conf')
  assert.ok(text.startsWith('# mine\nquick|lint|make lint\n'))
  assert.match(text, /quick\|unit-tests\|npm test/)
  assert.equal((text.match(/\|lint\|/g) ?? []).length, 1)
  assert.match(cli(dir, 'detect', '--write').stdout, /already configured; nothing was written/)
  assert.equal(cli(dir, 'check', '--list').code, 0)
})

test('doctor: a healthy project install passes; a broken one fails with the reason', async (t) => {
  const dir = await repo(t)
  assert.equal(cli(dir, 'init', '--layer', 'power').code, 0)
  const ok = cli(dir, 'doctor')
  assert.equal(ok.code, 0, ok.out)
  assert.match(ok.stdout, /✓ \d+ installed files intact/)
  assert.match(ok.stdout, /! \.agent\/checks\.conf has only the default whitespace check/)
  await rm(path.join(dir, '.claude/skills/paacm/scripts/paacm.mjs'))
  await writeFile(path.join(dir, '.claude/settings.json'), JSON.stringify({ hooks: {} }))
  const bad = cli(dir, 'doctor')
  assert.equal(bad.code, 1)
  assert.match(bad.stderr, /✗ missing: \.claude\/skills\/paacm\/scripts\/paacm\.mjs/)
  assert.match(bad.stderr, /✗ \.claude\/settings\.json: PAACM hooks missing for/)
})

test('doctor: a plugin project needs only its checks, and a repository without commits is flagged', async (t) => {
  const plugin = await repo(t, { files: { '.agent/checks.conf': 'quick|unit|npm test\nfull|build|npm run build\n' } })
  const r = cli(plugin, 'doctor')
  assert.equal(r.code, 0, r.out)
  assert.match(r.stdout, /! no project install here/)
  assert.match(r.stdout, /✓ no \.agent\/paacm\.json; the default configuration applies/)
  assert.match(r.stdout, /✓ \.agent\/checks\.conf: 2 check\(s\)/)

  const nothing = await repo(t, { commit: false })
  const n = cli(nothing, 'doctor')
  assert.equal(n.code, 1)
  assert.match(n.stdout, /git repository with no commits yet/)
  assert.match(n.stderr, /\.agent\/checks\.conf is missing/)

  const invalid = await repo(t, { files: { '.agent/checks.conf': 'quick|unit|x\n', '.agent/paacm.json': '{"autonomy":"L9"}' } })
  assert.match(cli(invalid, 'doctor').stderr, /\.agent\/paacm\.json: "autonomy" must be one of/)
})

test('the dispatcher: help, version, unknown commands and bad options', async () => {
  const run = async (...argv) => {
    const c = captureIo()
    return { code: await main(argv, c.io), text: c.text() }
  }
  assert.equal((await run()).code, 2)
  const help = await run('help')
  assert.equal(help.code, 0)
  for (const command of ['init', 'upgrade', 'uninstall', 'doctor', 'detect', 'check', 'eval']) assert.match(help.text, new RegExp(`^  ${command} `, 'm'))
  assert.equal((await run('--version')).text, '3.0.0')
  const unknown = await run('deploy')
  assert.equal(unknown.code, 2)
  assert.match(unknown.text, /unknown command "deploy"/)
  const bad = await run('doctor', '--bogus')
  assert.equal(bad.code, 2)
  assert.match(bad.text, /Run `paacm doctor --help`/)
  const initHelp = await run('init', '--help')
  assert.equal(initHelp.code, 0)
  assert.match(initHelp.text, /--autonomy <L0\|L1\|L2\|L3>/)
})
