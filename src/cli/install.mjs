// `paacm init`, `paacm upgrade` and `paacm uninstall`.
//
// Every command first computes a complete plan and refuses to write anything if
// the plan contains a conflict. User content is never overwritten: files the kit
// does not own are left alone, Markdown files get a marked block, and JSON
// settings get only the kit's entries merged in. `.agent/paacm.lock.json`
// records what was installed (with hashes) so that upgrade and uninstall touch
// only what the kit wrote and the user has not changed since.
import { readdir, rm, rmdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { AUTONOMY_LEVELS, IDES, LAYERS, loadContent, PACKAGE_ROOT, PLUGIN_DIR, renderPlugin, renderProject } from '../lib/content.mjs'
import { findBlock, removeBlock, upsertBlock, blockBody } from '../runtime/lib/blocks.mjs'
import {
  assertNoSymlinkPath,
  fromPosix,
  listFiles,
  readJsonOrNull,
  readTextOrNull,
  sha256,
  stableJson,
  statOrNull,
  stripJsonComments,
  writeFileAtomic,
} from '../runtime/lib/fs.mjs'
import { isRepo } from '../runtime/lib/git.mjs'
import { merge, unmerge } from './merge.mjs'

export const LOCK_PATH = '.agent/paacm.lock.json'
const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')

async function resolveTarget(target) {
  const abs = path.resolve(target ?? process.cwd())
  const st = await statOrNull(abs)
  if (!st || !st.isDirectory() || st.isSymbolicLink()) throw new Error(`target must be an existing directory (not a symbolic link): ${abs}`)
  const rel = path.relative(PACKAGE_ROOT, abs)
  if (rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel))) {
    throw new Error('the target is the PAACM kit itself or a folder inside it; install into a project instead')
  }
  return abs
}

export async function readLock(targetDir) {
  return readJsonOrNull(fromPosix(targetDir, LOCK_PATH))
}

function parseIdes(value) {
  const ides = value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
  for (const ide of ides) if (!IDES.includes(ide)) throw new Error(`--ide: unknown IDE "${ide}" (use ${IDES.join(', ')})`)
  if (ides.length === 0) throw new Error('--ide needs at least one IDE')
  return [...new Set(ides)]
}

function hasJsonComments(text) {
  return stripJsonComments(text).replace(/\s/g, '') !== text.replace(/\s/g, '')
}

// Computes the action for every entry without writing anything. Paths in
// `absent` are planned as if missing (files a migration removes first).
async function planEntries(targetDir, entries, lock, absent = new Set()) {
  const actions = []
  for (const entry of entries) {
    const abs = fromPosix(targetDir, entry.path)
    try {
      await assertNoSymlinkPath(targetDir, entry.path)
    } catch (error) {
      actions.push({ entry, action: 'conflict', reason: error.message })
      continue
    }
    const st = absent.has(entry.path) ? null : await statOrNull(abs)
    if (st && !st.isFile()) {
      actions.push({ entry, action: 'conflict', reason: 'exists and is not a regular file' })
      continue
    }
    const existing = st ? await readTextOrNull(abs) : null
    if (entry.kind === 'file') {
      const locked = lock?.files?.[entry.path]
      if (existing === null) actions.push({ entry, action: locked ? 'restore' : 'add' })
      else if (existing === entry.text) actions.push({ entry, action: 'unchanged' })
      else if (locked && sha256(existing) === locked.sha256) actions.push({ entry, action: 'update' })
      else if (locked) actions.push({ entry, action: 'modified', reason: 'you changed this file since it was installed; kept your version' })
      else actions.push({ entry, action: 'conflict', reason: 'a different file already exists here' })
    } else if (entry.kind === 'block') {
      try {
        if (existing === null) actions.push({ entry, action: 'create' })
        else if (findBlock(existing)) {
          const lockedBlock = lock?.blocks?.[entry.path]
          const body = blockBody(existing)
          const edited = lockedBlock && body !== null && sha256(body) !== lockedBlock.sha256
          actions.push({ entry, action: body === entry.text.trimEnd() ? 'unchanged' : 'replace', note: edited ? 'the PAACM block had been edited by hand; it was replaced (edit outside the block instead)' : undefined })
        } else actions.push({ entry, action: 'insert' })
      } catch (error) {
        actions.push({ entry, action: 'conflict', reason: error.message })
      }
    } else if (entry.kind === 'json') {
      if (existing !== null && hasJsonComments(existing)) {
        actions.push({ entry, action: 'conflict', reason: 'the file contains comments, which rewriting would remove; merge the PAACM entries by hand or remove the comments' })
        continue
      }
      let current = null
      try {
        current = existing === null ? null : JSON.parse(existing)
      } catch (error) {
        actions.push({ entry, action: 'conflict', reason: `not valid JSON (${error.message})` })
        continue
      }
      try {
        const previous = lock?.json?.[entry.path]
        const base = previous ? unmerge(entry.format, current, previous.record) : current
        const { doc, record, notes } = merge(entry.format, base, entry.value)
        const changed = JSON.stringify(doc) !== JSON.stringify(current)
        actions.push({ entry, action: current === null ? 'create' : changed ? 'merge' : 'unchanged', doc, record, notes, createdFile: previous ? previous.createdFile : current === null })
      } catch (error) {
        actions.push({ entry, action: 'conflict', reason: error.message })
      }
    }
  }
  return actions
}

