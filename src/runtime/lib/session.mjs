// The working tree as it was when the session started, so that the stop hook can
// tell the agent's edits from work in progress the user already had. The
// baseline lives in the worktree's own git directory (paacm-sessions/), which
// belongs to the clone's owner: never in a temporary folder that other accounts
// on the machine share, and never in the working tree.
import { existsSync } from 'node:fs'
import { mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { readJsonOrNull, sha256, writeFileAtomic } from './fs.mjs'
import { git, uncommittedPaths } from './git.mjs'

const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

// Claude Code sends session_id; Cursor sends conversation_id.
export function sessionIdFrom(input) {
  const id = input.session_id ?? input.conversation_id
  return typeof id === 'string' && id !== '' ? id : null
}

// <git directory>/paacm-sessions/<name>, or null outside a git repository.
function sessionFile(projectDir, name) {
  const r = git(projectDir, ['rev-parse', '--absolute-git-dir'], { allowFail: true })
  if (!r.ok) return null
  return path.join(r.stdout.trim(), 'paacm-sessions', name)
}

const baselineFile = (projectDir, sessionId) => sessionFile(projectDir, `${sha256(`${path.resolve(projectDir)}\0${sessionId}`).slice(0, 32)}.json`)
const editedFile = (projectDir, sessionId) => sessionFile(projectDir, `${sha256(sessionId).slice(0, 32)}.edited`)

// Removes baselines (and leftover temporary files) older than 30 days.
async function prune(dir) {
  for (const name of await readdir(dir)) {
    const file = path.join(dir, name)
    try {
      if (Date.now() - (await stat(file)).mtimeMs > MAX_AGE_MS) await rm(file, { force: true })
    } catch {
      // Another session removed it first.
    }
  }
}

async function fileHash(projectDir, rel) {
  try {
    return sha256(await readFile(path.join(projectDir, ...rel.split('/'))))
  } catch {
    return null
  }
}

// Records the uncommitted files and their content, readable only by the owner.
// A resumed or compacted session keeps its first baseline. Throws when the
// baseline cannot be written; the caller reports that and carries on.
export async function recordBaseline(projectDir, sessionId) {
  if (!sessionId) return
  const file = baselineFile(projectDir, sessionId)
  if (!file || (await readBaseline(file)) !== null) return
  const files = {}
  for (const p of uncommittedPaths(projectDir)) files[p] = await fileHash(projectDir, p)
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  await prune(path.dirname(file))
  await writeFileAtomic(file, JSON.stringify({ files }), 0o600)
}

// Marks the checkout at projectDir as edited by this session. Used when the
// session's folder is not a git repository and holds several checkouts.
export async function markEdited(projectDir, sessionId) {
  const file = sessionId ? editedFile(projectDir, sessionId) : null
  if (!file || existsSync(file)) return
  await mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  await writeFileAtomic(file, '', 0o600)
}

// The checkouts directly inside a folder that is not a git repository, with an
// open task, that this session marked as edited.
export async function editedCheckouts(folder, sessionId) {
  if (!sessionId) return []
  const entries = await readdir(folder, { withFileTypes: true }).catch(() => [])
  return entries
    .filter((e) => e.isDirectory() && existsSync(path.join(folder, e.name, '.agent', 'tasks', 'CURRENT')))
    .map((e) => path.join(folder, e.name))
    .filter((dir) => {
      const file = editedFile(dir, sessionId)
      return file !== null && existsSync(file)
    })
}

async function readBaseline(file) {
  try {
    const b = await readJsonOrNull(file)
    return b && typeof b.files === 'object' && b.files !== null ? b : null
  } catch {
    return null
  }
}

// Uncommitted files that are new or different since the session started, or
// null when the session has no baseline.
export async function changedThisSession(projectDir, sessionId) {
  const file = sessionId ? baselineFile(projectDir, sessionId) : null
  if (!file) return null
  const baseline = await readBaseline(file)
  if (baseline === null) return null
  const changed = []
  for (const p of uncommittedPaths(projectDir)) {
    if (!Object.hasOwn(baseline.files, p) || baseline.files[p] !== (await fileHash(projectDir, p))) changed.push(p)
  }
  return changed
}
