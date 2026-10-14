// Thin wrappers over git. Every call runs git directly (no shell), with
// standard input closed, so file names and arguments are never interpreted.
import { spawnSync } from 'node:child_process'

export function git(cwd, args, { allowFail = false } = {}) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 })
  if (r.error) {
    if (allowFail) return { ok: false, stdout: '', stderr: r.error.message, status: null }
    throw new Error(`git ${args[0]}: ${r.error.message}`)
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

// Paths changed between a commit and HEAD, plus uncommitted changes.
export function changedSince(cwd, base) {
  const set = new Set(uncommittedPaths(cwd))
  if (base) {
    const r = git(cwd, ['diff', '--name-only', '-z', '--no-renames', `${base}`, 'HEAD'], { allowFail: true })
    if (r.ok) for (const p of r.stdout.split('\0').filter(Boolean)) set.add(p)
  }
  return [...set].sort()
}

// The full diff from base to the working tree (committed and uncommitted changes).
export function diffSince(cwd, base) {
  const args = base ? ['diff', '--no-color', base] : ['diff', '--no-color', 'HEAD']
  const r = git(cwd, args, { allowFail: true })
  return r.ok ? r.stdout : ''
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
