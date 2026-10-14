// Command dispatcher for the `paacm` command-line tool.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PACKAGE_ROOT } from '../lib/content.mjs'
import { build } from './build.mjs'
import { validate } from './validate.mjs'

export const COMMANDS = {
  build: { run: build, summary: 'Regenerate the plugin and marketplace manifests from src/content (kit development)' },
  validate: { run: validate, summary: 'Validate kit content against the Claude Code and Cursor formats (kit development)' },
}

function usage() {
  const width = Math.max(...Object.keys(COMMANDS).map((c) => c.length))
  const lines = Object.entries(COMMANDS).map(([name, c]) => `  ${name.padEnd(width)}  ${c.summary}`)
  return ['Usage: paacm <command> [options]', '', 'Commands:', ...lines, '', 'Run `paacm <command> --help` for the options of one command.'].join('\n')
}

export function createIo(stdout = process.stdout, stderr = process.stderr) {
  return {
    out: (line) => stdout.write(`${line}\n`),
    err: (line) => stderr.write(`${line}\n`),
  }
}

export async function main(argv, io = createIo()) {
  const [command, ...rest] = argv
  if (!command || command === 'help' || command === '--help' || command === '-h') {
    io.out(usage())
    return command ? 0 : 2
  }
  if (command === '--version' || command === '-v' || command === 'version') {
    const pkg = JSON.parse(await readFile(path.join(PACKAGE_ROOT, 'package.json'), 'utf8'))
    io.out(pkg.version)
    return 0
  }
  const entry = COMMANDS[command]
  if (!entry) {
    io.err(`paacm: unknown command "${command}"`)
    io.err(usage())
    return 2
  }
  if (rest.includes('--help') || rest.includes('-h')) {
    io.out(entry.help ?? `paacm ${command}: ${entry.summary}`)
    return 0
  }
  return entry.run(rest, io)
}