function report(io, actions, removals = []) {
  const label = { add: 'ADD', restore: 'RESTORE', update: 'UPDATE', unchanged: 'UNCHANGED', modified: 'KEEP', conflict: 'CONFLICT', create: 'CREATE', insert: 'INSERT BLOCK', replace: 'UPDATE BLOCK', merge: 'MERGE', remove: 'REMOVE', keep: 'KEEP', 'keep-existing': 'KEEP' }
  for (const a of [...removals, ...actions]) {
    const what = a.entry ? a.entry.path : a.path
    const extra = a.reason ? ` — ${a.reason}` : ''
    io.out(`${label[a.action].padEnd(12)} ${what}${extra}`)
    if (a.note) io.out(`             ${a.note}`)
    for (const n of a.notes ?? []) io.out(`             note: ${n}`)
  }
}

async function apply(targetDir, actions, previousLock, options, kitVersion) {
  const lock = {
    kit: 'paacm',
    version: kitVersion,
    installedAt: previousLock?.installedAt ?? now(),
    updatedAt: now(),
    options,
    files: {},
    blocks: {},
    json: {},
  }
  for (const a of actions) {
    const abs = fromPosix(targetDir, a.entry.path)
    if (a.entry.kind === 'file') {
      if (['add', 'restore', 'update'].includes(a.action)) await writeFileAtomic(abs, a.entry.text, a.entry.path.endsWith('.mjs') ? 0o755 : undefined)
      if (a.action === 'modified') lock.files[a.entry.path] = previousLock.files[a.entry.path]
      else lock.files[a.entry.path] = { sha256: sha256(a.entry.text) }
    } else if (a.entry.kind === 'block') {
      const existing = await readTextOrNull(abs)
      if (a.action !== 'unchanged') await writeFileAtomic(abs, upsertBlock(existing, a.entry.text))
      lock.blocks[a.entry.path] = { sha256: sha256(a.entry.text.trimEnd()), createdFile: previousLock?.blocks?.[a.entry.path]?.createdFile ?? a.action === 'create' }
    } else if (a.entry.kind === 'json') {
      if (a.action !== 'unchanged') await writeFileAtomic(abs, stableJson(a.doc))
      lock.json[a.entry.path] = { format: a.entry.format, record: a.record, createdFile: a.createdFile }
    }
  }
  await writeFileAtomic(fromPosix(targetDir, LOCK_PATH), stableJson(lock))
  return lock
}

