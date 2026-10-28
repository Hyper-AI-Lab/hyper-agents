// Thin wrappers over git. Every call runs git directly (no shell), with
// standard input closed unless a call passes input, so file names and arguments
// are never interpreted.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, rmSync } from 'node:fs'
import path from 'node:path'

export const GIT_BUFFER = 64 * 1024 * 1024

export function git(cwd, args, { allowFail = false, input, env } = {}) {
  const r = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    input,
    env: env ? { ...process.env, ...env } : undefined,
    stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
    maxBuffer: GIT_BUFFER,
  })
  if (r.error) {
    if (allowFail) return { ok: false, stdout: '', stderr: r.error.message, status: null }
    throw Object.assign(new Error(`git ${args[0]}: ${r.error.message}`), { code: r.error.code })
  }
  const ok = r.status === 0
  if (!ok && !allowFail) throw new Error(`git ${args.join(' ')} failed: ${(r.stderr || '').trim()}`)
  return { ok, stdout: r.stdout, stderr: r.stderr, status: r.status }
}

export function isRepo(cwd) {
  return git(cwd, ['rev-parse', '--is-inside-work-tree'], { allowFail: true }).stdout.trim() === 'true'
}

export function topLevel(cwd) {
  const r = git(cwd, ['rev-parse', '--show-toplevel'], { allowFail: true })
  return r.ok ? r.stdout.trim() : null
}

export function head(cwd) {
  const r = git(cwd, ['rev-parse', '--verify', '--quiet', 'HEAD'], { allowFail: true })
  return r.ok ? r.stdout.trim() : null
}

export function shortSha(sha) {
  return sha ? sha.slice(0, 12) : sha
}

export function branch(cwd) {
  const r = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'], { allowFail: true })
  return r.ok ? r.stdout.trim() : null
}

export function commitExists(cwd, sha) {
  return git(cwd, ['cat-file', '-e', `${sha}^{commit}`], { allowFail: true }).ok
}

// Paths (POSIX, repository-relative) with uncommitted changes, including untracked
// files. Renames report both the old and the new path.
export function uncommittedPaths(cwd) {
  const r = git(cwd, ['status', '--porcelain=v1', '-z', '--untracked-files=all'], { allowFail: true })
  if (!r.ok) return []
  const out = []
  const parts = r.stdout.split('\0').filter(Boolean)
  for (let i = 0; i < parts.length; i++) {
    const entry = parts[i]
    const status = entry.slice(0, 2)
    out.push(entry.slice(3))
    if (status.includes('R') || status.includes('C')) {
      i++
      if (parts[i]) out.push(parts[i])
    }
  }
  return out
}

// Paths changed between a commit and HEAD (committed changes only).
export function committedSince(cwd, base) {
  if (!base) return []
  const r = git(cwd, ['diff', '--name-only', '-z', '--no-renames', `${base}`, 'HEAD'], { allowFail: true })
  return r.ok ? r.stdout.split('\0').filter(Boolean) : []
}

// Paths changed between a commit and HEAD, plus uncommitted changes.
export function changedSince(cwd, base) {
  return [...new Set([...uncommittedPaths(cwd), ...committedSince(cwd, base)])].sort()
}

// The paths a task changed itself since `base`: the files of the commits on its
// own (first-parent) line, the files a merge commit changed itself (conflict
// resolutions, from git's combined diff), the files of any merged commit that no
// remote-tracking branch has (a branch made and merged locally is the task's
// own work), and uncommitted changes. Only a change that arrived from a branch
// already on a remote, such as the base branch, is left out.
export function ownChangesSince(cwd, base) {
  const own = new Set(uncommittedPaths(cwd))
  if (!head(cwd)) return own
  const range = base ? [`${base}..HEAD`] : ['HEAD']
  const queries = [
    ['--first-parent', '--no-merges', ...range],
    ['--first-parent', '--merges', '--cc', ...range],
    ['--no-merges', ...range, '--not', '--remotes'],
  ]
  for (const args of queries) {
    const r = git(cwd, ['log', '--format=', '--name-only', '-z', '--no-renames', ...args], { allowFail: true })
    if (r.ok) for (const p of r.stdout.split('\0')) if (p !== '') own.add(p)
  }
  return own
}

