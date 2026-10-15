// `paacm detect`: proposes check-manifest lines from the commands a project
// already defines. It proposes only; nothing is written unless --write is given,
// and even then only lines whose label is not already in .agent/checks.conf.
import path from 'node:path'
import { parseArgs } from 'node:util'
import { MANIFEST_PATH, parseManifest } from '../runtime/lib/checks.mjs'
import { exists, fromPosix, readTextOrNull, writeFileAtomic } from '../runtime/lib/fs.mjs'

async function packageRunner(dir) {
  if (await exists(path.join(dir, 'pnpm-lock.yaml'))) return 'pnpm'
  if (await exists(path.join(dir, 'yarn.lock'))) return 'yarn'
  if ((await exists(path.join(dir, 'bun.lockb'))) || (await exists(path.join(dir, 'bun.lock')))) return 'bun'
  return 'npm'
}

const NODE_SCRIPTS = [
  // [script names in priority order, tier, label]
  [['lint'], 'quick', 'lint'],
  [['format:check', 'fmt:check', 'prettier:check'], 'quick', 'format'],
  [['typecheck', 'type-check', 'tsc', 'check-types', 'types'], 'quick', 'typecheck'],
  [['test:unit', 'test'], 'quick', 'unit-tests'],
  [['build'], 'full', 'build'],
  [['test:integration', 'test:e2e', 'e2e'], 'full', 'integration-tests'],
]

export async function detectChecks(dir) {
  const proposals = []
  const notes = []
  const pkgText = await readTextOrNull(path.join(dir, 'package.json'))
  if (pkgText) {
    let scripts = {}
    try {
      scripts = JSON.parse(pkgText).scripts ?? {}
    } catch {
      notes.push('package.json is not valid JSON; skipped')
    }
    const runner = await packageRunner(dir)
    const run = (s) => (runner === 'npm' ? (s === 'test' ? 'npm test' : `npm run ${s}`) : `${runner} run ${s}`)
    for (const [names, tier, label] of NODE_SCRIPTS) {
      const name = names.find((n) => typeof scripts[n] === 'string' && !/no test specified/.test(scripts[n]))
      if (name) proposals.push({ tier, label, command: run(name), source: `package.json scripts.${name}` })
    }
    if (!proposals.some((p) => p.label === 'typecheck') && (await exists(path.join(dir, 'tsconfig.json')))) {
      proposals.push({ tier: 'quick', label: 'typecheck', command: 'npx --no-install tsc --noEmit', source: 'tsconfig.json' })
    }
    proposals.push({ tier: 'security', label: 'dependency-audit', command: runner === 'yarn' ? 'yarn npm audit --severity high' : `${runner} audit --audit-level=high`, source: `${runner} lockfile` })
  }

  const makefile = await readTextOrNull(path.join(dir, 'Makefile'))
  if (makefile) {
    const targets = new Set([...makefile.matchAll(/^([A-Za-z0-9_.-]+):(?!=)/gm)].map((m) => m[1]))
    for (const [target, tier, label] of [['lint', 'quick', 'make-lint'], ['check', 'quick', 'make-check'], ['test', 'quick', 'make-test'], ['build', 'full', 'make-build']]) {
      if (targets.has(target)) proposals.push({ tier, label, command: `make ${target}`, source: 'Makefile' })
    }
  }

  const pyproject = await readTextOrNull(path.join(dir, 'pyproject.toml'))
  if (pyproject) {
    const uses = (tool) => new RegExp(`\\[tool\\.${tool}\\b|["']${tool}[>=<~"' \\]]`).test(pyproject)
    const usesUv = await exists(path.join(dir, 'uv.lock'))
    const py = (cmd) => (usesUv ? `uv run ${cmd}` : cmd)
    if (uses('ruff')) {
      proposals.push({ tier: 'quick', label: 'ruff-lint', command: py('ruff check .'), source: 'pyproject.toml [tool.ruff]' })
      proposals.push({ tier: 'quick', label: 'ruff-format', command: py('ruff format --check .'), source: 'pyproject.toml [tool.ruff]' })
    }
    if (uses('mypy')) proposals.push({ tier: 'quick', label: 'mypy', command: py('mypy .'), source: 'pyproject.toml' })
    if (uses('pyright')) proposals.push({ tier: 'quick', label: 'pyright', command: py('pyright'), source: 'pyproject.toml' })
    if (uses('pytest')) proposals.push({ tier: 'quick', label: 'pytest', command: py('pytest -q'), source: 'pyproject.toml' })
    if (uses('pip-audit')) proposals.push({ tier: 'security', label: 'pip-audit', command: py('pip-audit'), source: 'pyproject.toml' })
  }

  if (await exists(path.join(dir, 'Cargo.toml'))) {
    proposals.push({ tier: 'quick', label: 'cargo-fmt', command: 'cargo fmt --all -- --check', source: 'Cargo.toml' })
    proposals.push({ tier: 'quick', label: 'cargo-clippy', command: 'cargo clippy --all-targets -- -D warnings', source: 'Cargo.toml' })
    proposals.push({ tier: 'quick', label: 'cargo-test', command: 'cargo test', source: 'Cargo.toml' })
    proposals.push({ tier: 'full', label: 'cargo-build', command: 'cargo build --release', source: 'Cargo.toml' })
  }

  if (await exists(path.join(dir, 'go.mod'))) {
    proposals.push({ tier: 'quick', label: 'go-vet', command: 'go vet ./...', source: 'go.mod' })
    proposals.push({ tier: 'quick', label: 'go-test', command: 'go test ./...', source: 'go.mod' })
    proposals.push({ tier: 'full', label: 'go-build', command: 'go build ./...', source: 'go.mod' })
  }

  if (proposals.length === 0) notes.push('no package.json, Makefile, pyproject.toml, Cargo.toml or go.mod with recognisable commands was found; write .agent/checks.conf by hand')
  return { proposals, notes }
}

