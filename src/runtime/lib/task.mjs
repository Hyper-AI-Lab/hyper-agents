// Task state under .agent/tasks/: the current-task pointer, state.json, and the
// append-only progress log. All writes are atomic.
import { appendFile, mkdir, rm } from 'node:fs/promises'
import path from 'node:path'
import { listFiles, readJsonOrNull, readTextOrNull, stableJson, writeFileAtomic } from './fs.mjs'
import { GIT_BUFFER, generatedPaths, head, shortSha, uncommittedPaths, workingTreeDiff } from './git.mjs'
import { auditTask } from './audit.mjs'
import { isProtectedTest, tierAtLeast, tierForRoute } from './config.mjs'
import { readExtension, sectionOf } from './extensions.mjs'
import { referencePath } from './references.mjs'

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
  const dirtyTests = uncommittedPaths(projectDir).filter((p) => isProtectedTest(p, config))
  if (dirtyTests.length) {
    throw new TaskError(`commit the tests before approving them; uncommitted test files: ${dirtyTests.slice(0, 10).join(', ')}`)
  }
  // A new baseline must not absorb a change to the frozen files: that would let
  // the writer edit an approved test (for example through the shell) and approve
  // its own edit. Such a change needs reopen-tests, which the human confirms.
  if (state.testsApprovedAt) {
    const changed = auditTask(projectDir, config, state).violations.map((v) => v.path)
    if (changed.length) {
      throw new TaskError(
        `the tests were approved at ${shortSha(state.testsApprovedAt)} and these frozen files changed since: ${changed.slice(0, 10).join(', ')}. A new baseline needs the human: after they approve the change in the conversation, run paacm task reopen-tests --reason "<the approved change>" (the IDE asks them to confirm), then paacm task approve-tests`,
      )
    }
  }
  const previous = state.testsApprovedAt
  const from = state.status
  state.testsApprovedAt = sha
  state.gateFailures = 0
  if (from === 'testing') state.status = 'implementing'
  await writeState(projectDir, state)
  await appendProgress(projectDir, state.id, `tests approved at ${shortSha(sha)}${previous ? ` (previous baseline ${shortSha(previous)})` : ''}${from === 'testing' ? '; phase: testing → implementing' : ''}`)
  return state
}

