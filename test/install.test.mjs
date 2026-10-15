import assert from 'node:assert/strict'
import { existsSync, statSync, symlinkSync } from 'node:fs'
import { readFile, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { test } from 'node:test'
import { cli, commitAll, git, read, readOrNull, repo, ROOT, tempDir, writeFiles } from './helpers.mjs'

const v2 = JSON.parse(await readFile(path.join(ROOT, 'test', 'fixtures', 'paacm-2.0.0.json'), 'utf8'))
const lock = async (dir) => JSON.parse(await read(dir, '.agent/paacm.lock.json'))
const trackedFiles = (dir) =>
  git(dir, 'ls-files', '--others', '--cached', '--exclude-standard')
    .split('\n')
    .filter(Boolean)
    .sort()

test('init --dry-run prints the plan and writes nothing', async (t) => {
  const dir = await repo(t)
  const r = cli(dir, 'init', '--dry-run')
  assert.equal(r.code, 0, r.out)
  assert.match(r.stdout, /ADD {10}\.agent\/checks\.conf/)
  assert.match(r.stdout, /Dry run: nothing was written/)
  assert.deepEqual(trackedFiles(dir), [])
})

test('init installs the core layer and records it; a second init refuses', async (t) => {
  const dir = await repo(t)
  const r = cli(dir, 'init')
  assert.equal(r.code, 0, r.out)
  for (const rel of ['AGENTS.md', 'CLAUDE.md', '.claude/skills/paacm/SKILL.md', '.claude/skills/paacm/scripts/paacm.mjs', '.agent/paacm.json', '.agent/checks.conf', '.agent/.gitignore']) {
    assert.ok(existsSync(path.join(dir, rel)), rel)
  }
  assert.ok(!existsSync(path.join(dir, '.claude/settings.json')), 'the core layer installs no hooks')
  const l = await lock(dir)
  assert.equal(l.version, '3.0.0')
  assert.deepEqual(l.options, { ides: ['claude', 'cursor'], layer: 'core', autonomy: 'L1' })
  assert.ok(l.files['.claude/skills/paacm/SKILL.md'].sha256)
  assert.match(await read(dir, 'CLAUDE.md'), /^@AGENTS\.md$/m)
  const again = cli(dir, 'init')
  assert.equal(again.code, 1)
  assert.match(again.stderr, /already installed/)
})

test('installed files get normal permissions and runtime scripts are executable (D7)', { skip: process.platform === 'win32' }, async (t) => {
  const dir = await repo(t)
  assert.equal(cli(dir, 'init').code, 0)
  assert.equal(statSync(path.join(dir, 'AGENTS.md')).mode & 0o777 & ~0o022, 0o644 & ~0o022)
  assert.ok(statSync(path.join(dir, '.claude/skills/paacm/scripts/paacm.mjs')).mode & 0o100)
})

test('the user content of AGENTS.md and the settings files survives install and uninstall', async (t) => {
  const agents = '# Our rules\r\n\r\nUse tabs.\r\n'
  const settings = { model: 'opus', permissions: { allow: ['Bash(make:*)'], defaultMode: 'default' }, hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] } }
  const dir = await repo(t, { files: { 'AGENTS.md': agents, '.claude/settings.json': JSON.stringify(settings) } })
  const r = cli(dir, 'init', '--layer', 'power', '--autonomy', 'L2')
  assert.equal(r.code, 0, r.out)
  assert.match(r.stdout, /INSERT BLOCK AGENTS\.md/)
  assert.match(r.stdout, /permissions\.defaultMode is already "default"; kept \(PAACM suggests "acceptEdits"\)/)
  const merged = JSON.parse(await read(dir, '.claude/settings.json'))
  assert.equal(merged.model, 'opus')
  assert.equal(merged.permissions.defaultMode, 'default')
  assert.ok(merged.permissions.allow.includes('Bash(make:*)'))
  assert.ok(merged.hooks.PreToolUse.length > 0)
  assert.ok((await read(dir, 'AGENTS.md')).endsWith(agents))

  const u = cli(dir, 'uninstall')
  assert.equal(u.code, 0, u.out)
  assert.equal(await read(dir, 'AGENTS.md'), agents, 'AGENTS.md is restored byte for byte')
  assert.deepEqual(JSON.parse(await read(dir, '.claude/settings.json')), settings)
  assert.deepEqual(trackedFiles(dir), ['.claude/settings.json', 'AGENTS.md'])
})

