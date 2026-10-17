// Glob matching for repository-relative POSIX paths, as used in .agent/paacm.json.
//   *     any run of characters except "/"
//   **    any run of characters including "/" (a whole "**/" segment may match nothing)
//   ?     one character except "/"
//   {a,b} alternatives (no nesting)
// A pattern without "/" matches the file name at any depth.

const cache = new Map()

export function globToRegExp(pattern, { ignoreCase = false } = {}) {
  const key = `${ignoreCase ? 'i' : 's'}:${pattern}`
  if (cache.has(key)) return cache.get(key)
  let p = pattern.trim().replace(/^\.\//, '')
  if (!p.includes('/')) p = `**/${p}`
  let re = ''
  for (let i = 0; i < p.length; i++) {
    const c = p[i]
    if (c === '*') {
      if (p[i + 1] === '*') {
        const atSegmentStart = i === 0 || p[i - 1] === '/'
        if (p[i + 2] === '/' && atSegmentStart) {
          re += '(?:.*/)?'
          i += 2
        } else {
          re += '.*'
          i += 1
        }
      } else {
        re += '[^/]*'
      }
    } else if (c === '?') {
      re += '[^/]'
    } else if (c === '{') {
      const close = p.indexOf('}', i)
      if (close === -1) {
        re += '\\{'
      } else {
        const alts = p.slice(i + 1, close).split(',').map(escapeLiteral)
        re += `(?:${alts.join('|')})`
        i = close
      }
    } else {
      re += escapeLiteral(c)
    }
  }
  const compiled = new RegExp(`^${re}$`, ignoreCase ? 'i' : '')
  cache.set(key, compiled)
  return compiled
}

function escapeLiteral(s) {
  return s.replace(/[.+^${}()|[\]\\]/g, '\\$&')
}

// Pass ignoreCase on file systems that ignore case (macOS and Windows by default),
// where Tests/A.TEST.js and tests/a.test.js are the same file.
export function matchesAny(path, patterns, { ignoreCase = false } = {}) {
  const p = path.replace(/\\/g, '/').replace(/^\.\//, '')
  return patterns.some((g) => globToRegExp(g, { ignoreCase }).test(p))
}

export const CASE_INSENSITIVE_FS = process.platform === 'darwin' || process.platform === 'win32'
