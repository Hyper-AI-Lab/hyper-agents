// Project extensions: .agent/extensions/<reference name>.md files a project adds
// to the paacm skill's references. The skill tells the agent to read them; the
// runtime lists them at session start and hands the review checklist to the
// fresh-context reviewer.
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { readTextOrNull } from './fs.mjs'

export const EXTENSIONS_DIR = '.agent/extensions'

// Names (without .md) of the extension files, sorted. Empty when there are none.
export async function listExtensions(projectDir) {
  let entries
  try {
    entries = await readdir(path.join(projectDir, ...EXTENSIONS_DIR.split('/')), { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => e.name.slice(0, -3))
    .sort()
}

export async function readExtension(projectDir, name) {
  return readTextOrNull(path.join(projectDir, ...EXTENSIONS_DIR.split('/'), `${name}.md`))
}

// The body of a level-2 section ("## <title>") up to the next level-2 heading,
// or null when the file or the section does not exist.
export function sectionOf(text, title) {
  if (!text) return null
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const start = lines.findIndex((l) => l.trim().toLowerCase() === `## ${title}`.toLowerCase())
  if (start === -1) return null
  const rest = lines.slice(start + 1)
  const end = rest.findIndex((l) => /^##\s/.test(l))
  const body = (end === -1 ? rest : rest.slice(0, end)).join('\n').trim()
  return body === '' ? null : body
}
