// File-system helpers shared by the CLI, the generator and the project runtime.
// Paths inside the kit are always POSIX-style relative paths; they are converted
// to platform paths only at the moment of touching the disk.
import { createHash } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'

export function toPosix(p) {
  return p.split(path.sep).join('/')
}

export function fromPosix(root, rel) {
  return path.join(root, ...rel.split('/'))
}

export function sha256(data) {
  return createHash('sha256').update(data).digest('hex')
}

export async function exists(p) {
  try {
    await lstat(p)
    return true
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return false
    throw error
  }
}

export async function statOrNull(p) {
  try {
    return await lstat(p)
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null
    throw error
  }
}

export async function readTextOrNull(p) {
  try {
    return await readFile(p, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return null
    throw error
  }
}

export async function readJsonOrNull(p) {
  const text = await readTextOrNull(p)
  if (text === null) return null
  try {
    return JSON.parse(stripJsonComments(text))
  } catch (error) {
    throw new Error(`${p}: invalid JSON (${error.message})`)
  }
}

// JSONC support for files such as .cursor/permissions.json: removes // and /* */
// comments outside strings and trailing commas before } or ].
export function stripJsonComments(text) {
  let out = ''
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const next = text[i + 1]
    if (inString) {
      out += c
      if (c === '\\') {
        out += next ?? ''
        i++
      } else if (c === '"') {
        inString = false
      }
      continue
    }
    if (c === '"') {
      inString = true
      out += c
    } else if (c === '/' && next === '/') {
      while (i < text.length && text[i] !== '\n') i++
      out += '\n'
    } else if (c === '/' && next === '*') {
      i += 2
      while (i < text.length && !(text[i] === '*' && text[i + 1] === '/')) i++
      i++
    } else {
      out += c
    }
  }
  return out.replace(/,(\s*[}\]])/g, '$1')
}

// Refuses to write through a symbolic link anywhere between root and the target.
export async function assertNoSymlinkPath(root, rel) {
  const parts = rel.split('/')
  let current = root
  for (const part of parts) {
    current = path.join(current, part)
    const st = await statOrNull(current)
    if (st === null) return
    if (st.isSymbolicLink()) {
      throw new Error(`refusing to write through symbolic link: ${toPosix(path.relative(root, current))}`)
    }
  }
}

// Atomic write: write a sibling temporary file, then rename over the target.
export async function writeFileAtomic(target, data, mode) {
  await mkdir(path.dirname(target), { recursive: true })
  const tmp = `${target}.paacm-tmp-${process.pid}-${Date.now()}`
  await writeFile(tmp, data, mode === undefined ? undefined : { mode })
  try {
    await rename(tmp, target)
  } catch (error) {
    await rm(tmp, { force: true })
    throw error
  }
}

// Lists every regular file under dir as sorted POSIX paths relative to dir.
export async function listFiles(dir) {
  const result = []
  async function walk(abs, rel) {
    let entries
    try {
      entries = await readdir(abs, { withFileTypes: true })
    } catch (error) {
      if (error.code === 'ENOENT') return
      throw error
    }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      const childAbs = path.join(abs, entry.name)
      if (entry.isSymbolicLink()) {
        throw new Error(`symbolic links are not allowed in kit content: ${childRel}`)
      }
      if (entry.isDirectory()) await walk(childAbs, childRel)
      else if (entry.isFile()) result.push(childRel)
    }
  }
  await walk(dir, '')
  return result
}

// Normalizes text to LF line endings with exactly one trailing newline.
export function normalizeText(text) {
  const lf = text.replace(/\r\n?/g, '\n')
  return lf.endsWith('\n') ? lf : `${lf}\n`
}

export function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}
