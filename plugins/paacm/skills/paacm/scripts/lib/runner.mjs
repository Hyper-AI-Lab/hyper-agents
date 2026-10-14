// Runs checks from the manifest. Each check runs in a shell (the manifest holds
// shell commands by design) with standard input closed, so a check can never
// consume input meant for anything else. Output streams to an optional sink and
// a bounded tail is kept for reports. A check that exceeds the timeout is killed
// together with its child processes.
import { spawn, spawnSync } from 'node:child_process'
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