async function removeEmptyDirs(targetDir, rels) {
  const dirs = new Set()
  for (const rel of rels) {
    let d = path.posix.dirname(rel)
    while (d !== '.' && d !== '') {
      dirs.add(d)
      d = path.posix.dirname(d)
    }
  }
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
    const abs = fromPosix(targetDir, d)
    try {
      if ((await readdir(abs)).length === 0) await rmdir(abs)
    } catch {
      // Not empty, already gone, or not ours: leave it.
    }
  }
}

function nextSteps(io, options, targetDir) {
  io.out('')
  io.out('Next steps:')
  io.out('  1. Configure your project checks: run `npx github:Hyper-AI-Lab/hyper-agents detect` and copy the commands you trust into .agent/checks.conf.')
  io.out('  2. Review and commit the installed files.')
  if (options.ides.includes('claude')) io.out('  3. Claude Code: start a coding request with `/paacm <request>`.')
  if (options.ides.includes('cursor')) io.out(`  ${options.ides.includes('claude') ? '4' : '3'}. Cursor: start a coding request with \`/paacm <request>\` in Agent.`)
  if (!isRepo(targetDir)) io.out('  Warning: the target is not a git repository. PAACM needs git for task baselines, the audit and per-task commits.')
}

const INSTALL_OPTIONS = {
  target: { type: 'string' },
  ide: { type: 'string' },
  layer: { type: 'string' },
  autonomy: { type: 'string' },
  'dry-run': { type: 'boolean' },
  'cursor-user': { type: 'boolean' },
  'cursor-plugins-dir': { type: 'string' },
}

function readOptions(values, fallback) {
  const options = {
    ides: values.ide ? parseIdes(values.ide) : fallback.ides,
    layer: (values.layer ?? fallback.layer).toLowerCase(),
    autonomy: (values.autonomy ?? fallback.autonomy).toUpperCase(),
  }
  if (!LAYERS.includes(options.layer)) throw new Error(`--layer must be ${LAYERS.join(' or ')}`)
  if (!AUTONOMY_LEVELS.includes(options.autonomy)) throw new Error(`--autonomy must be one of ${AUTONOMY_LEVELS.join(', ')}`)
  return options
}

// Installs or updates the plugin in Cursor's local plugin folder.
async function cursorUserPlugin(io, { dryRun, pluginsDir, remove = false }) {
  const base = pluginsDir ? path.resolve(pluginsDir) : path.join(os.homedir(), '.cursor', 'plugins', 'local')
  const dest = path.join(base, 'paacm')
  const existingManifest = await readJsonOrNull(path.join(dest, '.cursor-plugin', 'plugin.json'))
  const destExists = (await statOrNull(dest)) !== null
  if (destExists && existingManifest?.name !== 'paacm') throw new Error(`${dest} exists and is not the PAACM plugin; remove it first`)
  if (remove) {
    if (!destExists) {
      io.out(`The PAACM plugin is not installed in ${base}.`)
      return 0
    }
    io.out(`${dryRun ? 'Would remove' : 'Removing'} ${dest}`)
    if (!dryRun) await rm(dest, { recursive: true, force: true })
    return 0
  }
  const files = renderPlugin(await loadContent())
  io.out(`${dryRun ? 'Would install' : 'Installing'} the PAACM plugin (${files.size} files) into ${dest}`)
  if (dryRun) return 0
  await rm(dest, { recursive: true, force: true })
  for (const [rel, text] of files) {
    const inner = rel.slice(PLUGIN_DIR.length + 1)
    await writeFileAtomic(path.join(dest, ...inner.split('/')), text, inner.endsWith('.mjs') ? 0o755 : undefined)
  }
  io.out('Done. Restart Cursor or run "Developer: Reload Window" to load it.')
  return 0
}

