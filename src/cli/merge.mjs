// Merging the kit's entries into JSON settings files the user also edits
// (.claude/settings.json, .cursor/hooks.json, .cursor/permissions.json).
//
// merge() returns the merged document plus a record of exactly what was added.
// unmerge() takes that record and removes exactly those additions, leaving every
// key and entry the user wrote in place. A scalar the user already set (for
// example permissions.defaultMode) is never overwritten; the difference is
// reported instead.

const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)))
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v)

function unionInto(target, items, added) {
  for (const item of items) {
    if (!target.some((t) => same(t, item))) {
      target.push(clone(item))
      added.push(clone(item))
    }
  }
}

function removeItems(list, items) {
  return list.filter((entry) => !items.some((item) => same(entry, item)))
}

// Recursively sets keys that are absent; reports differing existing scalars.
function fillMissing(target, source, prefix, setKeys, notes) {
  for (const [key, value] of Object.entries(source)) {
    const at = prefix ? `${prefix}.${key}` : key
    if (!(key in target)) {
      target[key] = clone(value)
      setKeys.push({ key: at, value: clone(value) })
    } else if (isObject(value) && isObject(target[key])) {
      fillMissing(target[key], value, at, setKeys, notes)
    } else if (!same(target[key], value)) {
      notes.push(`${at} is already ${JSON.stringify(target[key])}; kept (PAACM suggests ${JSON.stringify(value)})`)
    }
  }
}

function getPath(obj, dotted) {
  return dotted.split('.').reduce((o, k) => (isObject(o) ? o[k] : undefined), obj)
}

function deletePath(obj, dotted) {
  const keys = dotted.split('.')
  const last = keys.pop()
  const parents = []
  let o = obj
  for (const k of keys) {
    if (!isObject(o[k])) return
    parents.push([o, k])
    o = o[k]
  }
  delete o[last]
  for (let i = parents.length - 1; i >= 0; i--) {
    const [parent, k] = parents[i]
    if (isObject(parent[k]) && Object.keys(parent[k]).length === 0) delete parent[k]
    else break
  }
}

const LIST_KEYS = {
  'claude-settings': [
    ['permissions', 'allow'],
    ['permissions', 'ask'],
    ['permissions', 'deny'],
  ],
  'cursor-permissions': [['terminalAllowlist'], ['mcpAllowlist']],
}

export function merge(format, existing, value) {
  const doc = existing === null ? {} : clone(existing)
  if (!isObject(doc)) throw new Error('the existing file is not a JSON object')
  const record = { lists: {}, set: [], hooks: {} }
  const notes = []

  if (format === 'claude-settings' || format === 'cursor-permissions') {
    const rest = clone(value)
    for (const pathParts of LIST_KEYS[format]) {
      const items = getPath(rest, pathParts.join('.'))
      if (!Array.isArray(items)) continue
      let target = doc
      for (const k of pathParts.slice(0, -1)) {
        if (!isObject(target[k])) target[k] = {}
        target = target[k]
      }
      const last = pathParts[pathParts.length - 1]
      if (!Array.isArray(target[last])) target[last] = []
      const added = []
      unionInto(target[last], items, added)
      if (added.length) record.lists[pathParts.join('.')] = added
      deletePath(rest, pathParts.join('.'))
    }
    const hooks = format === 'claude-settings' ? rest.hooks : undefined
    if (hooks) delete rest.hooks
    fillMissing(doc, rest, '', record.set, notes)
    if (hooks) {
      if (!isObject(doc.hooks)) doc.hooks = {}
      for (const [event, groups] of Object.entries(hooks)) {
        if (!Array.isArray(doc.hooks[event])) doc.hooks[event] = []
        const added = []
        unionInto(doc.hooks[event], groups, added)
        if (added.length) record.hooks[event] = added
      }
    }
  } else if (format === 'cursor-hooks') {
    if ('version' in doc && doc.version !== 1) throw new Error(`unsupported hooks.json version ${doc.version}`)
    if (!('version' in doc)) {
      doc.version = 1
      record.set.push({ key: 'version', value: 1 })
    }
    if (!isObject(doc.hooks)) doc.hooks = {}
    for (const [event, entries] of Object.entries(value.hooks)) {
      if (!Array.isArray(doc.hooks[event])) doc.hooks[event] = []
      const added = []
      unionInto(doc.hooks[event], entries, added)
      if (added.length) record.hooks[event] = added
    }
  } else {
    throw new Error(`unknown JSON merge format "${format}"`)
  }
  return { doc, record, notes }
}

// Removes what merge() added. Returns the resulting document, or null when
// nothing is left (so the caller can delete a file the kit created).
export function unmerge(format, existing, record) {
  if (existing === null) return null
  const doc = clone(existing)
  for (const [dotted, items] of Object.entries(record.lists ?? {})) {
    const list = getPath(doc, dotted)
    if (Array.isArray(list)) {
      const kept = removeItems(list, items)
      if (kept.length) {
        const keys = dotted.split('.')
        const last = keys.pop()
        const parent = keys.reduce((o, k) => o[k], doc)
        parent[last] = kept
      } else {
        deletePath(doc, dotted)
      }
    }
  }
  for (const [event, items] of Object.entries(record.hooks ?? {})) {
    if (isObject(doc.hooks) && Array.isArray(doc.hooks[event])) {
      const kept = removeItems(doc.hooks[event], items)
      if (kept.length) doc.hooks[event] = kept
      else delete doc.hooks[event]
    }
  }
  if (isObject(doc.hooks) && Object.keys(doc.hooks).length === 0) delete doc.hooks
  for (const { key, value } of record.set ?? []) {
    if (key === 'version' && format === 'cursor-hooks' && isObject(doc.hooks) && Object.keys(doc.hooks).length) continue
    if (same(getPath(doc, key), value)) deletePath(doc, key)
  }
  return Object.keys(doc).length === 0 ? null : doc
}
