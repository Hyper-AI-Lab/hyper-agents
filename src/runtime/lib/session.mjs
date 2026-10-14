// The working tree as it was when the session started, so that the stop hook can
// tell the agent's edits from work in progress the user already had. The
// baseline lives in the system temporary folder, never in the repository.
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { readJsonOrNull, sha256, writeFileAtomic } from './fs.mjs'
import { uncommittedPaths } from './git.mjs'

// Claude Code sends session_id; Cursor sends conversation_id.
export function sessionIdFrom(input) {
  const id = input.session_id ?? input.conversation_id
  return typeof id === 'string' && id !== '' ? id : null
}

function baselineFile(projectDir, sessionId) {
  return path.join(os.tmpdir(), 'paacm-sessions', `${sha256(`${path.resolve(projectDir)}\0${sessionId}`).slice(0, 32)}.json`)
}

async function fileHash(projectDir, rel) {
  try {
    return sha256(await readFile(path.join(projectDir, ...rel.split('/'))))
  } catch {
    return null
  }
}

// Records the uncommitted files and their content. A resumed or compacted
// session keeps its first baseline.
export async function recordBaseline(projectDir, sessionId) {
  if (!sessionId) return
  const file = baselineFile(projectDir, sessionId)
  if ((await readBaseline(file)) !== null) return
  const files = {}
  for (const p of uncommittedPaths(projectDir)) files[p] = await fileHash(projectDir, p)
  await writeFileAtomic(file, JSON.stringify({ files }))
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
  if (!sessionId) return null
  const baseline = await readBaseline(baselineFile(projectDir, sessionId))
  if (baseline === null) return null
  const changed = []
  for (const p of uncommittedPaths(projectDir)) {
    if (!Object.hasOwn(baseline.files, p) || baseline.files[p] !== (await fileHash(projectDir, p))) changed.push(p)
  }
  return changed
}
