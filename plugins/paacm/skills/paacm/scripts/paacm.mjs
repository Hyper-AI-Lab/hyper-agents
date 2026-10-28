#!/usr/bin/env node
// The PAACM runtime: the commands the agent runs during the loop
// (task state, checks, the audit and the gate). Documented in
// skills/paacm/references/runtime.md. Needs Node.js 20 or later.
import { realpathSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { auditTask } from './lib/audit.mjs'
import { missingTiers } from './lib/checks.mjs'
import { loadConfig, TIERS, tierAtLeast } from './lib/config.mjs'
import { GATE, loadChecks, runGate } from './lib/gate.mjs'
import { shortSha } from './lib/git.mjs'
import { findProjectDir } from './lib/project.mjs'
import { PHASE_REFERENCES, readNext, referencePath, referencesDir } from './lib/references.mjs'
import { runChecks } from './lib/runner.mjs'
import {
  approveTests,
  blockTask,
  currentTask,
  finishTask,
  logProgress,
  reopenTests,
  resumeTask,
  setPhase,
  startTask,
  TaskError,
  writeReviewInput,
} from './lib/task.mjs'

export const EXIT = { OK: 0, FAILED: 1, USAGE: 2, UNCONFIGURED: 3, PROTECTED: 4 }

const HELP = `Usage: paacm <command> [options]

Task:
  task start --slug <slug> --route <FAST|STANDARD|DEEP> --summary "<text>" [--high-stakes] [--autonomy <L0-L3>] [--ref <work item>]
  task status [--json]
  task phase <specifying|exploring|planning|testing|implementing|verifying|reviewing>
  task log "<text>"
  task approve-tests
  task reopen-tests --reason "<the test change the human approved>"
  task review-input
  task block --trigger <1-7> --reason "<text>"
  task done
  task resume <task-id>

Verification:
  check --list
  check --tier <quick|full|security> [--quiet] [--json]
  audit [--json]
  gate [--tier <quick|full|security>] [--quiet] [--json]

Exit codes: 0 success, 1 failure or refused, 2 usage or configuration error,
3 a required check tier is not configured, 4 a protected test file or the gate
configuration changed after the tests were approved.`

// The project root (lib/project.mjs): the nearest ancestor holding
// .agent/paacm.json within the current worktree, else the worktree's root.
export { findProjectDir }

function formatState(s) {
  const lines = [
    `Task ${s.id} — ${s.summary}`,
    `  route ${s.route}${s.highStakes ? ' (high-stakes)' : ''}, autonomy ${s.autonomy}, status ${s.status}${s.ref ? `, work item ${s.ref}` : ''}`,
    `  base ${shortSha(s.baseCommit) ?? 'none'}, tests approved at ${shortSha(s.testsApprovedAt) ?? 'not yet'}`,
    s.lastGate
      ? `  last gate: tier ${s.lastGate.tier}, ${s.lastGate.passed ? 'passed' : `failed (${s.lastGate.failed})`} at ${shortSha(s.lastGate.head)}${s.lastGate.dirty ? ' with uncommitted changes' : ''}; consecutive failures ${s.gateFailures}`
      : '  the gate has not run',
  ]
  if (s.blocked) lines.push(`  BLOCKED: trigger ${s.blocked.trigger} — ${s.blocked.reason}`)
  return lines.join('\n')
}

async function taskCommand(args, out, projectDir) {
  const [sub, ...rest] = args
  switch (sub) {
    case 'start': {
      const { values } = parseArgs({
        args: rest,
        options: { slug: { type: 'string' }, route: { type: 'string' }, summary: { type: 'string' }, 'high-stakes': { type: 'boolean' }, autonomy: { type: 'string' }, ref: { type: 'string' } },
        strict: true,
      })
      const config = await loadConfig(projectDir)
      const state = await startTask(projectDir, {
        slug: values.slug,
        route: values.route?.toUpperCase(),
        summary: values.summary,
        highStakes: values['high-stakes'],
        autonomy: values.autonomy?.toUpperCase(),
        ref: values.ref,
        defaultAutonomy: config.autonomy,
      })
      out(formatState(state))
      out(`Task folder: .agent/tasks/${state.id}/`)
      out(`References: ${referencesDir(projectDir)}. Record each phase with paacm task phase <phase>, which names the reference to read. Finish with 09-deliver.md: write REPORT.md, then run paacm task done.`)
      return EXIT.OK
    }
    case 'status': {
      const { values } = parseArgs({ args: rest, options: { json: { type: 'boolean' } }, strict: true })
      const state = await currentTask(projectDir)
      if (values.json) out(JSON.stringify(state))
      else out(state ? formatState(state) : 'There is no current task.')
      return EXIT.OK
    }
    case 'phase': {
      if (rest.length !== 1) throw new UsageError('task phase takes exactly one phase name')
      const state = await setPhase(projectDir, rest[0])
      out(`Task ${state.id}: status ${state.status}`)
      out(readNext(projectDir, PHASE_REFERENCES[state.status]))
      return EXIT.OK
    }
    case 'log': {
      if (rest.length === 0) throw new UsageError('task log needs the text to log')
      await logProgress(projectDir, rest.join(' '))
      out('logged')
      return EXIT.OK
    }
    case 'approve-tests': {
      if (rest.length) throw new UsageError('task approve-tests takes no arguments')
      const state = await approveTests(projectDir, await loadConfig(projectDir))
      out(`Tests approved at ${shortSha(state.testsApprovedAt)}; test files are now read-only for task ${state.id}.`)
      return EXIT.OK
    }
    case 'reopen-tests': {
      const { values } = parseArgs({ args: rest, options: { reason: { type: 'string' } }, strict: true })
      if (!values.reason) throw new UsageError('task reopen-tests needs --reason "<the test change the human approved>"')
      const { state, previous } = await reopenTests(projectDir, { reason: values.reason })
      out(`Tests of task ${state.id} reopened (they were approved at ${shortSha(previous)}). Make only the change the human approved, commit it, then run paacm task approve-tests again.`)
      return EXIT.OK
    }
    case 'review-input': {
      if (rest.length) throw new UsageError('task review-input takes no arguments')
      const { file } = await writeReviewInput(projectDir, await loadConfig(projectDir))
      out(path.relative(projectDir, file).split(path.sep).join('/'))
      return EXIT.OK
    }
    case 'block': {
      const { values } = parseArgs({ args: rest, options: { trigger: { type: 'string' }, reason: { type: 'string' } }, strict: true })
      const state = await blockTask(projectDir, { trigger: values.trigger, reason: values.reason })
      out(`Task ${state.id} is blocked (trigger ${state.blocked.trigger}). End your turn with: BLOCKED: trigger ${state.blocked.trigger} — ${state.blocked.reason}`)
      return EXIT.OK
    }
    case 'done': {
      if (rest.length) throw new UsageError('task done takes no arguments')
      const state = await finishTask(projectDir, await loadConfig(projectDir))
      out(`Task ${state.id} is done.`)
      return EXIT.OK
    }
    case 'resume': {
      if (rest.length !== 1) throw new UsageError('task resume takes the task id')
      const state = await resumeTask(projectDir, rest[0])
      out(formatState(state))
      return EXIT.OK
    }
    default:
      throw new UsageError(`unknown task command "${sub ?? ''}"`)
  }
}

class UsageError extends Error {}

// For --quiet: the last lines of the failing check, in place of the streamed output.
function printFailingTail(out, results) {
  const failed = results?.find((r) => r.exitCode !== 0)
  if (!failed) return
  const lines = (failed.outputTail || '').trimEnd().split('\n').slice(-30)
  out(`Last ${lines.length} line(s) of ${failed.label}:`)
  out(lines.join('\n'))
}

// What a passing gate leads to for the current task.
function afterGate(projectDir, result) {
  const task = result.task
  if (!task || ['done', 'blocked'].includes(task.status)) return null
  if (!tierAtLeast(result.tier, result.requiredTier)) return `This was the ${result.tier} tier; a ${task.route} task needs a passing gate at ${result.requiredTier} or higher before paacm task done.`
  if (task.route !== 'FAST' && task.status !== 'reviewing') return `Next: phase 8, review: run paacm task phase reviewing, then read ${referencePath(projectDir, '08-review.md')}.`
  return `Next: phase 9, deliver: read ${referencePath(projectDir, '09-deliver.md')}, write REPORT.md, then run paacm task done.`
}

export async function run(argv, { out = (l) => process.stdout.write(`${l}\n`), err = (l) => process.stderr.write(`${l}\n`), cwd = process.cwd() } = {}) {
  const [command, ...args] = argv
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    out(HELP)
    return command ? EXIT.OK : EXIT.USAGE
  }
  const projectDir = await findProjectDir(cwd)
  try {
    switch (command) {
      case 'task':
        return await taskCommand(args, out, projectDir)
      case 'check': {
        const { values } = parseArgs({ args, options: { list: { type: 'boolean' }, tier: { type: 'string' }, json: { type: 'boolean' }, quiet: { type: 'boolean' } }, strict: true })
        const checks = await loadChecks(projectDir)
        if (values.list) {
          if (checks.length === 0) out('No checks are configured in .agent/checks.conf.')
          for (const c of checks) out(`${c.tier} | ${c.label} | ${c.command}`)
          return EXIT.OK
        }
        if (!values.tier || !TIERS.includes(values.tier)) throw new UsageError(`check needs --tier ${TIERS.join('|')} or --list`)
        const missing = missingTiers(checks, values.tier)
        if (missing.length) {
          err(`Tier(s) ${missing.join(', ')} have no checks in .agent/checks.conf; failing closed.`)
          if (values.json) out(JSON.stringify({ passed: false, missing }))
          return EXIT.UNCONFIGURED
        }
        const config = await loadConfig(projectDir)
        const result = await runChecks(projectDir, checks, values.tier, {
          timeoutSec: config.checks.timeoutSec,
          sink: values.json || values.quiet ? undefined : (t) => process.stdout.write(t),
          log: values.json ? () => {} : out,
        })
        const code = result.passed ? EXIT.OK : EXIT.FAILED
        if (values.json) out(JSON.stringify(result))
        else {
          if (values.quiet) printFailingTail(out, result.results)
          out(`paacm check: exit ${code}`)
        }
        return code
      }
      case 'audit': {
        const { values } = parseArgs({ args, options: { json: { type: 'boolean' } }, strict: true })
        const config = await loadConfig(projectDir)
        const state = await currentTask(projectDir)
        const audit = auditTask(projectDir, config, state)
        if (values.json) out(JSON.stringify(audit))
        else {
          if (!state) out('There is no current task; nothing to audit.')
          for (const v of audit.violations) out(`PROTECTED ${v.path}${v.detail ? `: ${v.detail}` : ' changed after the tests were approved'}`)
          for (const w of audit.warnings) {
            out(w.origin === 'merge' ? `NOTE ${w.path}: protected configuration changed by a merge, not by this task's own commits` : `WARN ${w.path}: protected configuration changed in this task`)
          }
          const merged = audit.warnings.filter((w) => w.origin === 'merge').length
          const own = audit.warnings.length - merged
          if (state && audit.violations.length === 0) out(`Audit clean${audit.warnings.length ? ` (${own} configuration warning(s)${merged ? `; ${merged} change(s) from merges` : ''})` : ''}.`)
        }
        return audit.violations.length ? EXIT.PROTECTED : EXIT.OK
      }
      case 'gate': {
        const { values } = parseArgs({ args, options: { tier: { type: 'string' }, json: { type: 'boolean' }, quiet: { type: 'boolean' } }, strict: true })
        const result = await runGate(projectDir, {
          tier: values.tier,
          log: values.json ? () => {} : out,
          sink: values.json || values.quiet ? undefined : (t) => process.stdout.write(t),
        })
        if (values.quiet && !values.json) printFailingTail(out, result.results)
        if (values.json) {
          const { task, ...rest } = result
          out(JSON.stringify(rest))
        }
        if (result.code === GATE.CONFIG) err(result.error)
        if (!values.json && result.code === GATE.PASSED) {
          const next = afterGate(projectDir, result)
          if (next) out(next)
        }
        if (!values.json) out(`paacm gate: exit ${result.code}`)
        return result.code
      }
      default:
        throw new UsageError(`unknown command "${command}"`)
    }
  } catch (error) {
    if (error instanceof UsageError || (error && error.code === 'ERR_PARSE_ARGS_UNKNOWN_OPTION') || (error && error.code === 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE') || (error && error.code === 'ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL')) {
      err(`paacm: ${error.message}`)
      err('Run `paacm help` for usage.')
      return EXIT.USAGE
    }
    if (error instanceof TaskError) {
      err(`paacm: ${error.message}`)
      return EXIT.FAILED
    }
    if (error && /paacm\.json|check manifest/.test(error.message)) {
      err(`paacm: ${error.message}`)
      return EXIT.USAGE
    }
    throw error
  }
}

const samePath = (a, b) => {
  try {
    return realpathSync(a) === realpathSync(b)
  } catch {
    return path.resolve(a) === path.resolve(b)
  }
}
const invokedDirectly = Boolean(process.argv[1]) && samePath(process.argv[1], fileURLToPath(import.meta.url))
if (invokedDirectly) {
  run(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code
    },
    (error) => {
      process.stderr.write(`paacm: ${error && error.stack ? error.stack : String(error)}\n`)
      process.exitCode = 1
    },
  )
}