// Clears the approved test baseline so that a test change the human approved in
// the conversation can be made. The shell guard asks the human to confirm this
// command, so the writer cannot reopen its own tests unnoticed.
export async function reopenTests(projectDir, { reason }) {
  if (typeof reason !== 'string' || reason.trim() === '') throw new TaskError('--reason must say which test change the human approved')
  const state = await requireCurrent(projectDir)
  if (!state.testsApprovedAt) throw new TaskError(`the tests of task ${state.id} are not approved; there is nothing to reopen`)
  const previous = state.testsApprovedAt
  state.testsApprovedAt = null
  state.status = 'testing'
  await writeState(projectDir, state)
  await appendProgress(projectDir, state.id, `tests reopened (approved at ${shortSha(previous)}): ${reason.trim()}`)
  return { state, previous }
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

// Closes the task. It must have reached its last phase (8 for STANDARD and DEEP,
// 7 for FAST), have approved tests, a gate that passed at the route's tier at the
// current commit with nothing uncommitted, and a REPORT.md whose OUTCOME is done.
export async function finishTask(projectDir, config) {
  const state = await requireCurrent(projectDir)
  const ref = (file) => referencePath(projectDir, file)
  if (state.route === 'FAST' ? !['verifying', 'reviewing'].includes(state.status) : state.status !== 'reviewing') {
    throw new TaskError(
      state.route === 'FAST'
        ? `task ${state.id} is ${state.status}; a FAST task is done after phase 7, verify: run paacm task phase verifying and paacm gate (${ref('07-verify.md')})`
        : `task ${state.id} is ${state.status}; a ${state.route} task is done after phase 8, review: run paacm task phase reviewing, then follow ${ref('08-review.md')}`,
    )
  }
  if (!state.testsApprovedAt) {
    throw new TaskError(`the tests were never approved, so the audit has no baseline: commit the tests and run paacm task approve-tests (${ref('05-tests-first.md')}), then paacm gate`)
  }
  const sha = head(projectDir)
  const gate = state.lastGate
  if (!gate || !gate.passed) throw new TaskError('the latest gate did not pass; run paacm gate and fix what it reports')
  if (gate.head !== sha) throw new TaskError(`the gate last passed at ${shortSha(gate.head)}, but HEAD is now ${shortSha(sha)}; run paacm gate again`)
  const dirty = uncommittedPaths(projectDir).filter((p) => !isTaskFile(p))
  if (dirty.length) throw new TaskError(`uncommitted changes since the gate: ${dirty.slice(0, 10).join(', ')}; commit them and run paacm gate again`)
  if (gate.dirty) throw new TaskError('the gate passed on uncommitted changes; commit them and run paacm gate again')
  const required = tierForRoute(config, state)
  if (!tierAtLeast(gate.tier, required)) throw new TaskError(`the last gate ran the ${gate.tier} tier; a ${state.route} task needs ${required} or higher: run paacm gate`)
  const reportRel = `${TASKS_DIR}/${state.id}/REPORT.md`
  const report = await readTextOrNull(path.join(taskDir(projectDir, state.id), 'REPORT.md'))
  if (report === null) throw new TaskError(`write ${reportRel} from the report template first (${ref('09-deliver.md')})`)
  const outcome = (/^\s*OUTCOME:[ \t]*(.*)$/m.exec(report)?.[1] ?? '').trim()
  if (outcome === '' || outcome.startsWith('<')) {
    throw new TaskError(`${reportRel} has no filled-in OUTCOME line; begin it with "OUTCOME: done — <one sentence>" (${ref('09-deliver.md')})`)
  }
  if (/^blocked\b/i.test(outcome)) {
    throw new TaskError(`${reportRel} says blocked; close a blocked task with paacm task block --trigger <1-7> --reason "<text>" and end your turn with a BLOCKED: line`)
  }
  if (!/^done\b/i.test(outcome)) throw new TaskError(`the OUTCOME line of ${reportRel} must begin with "done" (it says "${outcome.slice(0, 40)}")`)
  state.status = 'done'
  await writeState(projectDir, state)
  await appendProgress(projectDir, state.id, `done at ${shortSha(sha)}`)
  await setCurrent(projectDir, null)
  return state
}

// The reviewer reads review-input.md and has no shell. Diffs of generated files,
// and of files whose diff alone exceeds SEPARATE_BYTES, go to separate files in
// review-diffs/; then the largest remaining ones, until the diff in review-input.md
// fits DIFF_BUDGET.
const SEPARATE_BYTES = 64 * 1024
const DIFF_BUDGET = 512 * 1024
// Task files the evidence list leaves out: state, the writer's own documents,
// review input, the gate log (named separately) and supporting data (untrusted).
const NOT_EVIDENCE = new Set(['state.json', 'progress.md', 'SPEC.md', 'PLAN.md', 'REPORT.md', 'features.json', 'review-input.md', 'gate.log'])
const bytes = (text) => Buffer.byteLength(text, 'utf8')

// One diff section per file, in diff order.
function splitDiff(diff) {
  return diff.split(/^(?=diff --git )/m).filter((s) => s !== '')
}

// A code fence longer than any run of backticks in the text, so the text cannot
// close it early.
function fenceFor(text) {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length))
  return '`'.repeat(Math.max(3, longest + 1))
}

