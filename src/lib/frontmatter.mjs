// A strict parser for the YAML frontmatter subset used by Agent Skills, Claude Code
// subagents and Cursor rules: `key: value` scalars (strings, booleans, numbers),
// inline lists `[a, b]` and block lists of `- item` lines. Anything else is an
// error, so kit content cannot silently rely on YAML features a tool may not parse.

export function splitFrontmatter(text, file) {
  const src = text.replace(/\r\n?/g, '\n')
  if (!src.startsWith('---\n')) {
    throw new Error(`${file}: missing frontmatter (the file must start with ---)`)
  }
  const end = src.indexOf('\n---\n', 3)
  const endAtEof = src.endsWith('\n---') ? src.length - 4 : -1
  const close = end !== -1 ? end : endAtEof
  if (close === -1) throw new Error(`${file}: frontmatter is not closed with ---`)
  const raw = src.slice(4, close)
  const body = end !== -1 ? src.slice(end + 5) : ''
  return { data: parseFrontmatter(raw, file), raw, body }
}

export function parseFrontmatter(raw, file) {
  const data = {}
  const lines = raw.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (line.trim() === '' || line.trimStart().startsWith('#')) continue
    const m = /^([A-Za-z][A-Za-z0-9_-]*):(?:\s+(.*))?$/.exec(line)
    if (!m) throw new Error(`${file}: unsupported frontmatter line ${i + 1}: ${line}`)
    const key = m[1]
    if (Object.hasOwn(data, key)) throw new Error(`${file}: duplicate frontmatter key "${key}"`)
    const value = (m[2] ?? '').trim()
    if (value === '') {
      const items = []
      while (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) {
        i++
        items.push(parseScalar(lines[i].replace(/^\s+-\s+/, ''), file, key))
      }
      if (items.length === 0) throw new Error(`${file}: key "${key}" has no value`)
      data[key] = items
    } else {
      data[key] = parseValue(value, file, key)
    }
  }
  return data
}

function parseValue(value, file, key) {
  if (value.startsWith('[')) {
    if (!value.endsWith(']')) throw new Error(`${file}: unterminated list for "${key}"`)
    const inner = value.slice(1, -1).trim()
    if (inner === '') return []
    return splitInlineList(inner, file, key).map((item) => parseScalar(item, file, key))
  }
  if (value === '|' || value === '>' || value.startsWith('|') || value.startsWith('>')) {
    throw new Error(`${file}: block scalars are not supported for "${key}"; write the value on one line`)
  }
  return parseScalar(value, file, key)
}

function splitInlineList(inner, file, key) {
  const items = []
  let current = ''
  let quote = null
  for (const c of inner) {
    if (quote) {
      current += c
      if (c === quote) quote = null
    } else if (c === '"' || c === "'") {
      quote = c
      current += c
    } else if (c === ',') {
      items.push(current.trim())
      current = ''
    } else {
      current += c
    }
  }
  if (quote) throw new Error(`${file}: unterminated quote in list for "${key}"`)
  items.push(current.trim())
  return items
}

function parseScalar(token, file, key) {
  const t = token.trim()
  if (t.startsWith('"')) {
    if (!t.endsWith('"') || t.length < 2) throw new Error(`${file}: unterminated string for "${key}"`)
    return JSON.parse(t)
  }
  if (t.startsWith("'")) {
    if (!t.endsWith("'") || t.length < 2) throw new Error(`${file}: unterminated string for "${key}"`)
    return t.slice(1, -1).replace(/''/g, "'")
  }
  if (t === 'true') return true
  if (t === 'false') return false
  if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t)
  if (/^[&*!%@`]/.test(t) || t.includes(': ') || / #/.test(t)) {
    throw new Error(`${file}: value for "${key}" needs quotes: ${t}`)
  }
  return t
}
