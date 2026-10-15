// `paacm doctor`: checks that a PAACM installation is complete and healthy.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { loadContent } from '../lib/content.mjs'
import { validateAgent, validateClaudeHooks, validateCursorHooks, validateSkill } from '../lib/validate.mjs'
import { blockBody } from '../runtime/lib/blocks.mjs'
import { missingTiers, parseManifest } from '../runtime/lib/checks.mjs'
import { validateConfig } from '../runtime/lib/config.mjs'
import { fromPosix, listFiles, readJsonOrNull, readTextOrNull, sha256 } from '../runtime/lib/fs.mjs'
import { head, isRepo } from '../runtime/lib/git.mjs'
import { LOCK_PATH, readLock } from './install.mjs'

// Installed as defaults and meant to be edited, so a change is not reported.
const PROJECT_CONFIG = new Set(['.agent/paacm.json', '.agent/checks.conf'])

export async function doctor(args, io) {
  const { values, positionals } = parseArgs({ args, options: { target: { type: 'string' } }, allowPositionals: true, strict: true })
  const targetDir = path.resolve(values.target ?? positionals[0] ?? process.cwd())
  const results = []
  const ok = (m) => results.push(['ok', m])
  const warn = (m) => results.push(['warn', m])
  const fail = (m) => results.push(['fail', m])

  const major = Number(process.versions.node.split('.')[0])
  if (major >= 20) ok(`Node.js ${process.versions.node}`)
  else fail(`Node.js ${process.versions.node} is too old; the hooks and the runtime need Node.js 20 or later`)

  if (!isRepo(targetDir)) fail('not a git repository; PAACM needs git for task baselines, the audit and per-task commits')
  else if (!head(targetDir)) warn('git repository with no commits yet; make a first commit before starting a task (tests cannot be approved and the whitespace check fails until then)')
  else ok('git repository')

  // A plugin install has no lock file and needs only the project configuration
  // and the checks, which are checked either way.
  const lock = await readLock(targetDir)
  if (lock) await checkInstall(targetDir, lock, { ok, warn, fail })
  else warn(`no project install here (no ${LOCK_PATH}); expected if you use the PAACM plugin, otherwise run \`paacm init\``)

  let config = null
  try {
    config = await readJsonOrNull(fromPosix(targetDir, '.agent/paacm.json'))
    const problems = config ? validateConfig(config) : lock ? ['missing'] : []
    if (problems.length) fail(`.agent/paacm.json: ${problems.join('; ')}`)
    else ok(config ? '.agent/paacm.json valid' : 'no .agent/paacm.json; the default configuration applies')
  } catch (error) {
    fail(error.message)
  }

  const manifest = await readTextOrNull(fromPosix(targetDir, '.agent/checks.conf'))
  if (manifest === null) fail('.agent/checks.conf is missing; the gate cannot run (`paacm detect --write` proposes checks)')
  else {
    try {
      const checks = parseManifest(manifest)
      const onlyDefault = checks.length > 0 && checks.every((c) => c.label === 'diff-whitespace')
      if (checks.length === 0) fail('.agent/checks.conf has no checks; the gate cannot pass')
      else if (onlyDefault) warn('.agent/checks.conf has only the default whitespace check; add your lint, type-check and test commands (`paacm detect`)')
      else ok(`.agent/checks.conf: ${checks.length} check(s)`)
      const deep = config?.gate?.deepTier ?? 'full'
      const gaps = missingTiers(checks, deep)
      if (checks.length && gaps.length) warn(`tier(s) ${gaps.join(', ')} have no checks; DEEP tasks will stop at the gate with exit 3 until they are configured`)
    } catch (error) {
      fail(`.agent/checks.conf: ${error.message}`)
    }
  }
  return finish(io, results)
}