export async function init(args, io) {
  const { values, positionals } = parseArgs({ args, options: INSTALL_OPTIONS, allowPositionals: true, strict: true })
  if (positionals.length > 1) throw new Error('init takes at most one target directory')
  if (values['cursor-user']) return cursorUserPlugin(io, { dryRun: values['dry-run'], pluginsDir: values['cursor-plugins-dir'] })
  const targetDir = await resolveTarget(values.target ?? positionals[0])
  if (await readLock(targetDir)) throw new Error(`PAACM is already installed in ${targetDir}; use \`paacm upgrade\` to update it or \`paacm uninstall\` to remove it`)
  const options = readOptions(values, { ides: [...IDES], layer: 'core', autonomy: 'L1' })
  const content = await loadContent()
  const actions = await planEntries(targetDir, renderProject(content, options), null)
  io.out(`PAACM ${content.kit.version} → ${targetDir} (IDEs: ${options.ides.join(', ')}; layer: ${options.layer}; autonomy: ${options.autonomy})`)
  report(io, actions)
  const conflicts = actions.filter((a) => a.action === 'conflict')
  if (conflicts.length) {
    io.err(`\n${conflicts.length} conflict(s); nothing was written. Resolve them (or merge by hand following INSTALL_PROMPT.md), then run init again.`)
    return 1
  }
  if (values['dry-run']) {
    io.out('\nDry run: nothing was written.')
    return 0
  }
  await apply(targetDir, actions, null, options, content.kit.version)
  io.out(`\nInstalled. ${LOCK_PATH} records what was installed.`)
  nextSteps(io, options, targetDir)
  return 0
}

export async function upgrade(args, io) {
  const { values, positionals } = parseArgs({ args, options: { ...INSTALL_OPTIONS, 'from-v2': { type: 'boolean' } }, allowPositionals: true, strict: true })
  if (positionals.length > 1) throw new Error('upgrade takes at most one target directory')
  if (values['cursor-user']) return cursorUserPlugin(io, { dryRun: values['dry-run'], pluginsDir: values['cursor-plugins-dir'] })
  const targetDir = await resolveTarget(values.target ?? positionals[0])
  const content = await loadContent()
  let lock = await readLock(targetDir)
  let migration = []
  if (values['from-v2']) {
    if (lock) throw new Error('--from-v2 is for projects that have PAACM 2 and no PAACM 3 lock file')
    const { planV2Migration } = await import('./v2.mjs')
    migration = await planV2Migration(targetDir)
  } else if (!lock) {
    throw new Error(`PAACM 3 is not installed in ${targetDir}; use \`paacm init\`, or \`paacm upgrade --from-v2\` for a PAACM 2 project`)
  }
  const options = readOptions(values, lock?.options ?? { ides: [...IDES], layer: 'core', autonomy: 'L1' })
  const entries = renderProject(content, options).filter((e) => !migration.some((m) => m.keepExisting === e.path))
  const absent = new Set(migration.filter((m) => m.action === 'remove').map((m) => m.path))
  // A path the migration already reports as a conflict is not reported twice.
  const migrationConflicts = new Set(migration.filter((m) => m.action === 'conflict').map((m) => m.path))
  const actions = (await planEntries(targetDir, entries, lock, absent)).filter((a) => !(a.action === 'conflict' && migrationConflicts.has(a.entry.path)))
  const removals = []
  for (const [rel, info] of Object.entries(lock?.files ?? {})) {
    if (entries.some((e) => e.path === rel)) continue
    const text = await readTextOrNull(fromPosix(targetDir, rel))
    if (text === null) continue
    removals.push(sha256(text) === info.sha256 ? { path: rel, action: 'remove' } : { path: rel, action: 'keep', reason: 'no longer part of PAACM, but you changed it; left in place' })
  }
  for (const m of migration) removals.push(m)
  io.out(`PAACM ${lock ? lock.version : '2.0.0'} → ${content.kit.version} in ${targetDir} (IDEs: ${options.ides.join(', ')}; layer: ${options.layer}; autonomy: ${options.autonomy})`)
  report(io, actions, removals)
  const conflicts = [...actions, ...removals].filter((a) => a.action === 'conflict')
  if (conflicts.length) {
    io.err(`\n${conflicts.length} conflict(s); nothing was written.`)
    return 1
  }
  if (values['dry-run']) {
    io.out('\nDry run: nothing was written.')
    return 0
  }
  for (const r of removals.filter((x) => x.action === 'remove')) await rm(fromPosix(targetDir, r.path), { force: true })
  for (const r of removals.filter((x) => x.rewrite !== undefined)) await writeFileAtomic(fromPosix(targetDir, r.path), r.rewrite)
  lock = await apply(targetDir, actions, lock, options, content.kit.version)
  await removeEmptyDirs(targetDir, removals.filter((x) => x.action === 'remove').map((x) => x.path))
  io.out(`\nUpgraded to PAACM ${lock.version}.`)
  if (values['from-v2']) nextSteps(io, options, targetDir)
  return 0
}