test('a full power install followed by uninstall leaves nothing behind', async (t) => {
  const dir = await repo(t)
  assert.equal(cli(dir, 'init', '--layer', 'power', '--autonomy', 'L2').code, 0)
  assert.equal(cli(dir, 'uninstall').code, 0)
  assert.deepEqual(trackedFiles(dir), [])
  assert.ok(!existsSync(path.join(dir, '.claude')) && !existsSync(path.join(dir, '.agent')))
})

test('conflicts stop init before anything is written', async (t) => {
  const dir = await repo(t, { files: { '.agent/checks.conf': 'quick|mine|true\n', '.claude/settings.json': '{ // mine\n "model": "opus" }\n' } })
  const r = cli(dir, 'init', '--layer', 'power')
  assert.equal(r.code, 1)
  assert.match(r.stdout, /CONFLICT {5}\.agent\/checks\.conf — a different file already exists here/)
  assert.match(r.stdout, /CONFLICT {5}\.claude\/settings\.json — the file contains comments/)
  assert.match(r.stderr, /2 conflict\(s\); nothing was written/)
  assert.deepEqual(trackedFiles(dir), ['.agent/checks.conf', '.claude/settings.json'])
  assert.equal(await read(dir, '.agent/checks.conf'), 'quick|mine|true\n')
})

test('the installer never writes through a symbolic link', async (t) => {
  const dir = await repo(t)
  const elsewhere = tempDir(t)
  try {
    symlinkSync(elsewhere, path.join(dir, '.cursor'), 'dir')
  } catch {
    return t.skip('symbolic links are not available')
  }
  const r = cli(dir, 'init', '--layer', 'power')
  assert.equal(r.code, 1)
  assert.match(r.stdout, /refusing to write through symbolic link: \.cursor/)
  assert.equal(existsSync(path.join(elsewhere, 'hooks.json')), false)
  assert.equal(existsSync(path.join(dir, 'AGENTS.md')), false)
})

test('the kit itself, or a folder inside it, is refused as a target (D5)', () => {
  for (const target of [ROOT, path.join(ROOT, 'docs')]) {
    const r = cli(ROOT, 'init', target, '--dry-run')
    assert.equal(r.code, 1)
    assert.match(r.stderr, /the PAACM kit itself/)
  }
})

test('upgrade keeps changed files, restores missing ones and applies a new autonomy level', async (t) => {
  const dir = await repo(t)
  assert.equal(cli(dir, 'init', '--layer', 'power', '--ide', 'claude').code, 0)
  await writeFile(path.join(dir, '.claude/skills/paacm/SKILL.md'), `${await read(dir, '.claude/skills/paacm/SKILL.md')}\nlocal note\n`)
  await rm(path.join(dir, '.claude/agents/paacm-reviewer.md'))
  const r = cli(dir, 'upgrade', '--autonomy', 'L0')
  assert.equal(r.code, 0, r.out)
  assert.match(r.stdout, /KEEP {9}\.claude\/skills\/paacm\/SKILL\.md — you changed this file/)
  assert.match(r.stdout, /RESTORE {6}\.claude\/agents\/paacm-reviewer\.md/)
  assert.match(await read(dir, '.claude/skills/paacm/SKILL.md'), /local note/)
  assert.ok(existsSync(path.join(dir, '.claude/agents/paacm-reviewer.md')))
  assert.equal(JSON.parse(await read(dir, '.agent/paacm.json')).autonomy, 'L0')
  assert.equal(JSON.parse(await read(dir, '.claude/settings.json')).permissions.defaultMode, 'plan')
  assert.deepEqual((await lock(dir)).options, { ides: ['claude'], layer: 'power', autonomy: 'L0' })

  // A file the kit no longer ships is removed when unchanged.
  const l = await lock(dir)
  await writeFiles(dir, { '.claude/skills/paacm/old.md': 'old' })
  l.files['.claude/skills/paacm/old.md'] = { sha256: (await import('../src/runtime/lib/fs.mjs')).sha256('old') }
  await writeFile(path.join(dir, '.agent/paacm.lock.json'), JSON.stringify(l))
  const r2 = cli(dir, 'upgrade')
  assert.match(r2.stdout, /REMOVE {7}\.claude\/skills\/paacm\/old\.md/)
  assert.ok(!existsSync(path.join(dir, '.claude/skills/paacm/old.md')))
})

