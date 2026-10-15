// Task state under .agent/tasks/: the current-task pointer, state.json, and the
// append-only progress log. All writes are atomic.
import { appendFile, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { readJsonOrNull, readTextOrNull, stableJson, writeFileAtomic } from './fs.mjs'
import { changedSince, diffSince, head, shortSha, uncommittedPaths } from './git.mjs'
import { matchesAny } from './glob.mjs'

export const TASKS_DIR = '.agent/tasks'
export const ROUTES = ['FAST', 'STANDARD', 'DEEP']
export const LEVELS = ['L0', 'L1', 'L2', 'L3']
export const PHASES = ['specifying', 'exploring', 'planning', 'testing', 'implementing', 'verifying', 'reviewing']
export const STATUSES = ['triaged', ...PHASES, 'done', 'blocked']
const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export class TaskError extends Error {}

const nowIso = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

export function tasksDir(projectDir) {
  return path.join(projectDir, ...TASKS_DIR.split('/'))
}

export function taskDir(projectDir, id) {
  return path.join(tasksDir(projectDir), id)
}

export async function currentTaskId(projectDir) {
  const text = await readTextOrNull(path.join(tasksDir(projectDir), 'CURRENT'))
  const id = text ? text.trim() : ''
  return id === '' ? null : id
}

export async function readState(projectDir, id) {
  const state = await readJsonOrNull(path.join(taskDir(projectDir, id), 'state.json'))
  if (state === null) throw new TaskError(`task ${id} has no state.json`)
  return state
}

export async function writeState(projectDir, state) {
  state.updatedAt = nowIso()
  await writeFileAtomic(path.join(taskDir(projectDir, state.id), 'state.json'), stableJson(state))
}

// The current task's state, or null when there is no current task.
export async function currentTask(projectDir) {
  const id = await currentTaskId(projectDir)
  if (!id) return null
  try {
    return await readState(projectDir, id)
  } catch (error) {
    if (error instanceof TaskError) return null
    throw error
  }
}

export async function appendProgress(projectDir, id, text) {
  const line = `- ${nowIso()} ${text.replace(/\s*\n\s*/g, ' ').trim()}\n`
  await appendFile(path.join(taskDir(projectDir, id), 'progress.md'), line)
}

async function setCurrent(projectDir, id) {
  const file = path.join(tasksDir(projectDir), 'CURRENT')
  if (id === null) await rm(file, { force: true })
  else await writeFileAtomic(file, `${id}\n`)
}

export async function startTask(projectDir, { slug, route, summary, highStakes = false, autonomy, defaultAutonomy = 'L1', date = new Date() }) {
  if (!slug || !SLUG_RE.test(slug)) throw new TaskError('--slug must be lowercase letters, digits and hyphens')
  if (!ROUTES.includes(route)) throw new TaskError(`--route must be one of ${ROUTES.join(', ')}`)
  if (!summary || summary.trim() === '') throw new TaskError('--summary is required')
  if (autonomy !== undefined && !LEVELS.includes(autonomy)) throw new TaskError(`--autonomy must be one of ${LEVELS.join(', ')}`)
  const active = await currentTask(projectDir)
  if (active && !['done', 'blocked'].includes(active.status)) {
    throw new TaskError(`task ${active.id} is still ${active.status}; finish it (paacm task done), block it (paacm task block), or ask the human before starting another`)
  }
  const effectiveRoute = highStakes ? 'DEEP' : route
  const effectiveAutonomy = highStakes ? 'L1' : (autonomy ?? defaultAutonomy)
  const id = `${date.toISOString().slice(0, 10)}-${slug}`
  const dir = taskDir(projectDir, id)
  if (await readTextOrNull(path.join(dir, 'state.json'))) throw new TaskError(`task ${id} already exists; choose another --slug or run paacm task resume ${id}`)
  await mkdir(dir, { recursive: true })
  // Task state is local working data. A project install ignores it through
  // .agent/.gitignore; a plugin install has no such file.
  const ignore = path.join(tasksDir(projectDir), '.gitignore')
  if ((await readTextOrNull(ignore)) === null) await writeFileAtomic(ignore, '*\n')
  const base = head(projectDir)
  const state = {
    id,
    summary: summary.trim(),
    route: effectiveRoute,
    highStakes: Boolean(highStakes),
    autonomy: effectiveAutonomy,
    status: 'triaged',
    baseCommit: base,
    testsApprovedAt: null,
    gateFailures: 0,
    lastGate: null,
    blocked: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  }
  await writeState(projectDir, state)
  await writeFileAtomic(path.join(dir, 'progress.md'), `# Progress: ${id}\n\n`)
  const notes = []
  if (highStakes && route !== 'DEEP') notes.push(`route raised from ${route} to DEEP (high-stakes)`)
  if (highStakes && autonomy && autonomy !== 'L1') notes.push(`autonomy set to L1 (high-stakes)`)
  await appendProgress(
    projectDir,
    id,
    `started: route ${effectiveRoute}${highStakes ? ' high-stakes' : ''}, autonomy ${effectiveAutonomy}, base ${shortSha(base) ?? 'none'} — ${state.summary}${notes.length ? ` (${notes.join('; ')})` : ''}`,
  )
  await setCurrent(projectDir, id)
  return state
}

async function requireCurrent(projectDir) {
  const state = await currentTask(projectDir)
  if (!state) throw new TaskError('there is no current task; start one with paacm task start')
  return state
}

export async function setPhase(projectDir, phase) {
  if (!PHASES.includes(phase)) throw new TaskError(`phase must be one of ${PHASES.join(', ')}`)
  const state = await requireCurrent(projectDir)
  if (state.status === 'done') throw new TaskError(`task ${state.id} is done`)
  const previous = state.status
  state.status = phase
  if (previous === 'blocked') state.blocked = null
  await writeState(projectDir, state)
  await appendProgress(projectDir, state.id, `phase: ${previous} → ${phase}`)
  return state
}

export async function logProgress(projectDir, text) {
  if (!text || text.trim() === '') throw new TaskError('nothing to log')
  const state = await requireCurrent(projectDir)
  await appendProgress(projectDir, state.id, text)
  return state
}

export async function approveTests(projectDir, config) {
  const state = await requireCurrent(projectDir)
  const sha = head(projectDir)
  if (!sha) throw new TaskError('the repository has no commits yet; commit the tests first')
  const dirtyTests = uncommittedPaths(projectDir).filter((p) => matchesAny(p, config.protect.tests))
  if (dirtyTests.length) {
    throw new TaskError(`commit the tests before approving them; uncommitted test files: ${dirtyTests.slice(0, 10).join(', ')}`)
  }
  const previous = state.testsApprovedAt
  state.testsApprovedAt = sha
  state.gateFailures = 0
  await writeState(projectDir, state)
  await appendProgress(projectDir, state.id, `tests approved at ${shortSha(sha)}${previous ? ` (previous baseline ${shortSha(previous)})` : ''}`)
  return state
}

export async function blockTask(projectDir, { trigger, reason }) {
  const n = Number(trigger)
  if (!Number.isInteger(n) || n < 1 || n > 7) throw new TaskError('--trigger must be a number from 1 to 7')
  if (!reason || reason.trim() === '') throw new TaskError('--reason is required')
  const state = await requireCurrent(projectDir)
  state.status = 'blocked'
  state.blocked = { trigger: n, reason: reason.trim(), at: nowIso() }
  await writeState(projectDir, state)
  await appendProgress(projectDir, state.id, `BLOCKED: trigger ${n} — ${reason.trim()}`)
  await setCurrent(projectDir, null)
  return state
}

export async function resumeTask(projectDir, id) {
  if (!id) throw new TaskError('give the task id to resume')
  const active = await currentTask(projectDir)
  if (active && active.id !== id && !['done', 'blocked'].includes(active.status)) {
    throw new TaskError(`task ${active.id} is still ${active.status}; finish or block it first`)
  }
  const state = await readState(projectDir, id)
  if (state.status === 'done') throw new TaskError(`task ${id} is done`)
  await setCurrent(projectDir, id)
  await appendProgress(projectDir, id, `resumed (status ${state.status})`)
  return state
}

// Files the gate's "unchanged since the gate" condition ignores: task working files.
function isTaskFile(p) {
  return p === '.agent/tasks' || p.startsWith('.agent/tasks/')
}

export async function finishTask(projectDir) {
  const state = await requireCurrent(projectDir)
  const sha = head(projectDir)
  const gate = state.lastGate
  if (!gate || !gate.passed) throw new TaskError('the latest gate did not pass; run paacm gate and fix what it reports')
  if (gate.head !== sha) throw new TaskError(`the gate last passed at ${shortSha(gate.head)}, but HEAD is now ${shortSha(sha)}; run paacm gate again`)
  const dirty = uncommittedPaths(projectDir).filter((p) => !isTaskFile(p))
  if (dirty.length) throw new TaskError(`uncommitted changes since the gate: ${dirty.slice(0, 10).join(', ')}; commit them and run paacm gate again`)
  if (gate.dirty) throw new TaskError('the gate passed on uncommitted changes; commit them and run paacm gate again')
  state.status = 'done'
  await writeState(projectDir, state)
  await appendProgress(projectDir, state.id, `done at ${shortSha(sha)}`)
  await setCurrent(projectDir, null)
  return state
}

// Writes review-input.md for the reviewer: the diff since baseCommit, the
// acceptance criteria (or summary) and the latest gate result.
export async function writeReviewInput(projectDir) {
  const state = await requireCurrent(projectDir)
  const dir = taskDir(projectDir, state.id)
  const spec = await readTextOrNull(path.join(dir, 'SPEC.md'))
  let requirements = `Task summary: ${state.summary}`
  if (spec) {
    const m = /^##\s*6\.?\s*Acceptance criteria\s*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/im.exec(spec)
    requirements = m ? `Acceptance criteria (from SPEC.md):\n\n${m[1].trim()}` : `Specification:\n\n${spec.trim()}`
  }
  const changed = changedSince(projectDir, state.baseCommit).filter((p) => !isTaskFile(p))
  const diff = diffSince(projectDir, state.baseCommit)
  const gate = state.lastGate
    ? `Latest gate: tier ${state.lastGate.tier}, ${state.lastGate.passed ? 'passed' : `failed (${state.lastGate.failed})`}, at ${shortSha(state.lastGate.head)}${state.lastGate.dirty ? ' with uncommitted changes' : ''}, ${state.lastGate.at}`
    : 'The gate has not been run for this task.'
  const text = [
    `# Review input: ${state.id}`,
    '',
    'You are reviewing a change you did not write. Judge only the diff against the requirements and the evidence below. Report correctness bugs, unmet requirements and out-of-scope changes, each with file:line and evidence. Do not suggest style changes or refactoring. Reply "No blocking findings" if nothing qualifies.',
    '',
    '## Requirements',
    '',
    requirements,
    '',
    '## Evidence',
    '',
    gate,
    '',
    '## Changed files',
    '',
    changed.length ? changed.map((p) => `- ${p}`).join('\n') : '(none)',
    '',
    '## Diff',
    '',
    '```diff',
    diff.trimEnd(),
    '```',
    '',
  ].join('\n')
  const file = path.join(dir, 'review-input.md')
  await writeFileAtomic(file, text)
  return { state, file }
}

export async function readProgressTail(projectDir, id, lines = 12) {
  const text = await readTextOrNull(path.join(taskDir(projectDir, id), 'progress.md'))
  if (!text) return ''
  return text.split('\n').filter((l) => l.startsWith('- ')).slice(-lines).join('\n')
}

export async function readPlanHead(projectDir, id, lines = 40) {
  const text = await readTextOrNull(path.join(taskDir(projectDir, id), 'PLAN.md'))
  if (!text) return ''
  const all = text.split('\n')
  return all.slice(0, lines).join('\n') + (all.length > lines ? '\n…' : '')
}