export async function uninstall(args, io) {
  const { values, positionals } = parseArgs({
    args,
    options: { target: { type: 'string' }, 'dry-run': { type: 'boolean' }, 'cursor-user': { type: 'boolean' }, 'cursor-plugins-dir': { type: 'string' } },
    allowPositionals: true,
    strict: true,
  })
  if (positionals.length > 1) throw new Error('uninstall takes at most one target directory')
  if (values['cursor-user']) return cursorUserPlugin(io, { dryRun: values['dry-run'], pluginsDir: values['cursor-plugins-dir'], remove: true })
  const targetDir = await resolveTarget(values.target ?? positionals[0])
  const lock = await readLock(targetDir)
  if (!lock) throw new Error(`PAACM 3 is not installed in ${targetDir} (no ${LOCK_PATH})`)
  const steps = []
  for (const [rel, info] of Object.entries(lock.files)) {
    const text = await readTextOrNull(fromPosix(targetDir, rel))
    if (text === null) continue
    steps.push(sha256(text) === info.sha256 ? { path: rel, action: 'remove' } : { path: rel, action: 'keep', reason: 'you changed this file; left in place' })
  }
  const blockSteps = []
  for (const [rel, info] of Object.entries(lock.blocks)) {
    const text = await readTextOrNull(fromPosix(targetDir, rel))
    if (text === null) continue
    const rest = removeBlock(text)
    blockSteps.push({ path: rel, rest, createdFile: info.createdFile })
    steps.push({ path: rel, action: rest === null && info.createdFile ? 'remove' : 'keep', reason: rest === null && info.createdFile ? undefined : 'PAACM block removed; your text kept' })
  }
  const jsonSteps = []
  for (const [rel, info] of Object.entries(lock.json)) {
    const existing = await readJsonOrNull(fromPosix(targetDir, rel))
    if (existing === null) continue
    const rest = unmerge(info.format, existing, info.record)
    jsonSteps.push({ path: rel, rest, createdFile: info.createdFile })
    steps.push({ path: rel, action: rest === null && info.createdFile ? 'remove' : 'keep', reason: rest === null && info.createdFile ? undefined : 'PAACM entries removed; your settings kept' })
  }
  io.out(`Removing PAACM ${lock.version} from ${targetDir}`)
  report(io, [], steps)
  if (values['dry-run']) {
    io.out('\nDry run: nothing was changed.')
    return 0
  }
  const removed = []
  for (const s of steps.filter((x) => x.action === 'remove' && lock.files[x.path])) {
    await rm(fromPosix(targetDir, s.path), { force: true })
    removed.push(s.path)
  }
  for (const b of blockSteps) {
    const abs = fromPosix(targetDir, b.path)
    if (b.rest === null && b.createdFile) {
      await rm(abs, { force: true })
      removed.push(b.path)
    } else await writeFileAtomic(abs, b.rest ?? '')
  }
  for (const j of jsonSteps) {
    const abs = fromPosix(targetDir, j.path)
    if (j.rest === null && j.createdFile) {
      await rm(abs, { force: true })
      removed.push(j.path)
    } else await writeFileAtomic(abs, stableJson(j.rest ?? {}))
  }
  await rm(fromPosix(targetDir, LOCK_PATH), { force: true })
  removed.push(LOCK_PATH)
  await removeEmptyDirs(targetDir, removed)
  const tasks = await listFiles(fromPosix(targetDir, '.agent/tasks'))
  io.out(`\nPAACM removed.${tasks.length ? ' Task history in .agent/tasks/ was kept.' : ''}`)
  return 0
}
