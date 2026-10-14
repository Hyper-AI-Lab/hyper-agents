// Session start (Claude Code SessionStart, Cursor sessionStart).
// Gives the agent its bearings: the runtime command, the repository state and the
// current task. When PAACM runs as a plugin, the project has no AGENTS.md block,
// so the core rules are injected here instead.
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hasBlock } from '../lib/blocks.mjs'
import { readTextOrNull } from '../lib/fs.mjs'
import { branch, isRepo, recentCommits, shortSha, statusShort } from '../lib/git.mjs'
import { contextResponse, detectTool, projectDirFrom, readHookInput, runHook, toProjectPath } from '../lib/hookio.mjs'
import { currentTask, readPlanHead, readProgressTail } from '../lib/task.mjs'

const scriptsDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)))

runHook(async () => {
  const input = await readHookInput()
  const tool = detectTool(input)
  const projectDir = projectDirFrom(input)
  const runtime = path.join(scriptsDir, 'paacm.mjs')
  const rel = toProjectPath(projectDir, runtime)
  const command = rel ? `node ${rel}` : `node "${runtime}"`

  const out = ['# PAACM session context', '', `PAACM runtime: \`${command} <command>\` (the instructions write this as \`paacm <command>\`).`]

  const agents = await readTextOrNull(path.join(projectDir, 'AGENTS.md'))
  if (agents === null || !hasBlock(agents)) {
    const rules = await readTextOrNull(path.join(scriptsDir, 'core-rules.md'))
    if (rules) out.push('', rules.trim())
  }

  if (isRepo(projectDir)) {
    out.push('', '## Repository', '', `Branch: ${branch(projectDir) ?? '(detached)'}`)
    const status = statusShort(projectDir)
    out.push('', 'Uncommitted changes:', status ? `\n\`\`\`\n${status}\n\`\`\`` : '(none)')
    const commits = recentCommits(projectDir)
    if (commits) out.push('', 'Recent commits:', `\n\`\`\`\n${commits}\n\`\`\``)
  } else {
    out.push('', 'This folder is not a git repository. PAACM needs git for task baselines, the audit and per-task commits; ask the human before starting a coding task.')
  }

  const task = await currentTask(projectDir)
  if (task) {
    out.push(
      '',
      `## Current task: ${task.id}`,
      '',
      `Summary: ${task.summary}`,
      `Route: ${task.route}${task.highStakes ? ' (high-stakes)' : ''}; autonomy ${task.autonomy}; status ${task.status}; base ${shortSha(task.baseCommit) ?? 'none'}; tests approved at ${shortSha(task.testsApprovedAt) ?? 'not yet'}.`,
      task.lastGate ? `Last gate: tier ${task.lastGate.tier}, ${task.lastGate.passed ? 'passed' : `failed (${task.lastGate.failed})`} at ${shortSha(task.lastGate.head)}; consecutive failures ${task.gateFailures}.` : 'The gate has not run yet.',
      'Resume it with the paacm skill, phase 0: re-read the plan and progress, then run `paacm check --tier quick` before new work.',
    )
    const plan = await readPlanHead(projectDir, task.id)
    if (plan) out.push('', 'Plan (beginning):', '', plan)
    const progress = await readProgressTail(projectDir, task.id)
    if (progress) out.push('', 'Recent progress:', '', progress)
  }

  contextResponse(tool, tool === 'claude' ? 'SessionStart' : 'sessionStart', out.join('\n'))
})
