// Marked blocks inside Markdown files the user also edits (AGENTS.md, CLAUDE.md).
// The kit owns only the text between the markers; everything outside them
// belongs to the user and is never changed.

export const BLOCK_BEGIN = '<!-- paacm:begin (managed by PAACM; edit outside this block) -->'
export const BLOCK_END = '<!-- paacm:end -->'
const BEGIN_RE = /<!-- paacm:begin[^>]*-->/g
const END_RE = /<!-- paacm:end -->/g

// Returns { start, end } offsets of the block (end is after the end marker), or
// null when there is none. Throws when markers are unbalanced or repeated.
export function findBlock(text) {
  const begins = [...text.matchAll(BEGIN_RE)]
  const ends = [...text.matchAll(END_RE)]
  if (begins.length === 0 && ends.length === 0) return null
  if (begins.length !== 1 || ends.length !== 1 || ends[0].index < begins[0].index) {
    throw new Error('the PAACM block markers are damaged (expected exactly one begin marker followed by one end marker)')
  }
  return { start: begins[0].index, end: ends[0].index + ends[0][0].length }
}

export function hasBlock(text) {
  try {
    return findBlock(text) !== null
  } catch {
    return true
  }
}

export function renderBlock(body) {
  return `${BLOCK_BEGIN}\n${body.trimEnd()}\n${BLOCK_END}`
}

export function blockBody(text) {
  const b = findBlock(text)
  if (!b) return null
  const inner = text.slice(b.start, b.end).replace(BEGIN_RE, '').replace(END_RE, '')
  return inner.replace(/^\n/, '').replace(/\n$/, '')
}

// Inserts the block at the top of the file, or replaces an existing block in place.
export function upsertBlock(text, body) {
  const block = renderBlock(body)
  if (text === null || text.trim() === '') return `${block}\n`
  const b = findBlock(text)
  if (!b) return `${block}\n\n${text.replace(/^\s*\n/, '')}`
  return `${text.slice(0, b.start)}${block}${text.slice(b.end)}`
}

// Removes the block and the blank line that separated it from the user's text.
// Returns null when nothing but the block was in the file.
export function removeBlock(text) {
  const b = findBlock(text)
  if (!b) return text
  const rest = `${text.slice(0, b.start)}${text.slice(b.end)}`.replace(/^\s*\n/, '').replace(/\n{3,}/g, '\n\n')
  return rest.trim() === '' ? null : rest
}
