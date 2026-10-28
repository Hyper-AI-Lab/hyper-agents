// The paacm skill's reference files, for the runtime's "read this next" hints.
// The runtime lives in <skill>/scripts/, so the references are found next to it
// in a project install and in a plugin install alike.
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REFERENCES_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'references')

export const PHASE_REFERENCES = {
  specifying: '02-specify.md',
  exploring: '03-explore.md',
  planning: '04-plan.md',
  testing: '05-tests-first.md',
  implementing: '06-implement.md',
  verifying: '07-verify.md',
  reviewing: '08-review.md',
}

const display = (projectDir, abs) => {
  const rel = path.relative(projectDir, abs)
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel) ? rel.split(path.sep).join('/') : abs
}

// Where to read a reference: its path relative to the project when it lies
// inside it, else its absolute path; the skill-relative name when the runtime
// runs outside an installed skill.
export function referencePath(projectDir, file) {
  const abs = path.join(REFERENCES_DIR, file)
  return existsSync(abs) ? display(projectDir, abs) : `references/${file}`
}

export function referencesDir(projectDir) {
  return existsSync(REFERENCES_DIR) ? `${display(projectDir, REFERENCES_DIR)}/` : 'the references/ folder of the paacm skill'
}

// "Next: read <reference>[ and <extension>]" for a reference file.
export function readNext(projectDir, file) {
  const extension = `.agent/extensions/${file}`
  const withExtension = existsSync(path.join(projectDir, ...extension.split('/'))) ? ` and ${extension}` : ''
  return `Next: read ${referencePath(projectDir, file)}${withExtension}, and follow ${withExtension ? 'both' : 'it'}.`
}