// Writes review-input.md for the reviewer: the requirements, the evidence (the
// latest gate and its log, the configuration warnings, files the writer saved
// for reviewers), the changed files, the project's reviewer checklist and the
// diff since baseCommit, new untracked files included.
export async function writeReviewInput(projectDir, config) {
  const state = await requireCurrent(projectDir)
  const dir = taskDir(projectDir, state.id)
  const inTask = (rel) => `${TASKS_DIR}/${state.id}/${rel}`
  const spec = await readTextOrNull(path.join(dir, 'SPEC.md'))
  let requirements = `Task summary: ${state.summary}`
  if (spec) {
    const m = /^##\s*6\.?\s*Acceptance criteria\s*\n([\s\S]*?)(?=^##\s|$(?![\s\S]))/im.exec(spec)
    requirements = m ? `Acceptance criteria (from SPEC.md):\n\n${m[1].trim()}` : `Specification:\n\n${spec.trim()}`
  }

  let change
  try {
    change = workingTreeDiff(projectDir, state.baseCommit)
  } catch (error) {
    if (error && error.code === 'ENOBUFS') {
      throw new TaskError(`the diff since ${shortSha(state.baseCommit) ?? 'the empty tree'} is larger than ${GIT_BUFFER / 1024 / 1024} MiB, too large to prepare for a review; ask the human how to split the change`)
    }
    throw error
  }
  const sections = splitDiff(change.diff)
  const split = sections.length === change.files.length
  const generated = generatedPaths(projectDir, change.files.map((f) => f.path))
  const entries = change.files.map((f, i) => ({ ...f, section: split ? sections[i] : '', reason: null })).filter((e) => !isTaskFile(e.path))
  if (split) {
    for (const e of entries) {
      if (generated.has(e.path)) e.reason = 'generated'
      else if (bytes(e.section) > SEPARATE_BYTES) e.reason = 'large'
    }
    let size = entries.filter((e) => !e.reason).reduce((n, e) => n + bytes(e.section), 0)
    for (const e of entries.filter((x) => !x.reason).sort((a, b) => bytes(b.section) - bytes(a.section))) {
      if (size <= DIFF_BUDGET) break
      e.reason = 'over the size budget'
      size -= bytes(e.section)
    }
  }
  const diffsDir = path.join(dir, 'review-diffs')
  await rm(diffsDir, { recursive: true, force: true })
  const separate = entries.filter((e) => e.reason)
  for (const [i, e] of separate.entries()) {
    e.file = inTask(`review-diffs/${String(i + 1).padStart(3, '0')}.diff`)
    await writeFileAtomic(path.join(diffsDir, path.basename(e.file)), e.section)
  }
  const stats = (e) => (e.binary ? 'binary' : `+${e.added} −${e.deleted}`)
  const diff = split ? entries.filter((e) => !e.reason).map((e) => e.section).join('') : change.diff
  const fence = fenceFor(diff)

  const evidence = [
    state.lastGate
      ? `Latest gate: tier ${state.lastGate.tier}, ${state.lastGate.passed ? 'passed' : `failed (${state.lastGate.failed})`}, at ${shortSha(state.lastGate.head)}${state.lastGate.dirty ? ' with uncommitted changes' : ''}, ${state.lastGate.at}`
      : 'The gate has not been run for this task.',
  ]
  if (await readTextOrNull(path.join(dir, 'gate.log')) !== null) evidence.push(`Full output: ${inTask('gate.log')}`)
  const warnings = auditTask(projectDir, config, state).warnings
  if (warnings.length) {
    evidence.push('', 'Protected configuration changed since the task started (the report must say who approved each change):', ...warnings.map((w) => `- ${w.path}: protected configuration changed in this task`))
  }
  try {
    const saved = (await listFiles(dir)).filter((p) => !NOT_EVIDENCE.has(p) && !p.startsWith('inputs/') && !p.startsWith('review-diffs/'))
    if (saved.length) evidence.push('', 'Files the writer saved for reviewers (read each one):', ...saved.map((p) => `- ${inTask(p)}`))
  } catch (error) {
    evidence.push('', `The task folder could not be listed for saved evidence (${error.message}); ask the writer which files to read.`)
  }

  const checklist = sectionOf(await readExtension(projectDir, '08-review'), 'Reviewer checklist')
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
    ...evidence,
    '',
    '## Changed files',
    '',
    entries.length ? entries.map((e) => `- ${e.path} (${stats(e)})`).join('\n') : '(none)',
    '',
    ...(checklist ? ['## Project reviewer checklist', '', 'Check each item against the diff as well, and report a violated item as a finding.', '', checklist, ''] : []),
    ...(separate.length
      ? ['## Diffs in separate files', '', 'These files are not in the diff below. Read each diff file; a generated file is reviewed for whether it should change at all.', '', ...separate.map((e) => `- ${e.path} (${stats(e)}, ${e.reason}): ${e.file}`), '']
      : []),
    '## Diff',
    '',
    ...(split ? [] : ['The diff could not be split per file, so it is shown whole.', '']),
    `${fence}diff`,
    diff.trimEnd(),
    fence,
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
