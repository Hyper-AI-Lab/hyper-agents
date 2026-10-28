// Where the project is. A project is one git worktree with PAACM in it, and its
// task state lives in that worktree. A repository can have several worktrees:
// the main one, and linked ones next to it or nested in it (for example under
// .claude/worktrees/). A submodule is another repository inside the project.
import { readFileSync, realpathSync, statSync } from 'node:fs'
import path from 'node:path'
import { git, topLevel } from './git.mjs'

const stat = (p) => statSync(p, { throwIfNoEntry: false })

// "dir" for a .git directory (a main worktree), "file" for a .git file (a linked
// worktree or a submodule), or null.
function gitEntry(dir) {
  const s = stat(path.join(dir, '.git'))
  if (!s) return null
  return s.isDirectory() ? 'dir' : 'file'
}

// A .git file points into .git/worktrees/<name> for a linked worktree, and into
// the superproject's .git/modules/ for a submodule.
function isLinkedWorktree(dir) {
  try {
    const m = /^gitdir:\s*(.+?)\s*$/m.exec(readFileSync(path.join(dir, '.git'), 'utf8'))
    return Boolean(m) && path.basename(path.dirname(m[1].replace(/[\\/]+$/, ''))) === 'worktrees'
  } catch {
    return false
  }
}

// The project root for a starting directory: the nearest directory holding
// .agent/paacm.json, searching upwards but never past the root of the worktree
// the start lies in (a submodule's root is passed through); else that worktree's
// root; else the git top level; else the start itself.
export function findProjectDir(start = process.cwd()) {
  let dir = path.resolve(start)
  for (;;) {
    if (stat(path.join(dir, '.agent', 'paacm.json'))?.isFile()) return dir
    const entry = gitEntry(dir)
    if (entry === 'dir' || (entry === 'file' && isLinkedWorktree(dir))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return topLevel(start) ?? path.resolve(start)
}

// The root of the worktree a directory lies in (submodules passed through), or
// null outside git. Reads the file system only.
export function worktreeRoot(start) {
  let dir = path.resolve(start)
  for (;;) {
    const entry = gitEntry(dir)
    if (entry === 'dir' || (entry === 'file' && isLinkedWorktree(dir))) return dir
    const parent = path.dirname(dir)
    if (parent === dir) return null
    dir = parent
  }
}

function realOrResolved(p) {
  try {
    return realpathSync.native(p)
  } catch {
    return path.resolve(p)
  }
}

// The repository's shared git directory, as a real path, or null outside git.
function commonDir(dir) {
  const r = git(dir, ['rev-parse', '--git-common-dir'], { allowFail: true })
  if (!r.ok) return null
  const real = realOrResolved(path.resolve(dir, r.stdout.trim()))
  return process.platform === 'win32' || process.platform === 'darwin' ? real.toLowerCase() : real
}

// Whether two directories belong to worktrees of the same repository.
export function sameRepository(a, b) {
  if (realOrResolved(a) === realOrResolved(b)) return true
  const ca = commonDir(a)
  return ca !== null && ca === commonDir(b)
}