export async function detect(args, io) {
  const { values, positionals } = parseArgs({ args, options: { target: { type: 'string' }, write: { type: 'boolean' } }, allowPositionals: true, strict: true })
  const targetDir = path.resolve(values.target ?? positionals[0] ?? process.cwd())
  const { proposals, notes } = await detectChecks(targetDir)
  for (const n of notes) io.out(`note: ${n}`)
  if (proposals.length === 0) return 0
  const manifestFile = fromPosix(targetDir, MANIFEST_PATH)
  const existingText = await readTextOrNull(manifestFile)
  const existing = existingText ? parseManifest(existingText) : []
  const fresh = proposals.filter((p) => !existing.some((c) => c.label === p.label))
  io.out('Proposed checks (review each command before trusting it):')
  for (const p of proposals) {
    const present = !fresh.includes(p)
    io.out(`  ${p.tier}|${p.label}|${p.command}    # from ${p.source}${present ? ' (label already configured)' : ''}`)
  }
  if (!values.write) {
    io.out('\nNothing was written. Copy the lines you trust into .agent/checks.conf, or run again with --write to append the new ones.')
    return 0
  }
  if (fresh.length === 0) {
    io.out('\nEvery proposed label is already configured; nothing was written.')
    return 0
  }
  const base = existingText ?? ''
  const addition = `\n# Added by paacm detect on ${new Date().toISOString().slice(0, 10)}; review before relying on them.\n${fresh.map((p) => `${p.tier}|${p.label}|${p.command}`).join('\n')}\n`
  const next = `${base.replace(/\s*$/, '\n')}${addition}`
  parseManifest(next)
  await writeFileAtomic(manifestFile, next)
  io.out(`\nAppended ${fresh.length} check(s) to ${MANIFEST_PATH}.`)
  return 0
}