// The project install: installed files, blocks, settings entries, skills and
// agents, and what the chosen autonomy level needs.
async function checkInstall(targetDir, lock, { ok, warn, fail }) {
  const content = await loadContent()
  if (lock.version === content.kit.version) ok(`PAACM ${lock.version} (${lock.options.ides.join(', ')}; layer ${lock.options.layer}; autonomy ${lock.options.autonomy})`)
  else warn(`PAACM ${lock.version} is installed; ${content.kit.version} is available (\`paacm upgrade\`)`)

  let missing = 0
  let modified = 0
  for (const [rel, info] of Object.entries(lock.files)) {
    const text = await readTextOrNull(fromPosix(targetDir, rel))
    if (text === null) {
      missing++
      fail(`missing: ${rel} (\`paacm upgrade\` restores it)`)
    } else if (sha256(text) !== info.sha256 && !PROJECT_CONFIG.has(rel)) {
      modified++
      warn(`changed since installation: ${rel}`)
    }
  }
  if (!missing && !modified) ok(`${Object.keys(lock.files).length} installed files intact`)

  for (const rel of Object.keys(lock.blocks)) {
    const text = await readTextOrNull(fromPosix(targetDir, rel))
    let body = null
    try {
      body = text === null ? null : blockBody(text)
    } catch (error) {
      fail(`${rel}: ${error.message}`)
      continue
    }
    if (body === null) fail(`${rel}: the PAACM block is missing (\`paacm upgrade\` restores it)`)
    else ok(`${rel}: PAACM block present`)
  }
  if (lock.options.ides.includes('claude')) {
    const claude = await readTextOrNull(fromPosix(targetDir, 'CLAUDE.md'))
    if (claude !== null && !/^@AGENTS\.md\s*$/m.test(claude)) warn('CLAUDE.md does not import @AGENTS.md; Claude Code will not read AGENTS.md')
  }

  for (const [rel, info] of Object.entries(lock.json)) {
    let doc
    try {
      doc = await readJsonOrNull(fromPosix(targetDir, rel))
    } catch (error) {
      fail(error.message)
      continue
    }
    if (doc === null) {
      fail(`missing: ${rel} (\`paacm upgrade\` restores the PAACM entries)`)
      continue
    }
    const problems = info.format === 'claude-settings' ? validateClaudeHooks({ hooks: doc.hooks ?? {} }, rel) : info.format === 'cursor-hooks' ? validateCursorHooks(doc, rel) : []
    for (const p of problems) fail(p)
    const expectedEvents = Object.keys(info.record?.hooks ?? {})
    const absentEvents = expectedEvents.filter((e) => !Array.isArray(doc.hooks?.[e]) || doc.hooks[e].length === 0)
    if (absentEvents.length) fail(`${rel}: PAACM hooks missing for ${absentEvents.join(', ')} (\`paacm upgrade\` restores them)`)
    else if (!problems.length) ok(`${rel}: PAACM entries present`)
  }

  for (const rel of (await listFiles(fromPosix(targetDir, '.claude/skills'))).filter((p) => p.endsWith('/SKILL.md') && p.startsWith('paacm'))) {
    const dir = rel.split('/')[0]
    for (const p of validateSkill(await readTextOrNull(fromPosix(targetDir, `.claude/skills/${rel}`)), dir, `.claude/skills/${rel}`)) fail(p)
  }
  for (const dir of ['.claude/agents', '.cursor/agents']) {
    for (const rel of (await listFiles(fromPosix(targetDir, dir))).filter((p) => p.startsWith('paacm-') && p.endsWith('.md'))) {
      for (const p of validateAgent(await readTextOrNull(fromPosix(targetDir, `${dir}/${rel}`)), rel.replace(/\.md$/, ''), `${dir}/${rel}`)) fail(p)
    }
  }

  if (['L2', 'L3'].includes(lock.options.autonomy) && lock.options.ides.includes('claude')) {
    if (process.platform === 'linux') {
      const have = (cmd) => spawnSync('sh', ['-c', `command -v ${cmd}`], { stdio: 'ignore' }).status === 0
      const lacking = ['bwrap', 'socat'].filter((c) => !have(c))
      if (lacking.length) warn(`autonomy ${lock.options.autonomy} enables the Claude Code sandbox with failIfUnavailable; install ${lacking.join(' and ')} (bubblewrap) or shell commands will be refused`)
      else ok('sandbox prerequisites (bubblewrap, socat) found')
    } else if (process.platform === 'win32') {
      warn(`autonomy ${lock.options.autonomy} needs the Claude Code sandbox, which is not available on native Windows; use WSL2 or autonomy L1`)
    }
  }
  if (lock.options.layer === 'power' && lock.options.ides.includes('claude') && lock.options.ides.includes('cursor')) {
    ok('Cursor may also import the Claude Code hooks from .claude/settings.json; PAACM handles the duplicate calls, or you can turn the import off in Cursor settings')
  }
}

function finish(io, results) {
  const sign = { ok: '✓', warn: '!', fail: '✗' }
  for (const [kind, message] of results) (kind === 'fail' ? io.err : io.out)(`${sign[kind]} ${message}`)
  const failures = results.filter(([k]) => k === 'fail').length
  const warnings = results.filter(([k]) => k === 'warn').length
  io.out(`\n${failures} problem(s), ${warnings} warning(s).`)
  return failures ? 1 : 0
}
