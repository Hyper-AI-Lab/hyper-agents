import assert from 'node:assert/strict'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { detectChecks } from '../src/cli/detect.mjs'
import { checkPrograms, codeIntelligencePlugins } from '../src/cli/doctor.mjs'
import { main } from '../src/cli/main.mjs'
import { captureIo, cli, read, repo, ROOT, tempDir, writeFiles } from './helpers.mjs'

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
  assert.equal((await run('--version')).text, JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')).version)
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

test('doctor finds the official code-intelligence plugins a project enables', () => {
  const settings = {
    enabledPlugins: {
      'pyright-lsp@claude-plugins-official': true,
      'typescript-lsp@claude-plugins-official': false,
      'pyright-lsp@someone-else': true,
      'commit-commands@claude-plugins-official': true,
    },
  }
  assert.deepEqual(codeIntelligencePlugins(settings), [{ plugin: 'pyright-lsp', binary: 'pyright-langserver' }])
  assert.deepEqual(codeIntelligencePlugins(null), [])
})

test('doctor reports an enabled code-intelligence plugin and whether its language server is installed', async (t) => {
  const dir = await repo(t, {
    files: {
      '.agent/checks.conf': 'quick|unit|npm test\nfull|build|npm run build\n',
      '.claude/settings.json': JSON.stringify({ enabledPlugins: { 'typescript-lsp@claude-plugins-official': true } }),
    },
  })
  const r = cli(dir, 'doctor')
  assert.equal(r.code, 0, r.out)
  assert.match(r.stdout, /code intelligence: typescript-lsp (\(typescript-language-server found\)|is enabled but typescript-language-server is not on PATH)/)
})

test('doctor lists project extensions and warns about unknown names and missing protection', async (t) => {
  const dir = await repo(t, { files: { '.agent/checks.conf': 'quick|unit|npm test\nfull|build|npm run build\n', '.agent/extensions/01-intake-triage.md': '# x\n', '.agent/extensions/intake.md': '# x\n' } })
  const r = cli(dir, 'doctor')
  assert.equal(r.code, 0, r.out)
  assert.match(r.stdout, /! \.agent\/extensions\/intake\.md matches no paacm reference, so the agent never reads it/)
  assert.match(r.stdout, /✓ project extensions: 01-intake-triage, intake/)
  assert.doesNotMatch(r.stdout, /not protected configuration/, 'the defaults protect extensions')
  await writeFiles(dir, { '.agent/paacm.json': JSON.stringify({ protect: { config: ['.claude/**'] } }) })
  assert.match(cli(dir, 'doctor').stdout, /! project extensions are not protected configuration: add "\.agent\/extensions\/\*\*" to protect\.config/)
})

test('checkPrograms reads the programs a check command starts', () => {
  assert.deepEqual(checkPrograms('FOO=1 eslint . && tsc -p x | tee out 2>&1'), ['eslint', 'tsc', 'tee'])
  assert.deepEqual(checkPrograms('timeout 60 npm test'), ['npm'])
  assert.deepEqual(checkPrograms('env -i A=b python3 -m pytest; echo done'), ['python3'])
  assert.deepEqual(checkPrograms('(cd src && node -e "1") || true'), ['node'])
  assert.deepEqual(checkPrograms('git diff --check HEAD'), ['git'])
  assert.deepEqual(checkPrograms('"$TOOL" run'), [])
  assert.deepEqual(checkPrograms("echo 'a && b'"), [])
  assert.deepEqual(checkPrograms('cd infra && ./scripts/test.sh'), ['infra/scripts/test.sh'], 'a script path follows a plain cd')
})

test('doctor warns about a check whose program is not installed', async (t) => {
  const checks = ['quick|unit|node --version', 'quick|lint|FOO=1 definitely-missing-linter-xyz --check . 2>&1 | tail -5', 'full|e2e|./scripts/missing-e2e.sh --all', 'full|ok|(cd src && node -e "1") || true', '']
  const dir = await repo(t, { files: { '.agent/checks.conf': checks.join('\n') } })
  const r = cli(dir, 'doctor')
  assert.equal(r.code, 0, r.out)
  assert.match(r.stdout, /! check lint: definitely-missing-linter-xyz is not on PATH, so the check would exit 127 here/)
  assert.match(r.stdout, /! check e2e: \.\/scripts\/missing-e2e\.sh does not exist/)
  assert.doesNotMatch(r.stdout, /check (unit|ok):/)
})

test('doctor says when the review extension has no reviewer checklist, and which sections stay with the writer', async (t) => {
  const none = await repo(t, { files: { '.agent/checks.conf': 'quick|unit|node --version\n', '.agent/extensions/08-review.md': '# Review\n\n## Reviewers\n\n- also run the security reviewer\n' } })
  assert.match(cli(none, 'doctor').stdout, /! \.agent\/extensions\/08-review\.md has no "## Reviewer checklist" section/)
  const some = await repo(t, { files: { '.agent/checks.conf': 'quick|unit|node --version\n', '.agent/extensions/08-review.md': '## Reviewer checklist\n\n- item\n\n```md\n## not a section\n```\n\n## For the writer\n\n- run x\n' } })
  const r = cli(some, 'doctor').stdout
  assert.match(r, /✓ \.agent\/extensions\/08-review\.md: the reviewer gets "## Reviewer checklist"; "## For the writer" stays with the writer/)
  assert.doesNotMatch(r, /not a section/)
})