// The change from `base` to the working tree, committed, uncommitted and
// untracked (unless git ignores the file): `files` ({ path, added, deleted,
// binary }, in diff order), the `diff` itself, and `skipped`, the paths git could
// not add (with its message). It is computed in a temporary index in the git
// directory, started from a copy of the real index (so unchanged files are not
// read again, and files git is told to skip stay skipped); the real index is
// never touched. Without a base it compares with the empty tree. Throws when git
// fails or the output exceeds the buffer (the error then has the code ENOBUFS).
export function workingTreeDiff(cwd, base) {
  const gitDir = git(cwd, ['rev-parse', '--absolute-git-dir']).stdout.trim()
  const index = path.join(gitDir, `paacm-review-index-${process.pid}-${Date.now()}`)
  const env = { GIT_INDEX_FILE: index }
  try {
    const realIndex = path.join(gitDir, 'index')
    if (existsSync(realIndex)) copyFileSync(realIndex, index)
    else git(cwd, head(cwd) ? ['read-tree', 'HEAD'] : ['read-tree', '--empty'], { env })
    const added = git(cwd, ['add', '-A', '--ignore-errors'], { env, allowFail: true })
    if (added.status !== 0 && added.status !== 1) throw new Error(`git add failed: ${(added.stderr || '').trim()}`)
    const skipped = [...(added.stderr || '').matchAll(/^error: (.+)$/gm)].map((m) => m[1].trim())
    const from = base ?? git(cwd, ['hash-object', '-t', 'tree', '--stdin'], { input: '' }).stdout.trim()
    // Fixed prefixes and unescaped non-ASCII names, so each section's header names
    // its file whatever the user's diff settings; submodules as commit lines.
    const diffArgs = ['-c', 'core.quotePath=false', 'diff', '--cached', '--no-ext-diff', '--no-renames', '--submodule=short', '--src-prefix=a/', '--dst-prefix=b/']
    const run = (extra) => git(cwd, [...diffArgs, ...extra, from], { env }).stdout
    const files = run(['--numstat', '-z'])
      .split('\0')
      .filter(Boolean)
      .map((entry) => {
        const [added, deleted, ...rest] = entry.split('\t')
        const binary = added === '-'
        return { path: rest.join('\t'), added: binary ? 0 : Number(added), deleted: binary ? 0 : Number(deleted), binary }
      })
    return { files, diff: run(['--no-color']), skipped }
  } finally {
    rmSync(index, { force: true })
    rmSync(`${index}.lock`, { force: true })
  }
}

// The paths git marks as generated (the linguist-generated attribute, as set in
// .gitattributes for GitHub's diff view).
export function generatedPaths(cwd, paths) {
  if (paths.length === 0) return new Set()
  const r = git(cwd, ['check-attr', '-z', '--stdin', 'linguist-generated'], { allowFail: true, input: `${paths.join('\0')}\0` })
  const out = new Set()
  if (!r.ok) return out
  const parts = r.stdout.split('\0')
  for (let i = 0; i + 2 < parts.length; i += 3) if (parts[i + 2] === 'set' || parts[i + 2] === 'true') out.add(parts[i])
  return out
}

export function recentCommits(cwd, count = 5) {
  const r = git(cwd, ['log', '--oneline', '--no-decorate', `-${count}`], { allowFail: true })
  return r.ok ? r.stdout.trim() : ''
}

export function statusShort(cwd, maxLines = 20) {
  const r = git(cwd, ['status', '--short'], { allowFail: true })
  if (!r.ok) return ''
  const lines = r.stdout.split('\n').filter(Boolean)
  const shown = lines.slice(0, maxLines)
  if (lines.length > maxLines) shown.push(`… ${lines.length - maxLines} more`)
  return shown.join('\n')
}
