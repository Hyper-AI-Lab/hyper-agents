// Shared helpers for the test suites: temporary git repositories, running the
// CLI and the hook scripts as the IDEs do, and capturing output.
import { spawnSync } from 'node:child_process'
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const BIN = path.join(ROOT, 'bin', 'paacm.mjs')
export const RUNTIME = path.join(ROOT, 'src', 'runtime', 'paacm.mjs')
// The hooks as the plugin ships them (identical to src/runtime/hooks, which the
// drift test checks), next to the generated core-rules.md they read.
export const HOOKS = path.join(ROOT, 'plugins', 'paacm', 'skills', 'paacm', 'scripts', 'hooks')

// An empty global git configuration, so that the developer's settings (signing,
// hooks, line endings) never reach the tests. A file works on every platform.
const EMPTY_GITCONFIG = path.join(os.tmpdir(), 'paacm-test-empty.gitconfig')
writeFileSync(EMPTY_GITCONFIG, '')
const GIT_ENV = { GIT_CONFIG_GLOBAL: EMPTY_GITCONFIG, GIT_CONFIG_NOSYSTEM: '1' }

// A fresh directory, removed after the test. Real path, so that it matches what
// git reports (macOS /var is a link to /private/var; Windows may give 8.3 names).
export function tempDir(t, prefix = 'paacm-test-') {
  const dir = realpathSync.native(mkdtempSync(path.join(os.tmpdir(), prefix)))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  return dir
}

// Git with a fixed identity and none of the developer's global settings.
export function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'user.name=PAACM Test', '-c', 'user.email=test@example.com', '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_ENV },
  })
  if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${r.stderr}`)
  return r.stdout.trim()
}

export async function repo(t, { commit = true, files = {} } = {}) {
  const dir = tempDir(t)
  git(dir, 'init', '-q')
  await writeFiles(dir, files)
  if (commit) {
    git(dir, 'add', '-A')
    git(dir, 'commit', '-q', '--allow-empty', '-m', 'base')
  }
  return dir
}

export async function writeFiles(dir, files) {
  for (const [rel, text] of Object.entries(files)) {
    const abs = path.join(dir, ...rel.split('/'))
    await mkdir(path.dirname(abs), { recursive: true })
    await writeFile(abs, text)
  }
}

export const read = (dir, rel) => readFile(path.join(dir, ...rel.split('/')), 'utf8')
export async function readOrNull(dir, rel) {
  try {
    return await read(dir, rel)
  } catch {
    return null
  }
}

export function commitAll(dir, message = 'change') {
  git(dir, 'add', '-A')
  git(dir, 'commit', '-q', '--allow-empty', '-m', message)
  return git(dir, 'rev-parse', 'HEAD')
}

// The environment for child processes, without the IDE's project variables, so
// that a test never acts on the repository it runs in.
function cleanEnv(extra = {}) {
  const env = { ...process.env, ...GIT_ENV }
  delete env.CLAUDE_PROJECT_DIR
  delete env.CURSOR_PROJECT_DIR
  delete env.CURSOR_VERSION
  Object.assign(env, extra)
  for (const [k, v] of Object.entries(extra)) if (v === undefined) delete env[k]
  return env
}

function run(file, args, { cwd, input, env } = {}) {
  const r = spawnSync(process.execPath, [file, ...args], { cwd, input, encoding: 'utf8', env: cleanEnv(env), timeout: 120_000 })
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, out: `${r.stdout}${r.stderr}` }
}

// The kit CLI (`npx github:Hyper-AI-Lab/hyper-agents …`).
export const cli = (cwd, ...args) => run(BIN, args, { cwd })

// The runtime the agent runs (`node .claude/skills/paacm/scripts/paacm.mjs …`).
export const runtime = (cwd, ...args) => run(RUNTIME, args, { cwd })

// A hook script, fed one JSON payload on standard input as the IDE does.
export function hook(name, payload, { projectDir, env = {} } = {}) {
  const extra = { ...env }
  if (projectDir && /^[A-Z]/.test(payload.hook_event_name ?? '')) extra.CLAUDE_PROJECT_DIR = projectDir
  const r = run(path.join(HOOKS, `${name}.mjs`), [], { cwd: projectDir, input: JSON.stringify(payload), env: extra })
  let json = null
  if (r.stdout.trim()) json = JSON.parse(r.stdout)
  return { ...r, json }
}

// An io object for in-process command functions.
export function captureIo() {
  const lines = { out: [], err: [] }
  return {
    io: { out: (l) => lines.out.push(l), err: (l) => lines.err.push(l) },
    lines,
    text: () => [...lines.out, ...lines.err].join('\n'),
  }
}
