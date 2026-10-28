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

// For each line, whether it lies outside fenced code blocks (``` or ~~~).
function outsideFences(lines) {
  let fence = null
  return lines.map((line) => {
    const m = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line)
    if (fence === null) {
      if (!m) return true
      fence = m[1]
      return false
    }
    if (m && m[1][0] === fence[0] && m[1].length >= fence.length && m[2].trim() === '') fence = null
    return false
  })
}

// The body of a level-2 section ("## <title>") up to the next level-2 heading,
// or null when the file or the section does not exist. Headings inside fenced
// code blocks do not count.
export function sectionOf(text, title) {
  if (!text) return null
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const outside = outsideFences(lines)
  const start = lines.findIndex((l, i) => outside[i] && l.trim().toLowerCase() === `## ${title}`.toLowerCase())
  if (start === -1) return null
  let end = lines.findIndex((l, i) => i > start && outside[i] && /^##\s/.test(l))
  if (end === -1) end = lines.length
  const body = lines.slice(start + 1, end).join('\n').trim()
  return body === '' ? null : body
}
