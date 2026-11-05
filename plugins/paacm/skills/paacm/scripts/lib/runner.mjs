// Runs checks from the manifest. Each check runs in a shell (the manifest holds
// shell commands by design) with standard input closed, so a check can never
// consume input meant for anything else. Output streams to an optional sink and
// a bounded tail is kept for reports. A check that exceeds the timeout is killed
// together with its child processes.
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'
import { tiersFor } from './checks.mjs'

const TAIL_BYTES = 16 * 1024

function killTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch {
      child.kill('SIGKILL')
    }
  }
}

export function runOne(projectDir, check, { timeoutSec, sink } = {}) {
  return new Promise((resolve) => {
    const started = Date.now()
    let tail = ''
    let timedOut = false
    const child = spawn(check.command, {
      cwd: projectDir,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
      windowsHide: true,
      env: { ...process.env, PAACM_CHECK: check.label },
    })
    const onData = (chunk) => {
      const text = chunk.toString('utf8')
      if (sink) sink(text)
      tail = (tail + text).slice(-TAIL_BYTES)
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    const timer = timeoutSec
      ? setTimeout(() => {
          timedOut = true
          killTree(child)
        }, timeoutSec * 1000)
      : null
    const finish = (exitCode, error) => {
      if (timer) clearTimeout(timer)
      resolve({
        tier: check.tier,
        label: check.label,
        command: check.command,
        exitCode,
        timedOut,
        durationMs: Date.now() - started,
        outputTail: error ? `${tail}${error.message}\n` : tail,
      })
    }
    child.on('error', (error) => finish(127, error))
    child.on('close', (code, signal) => finish(timedOut ? 124 : code ?? (signal ? 128 : 1)))
  })
}

// The last command a shell said it could not find in the check's output, which
// is the failing one: dash ("sh: 1: x: not found"), bash ("x: command not found",
// "x: No such file or directory"), zsh ("command not found: x") and cmd ("'x' is
// not recognized"). Null when no such message is found.
function lastNotFound(output) {
  let last = null
  const patterns = [
    /([^\s:'"`]+): (?:command )?not found\b/g,
    /([^\s:'"`]+): No such file or directory\b/g,
    /(?:command not found|no such file or directory): ([^\s'"`]+)/gi,
    /'([^']+)' is not recognized as an internal or external command/g,
  ]
  for (const re of patterns) for (const m of output.matchAll(re)) if (!last || m.index > last.index) last = { index: m.index, name: m[1] }
  return last ? last.name : null
}

// Whether a check failed because its shell could not find a program: exit 127
// from a POSIX shell (also reported when the shell itself cannot start). On
// Windows, `cmd /c` exits 1 and says the command "is not recognized" (9009 is
// what a batch file sees); cmd prints that in the system's language, and only
// the English message is recognized. A command named by a path inside the
// project (`./build.sh`, `scripts/x`) is a file of the project, not a tool to
// install: a change may have removed or renamed it, so that failure is an
// ordinary one. A path outside the project (`/opt/tools/bin/x`) is a tool.
export function isMissingTool(result, projectDir) {
  const output = result.outputTail ?? ''
  let missing = result.exitCode === 127
  if (!missing && process.platform === 'win32') missing = result.exitCode === 9009 || (result.exitCode === 1 && /is not recognized as an internal or external command/.test(output))
  if (!missing) return false
  const name = lastNotFound(output)
  if (!name || !/[\\/]/.test(name) || !projectDir) return true
  const rel = path.relative(path.resolve(projectDir), path.resolve(projectDir, name))
  return rel === '' || rel === '..' || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel)
}

// Runs every check of the mode's tiers in manifest order and stops at the first
// failure. `log` receives one line per event (RUN, PASS, FAIL, summary).
export async function runChecks(projectDir, checks, mode, { timeoutSec, sink, log = () => {} } = {}) {
  const tiers = tiersFor(mode)
  const selected = checks.filter((c) => tiers.includes(c.tier))
  const results = []
  for (const check of selected) {
    log(`RUN  [${check.tier}] ${check.label}: ${check.command}`)
    const r = await runOne(projectDir, check, { timeoutSec, sink })
    results.push(r)
    const secs = (r.durationMs / 1000).toFixed(1)
    if (r.exitCode === 0) {
      log(`PASS [${check.tier}] ${check.label} (${secs}s)`)
    } else {
      log(`FAIL [${check.tier}] ${check.label} exit ${r.exitCode}${r.timedOut ? ` (timed out after ${timeoutSec}s)` : ''} (${secs}s)`)
      if (isMissingTool(r, projectDir)) {
        log(`HINT [${check.tier}] ${check.label}: a command was not found (exit ${r.exitCode}). If it is a program that is not installed, this is the environment, not the code: do not change code to get around it. Without the tool the gate cannot pass, so list the check under CHECKS NOT RUN and stop with BLOCKED: trigger 2 (paacm task block --trigger 2) to ask the human to install it. If it is something the project provides (a script, or a package script's program) that this change removed or renamed, it is an ordinary failure: fix it.`)
      }
      break
    }
  }
  const failed = results.find((r) => r.exitCode !== 0) ?? null
  const skipped = selected.length - results.length
  log(
    failed
      ? `FAILED: ${failed.label} (${results.length - 1} passed, ${skipped} not run)`
      : `PASSED: ${results.length} check(s) in tier ${mode}`,
  )
  return { mode, results, passed: failed === null, failed: failed ? failed.label : null, skipped }
}
