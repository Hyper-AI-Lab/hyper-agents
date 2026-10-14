// Command dispatcher for the `paacm` command-line tool.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { PACKAGE_ROOT } from '../lib/content.mjs'
import { run as runtime } from '../runtime/paacm.mjs'
import { build } from './build.mjs'
import { detect } from './detect.mjs'
import { doctor } from './doctor.mjs'
import { EVAL_HELP, evaluate } from './eval.mjs'
import { init, uninstall, upgrade } from './install.mjs'
import { validate } from './validate.mjs'

const INSTALL_HELP = `  [<dir>] | --target <dir>   the project directory (default: the current directory)
  --ide <claude,cursor>      the IDEs to set up (default: both)
  --layer <core|power>       core: instructions, skills and checks; power adds subagents, hooks and autonomy profiles
  --autonomy <L0|L1|L2|L3>   the autonomy level (default: L1)
  --dry-run                  print the plan and write nothing
  --cursor-user              install the plugin into Cursor's local plugin folder instead of a project
  --cursor-plugins-dir <dir> that folder (default: ~/.cursor/plugins/local)`

export const COMMANDS = {
  init: {
    run: init,
    summary: 'Install PAACM into a project',
    help: `Usage: paacm init [options]\n\n${INSTALL_HELP}\n\nNothing is written when any file conflicts. .agent/paacm.lock.json records what was installed.`,
  },
  upgrade: {
    run: upgrade,
    summary: 'Update an installation; files you changed are kept',
    help: `Usage: paacm upgrade [options]\n\n${INSTALL_HELP}\n  --from-v2                  migrate a PAACM 2.0.0 project (no lock file)\n\nOptions you leave out keep their installed values.`,
  },
  uninstall: {
    run: uninstall,
    summary: 'Remove what PAACM installed; files you changed are kept',
    help: 'Usage: paacm uninstall [<dir> | --target <dir>] [--dry-run] [--cursor-user [--cursor-plugins-dir <dir>]]',
  },
  doctor: {
    run: doctor,
    summary: 'Check that an installation is complete and healthy',
    help: 'Usage: paacm doctor [<dir> | --target <dir>]\n\nExit code 1 when any problem is found; warnings alone exit 0.',
  },
  detect: {
    run: detect,
    summary: 'Propose check commands from package.json, Makefile, pyproject.toml, Cargo.toml or go.mod',
    help: 'Usage: paacm detect [<dir> | --target <dir>] [--write]\n\nPrints proposals only. --write appends the ones whose label is not yet in .agent/checks.conf.',
  },
  check: {
    run: (args, io) => runtime(['check', ...args], { out: io.out, err: io.err }),
    summary: 'Run the project checks in .agent/checks.conf',
    help: 'Usage: paacm check --list | --tier <quick|full|security> [--json]\n\nExit codes: 0 passed, 1 failed, 2 configuration error, 3 a required tier has no checks.',
  },
  eval: {
    run: evaluate,
    summary: 'Grade evaluation runs and compare arms on a private task set',
    help: EVAL_HELP,
  },
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
  try {
    return await entry.run(rest, io)
  } catch (error) {
    if (!error?.code?.startsWith('ERR_PARSE_ARGS_')) throw error
    io.err(`paacm ${command}: ${error.message}`)
    io.err(`Run \`paacm ${command} --help\` for its options.`)
    return 2
  }
}