test('upgrade and uninstall need an existing installation', async (t) => {
  const dir = await repo(t)
  assert.match(cli(dir, 'upgrade').stderr, /PAACM 3 is not installed/)
  assert.match(cli(dir, 'uninstall').stderr, /PAACM 3 is not installed/)
})

test('upgrade --from-v2 replaces unchanged PAACM 2 files and keeps edited ones', async (t) => {
  const dir = await repo(t, { files: v2.files })
  await writeFiles(dir, {
    '.agent/policies/security.md': `${v2.files['.agent/policies/security.md']}\n# local edit\n`,
    '.agent/checks.conf': `${v2.files['.agent/checks.conf']}quick|mine|true\r\n`,
  })
  commitAll(dir)
  const r = cli(dir, 'upgrade', '--from-v2')
  assert.equal(r.code, 0, r.out)
  for (const rel of ['scripts/agent-check', 'scripts/install-to-project.sh', '.agent/workflows/implement.md', '.cursor/commands/paacm.md', 'docs/agentic-kit/USER_GUIDE.md']) {
    assert.ok(!existsSync(path.join(dir, rel)), `${rel} is removed`)
  }
  assert.match(await read(dir, '.agent/policies/security.md'), /local edit/)
  const checks = await read(dir, '.agent/checks.conf')
  assert.doesNotMatch(checks, /shell-syntax/, 'the 2.0.0 check of the removed scripts is removed')
  assert.match(checks, /quick\|mine\|true\r\n/, 'the user line is kept as written')
  assert.ok((await read(dir, 'AGENTS.md')).startsWith('<!-- paacm:begin'))
  assert.equal(cli(dir, 'check', '--tier', 'quick').code, 0)
  assert.ok((await lock(dir)).files['.claude/skills/paacm/SKILL.md'])
})

test('upgrade --from-v2 keeps the script check when both scripts are kept, and stops on an edited skill', async (t) => {
  const kept = await repo(t, { files: v2.files })
  await writeFiles(kept, {
    'scripts/agent-check': `${v2.files['scripts/agent-check']}# mine\n`,
    'scripts/install-to-project.sh': `${v2.files['scripts/install-to-project.sh']}# mine\n`,
    '.agent/checks.conf': `${v2.files['.agent/checks.conf']}quick|mine|true\n`,
  })
  assert.equal(cli(kept, 'upgrade', '--from-v2').code, 0)
  assert.match(await read(kept, '.agent/checks.conf'), /shell-syntax/)

  const edited = await repo(t, { files: { ...v2.files, '.claude/skills/paacm/SKILL.md': `${v2.files['.claude/skills/paacm/SKILL.md']}x\n` } })
  const r = cli(edited, 'upgrade', '--from-v2')
  assert.equal(r.code, 1)
  assert.match(r.stderr, /1 conflict\(s\); nothing was written/)
  assert.ok(existsSync(path.join(edited, 'scripts/agent-check')), 'nothing was removed')
  assert.equal(await readOrNull(edited, '.agent/paacm.lock.json'), null)

  const none = await repo(t)
  assert.match(cli(none, 'upgrade', '--from-v2').stderr, /no PAACM 2 files found/)
})

test('--cursor-user installs, updates and removes the plugin in a local plugins folder', async (t) => {
  const plugins = tempDir(t)
  const dir = await repo(t)
  assert.equal(cli(dir, 'init', '--cursor-user', '--cursor-plugins-dir', plugins).code, 0)
  const manifest = JSON.parse(await read(plugins, 'paacm/.cursor-plugin/plugin.json'))
  assert.equal(manifest.name, 'paacm')
  assert.ok(existsSync(path.join(plugins, 'paacm/rules/paacm-core.mdc')))
  assert.equal(cli(dir, 'upgrade', '--cursor-user', '--cursor-plugins-dir', plugins).code, 0)
  assert.equal(cli(dir, 'uninstall', '--cursor-user', '--cursor-plugins-dir', plugins).code, 0)
  assert.ok(!existsSync(path.join(plugins, 'paacm')))
  await writeFiles(plugins, { 'paacm/x.txt': 'someone else' })
  const r = cli(dir, 'init', '--cursor-user', '--cursor-plugins-dir', plugins)
  assert.equal(r.code, 1)
  assert.match(r.stderr, /is not the PAACM plugin/)
  assert.equal(await read(plugins, 'paacm/x.txt'), 'someone else')
})
