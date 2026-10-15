# Working on the PAACM kit

This repository is the source of PAACM. These instructions are for agents and people changing the kit itself. What PAACM installs into other projects is authored in `src/content/`, never in this file.

## Layout

| Path | What it is |
|---|---|
| `docs/research/` | The study the method is derived from |
| `docs/method/ALGORITHM.md` | The normative specification of the method; `docs/method/adr/` records each design decision |
| `docs/project/requirements.md` | Requirements R1–R12 and their evidence |
| `src/content/` | The single source of everything the kit installs or ships; see `src/content/README.md` |
| `src/runtime/` | The runtime the agent and the hooks run in a project: task state, the check runner, the audit and the gate |
| `src/lib/` | The content model, the generator and the format validator |
| `src/cli/` | The `paacm` command-line tool (`bin/paacm.mjs`) |
| `plugins/paacm/`, `.claude-plugin/marketplace.json`, `.cursor-plugin/marketplace.json` | Generated output; never edit by hand |

## Rules

- `ALGORITHM.md` is normative. Content, runtime and documentation follow it; a change to the method changes `ALGORITHM.md` first and adds or supersedes an ADR.
- After changing `src/content/` or `src/runtime/`, run `node bin/paacm.mjs build` and commit the regenerated output with the change.
- Node.js 20 or later, no dependencies. Code must work on Linux, macOS and Windows: build paths with `path` or the helpers in `src/runtime/lib/fs.mjs`, never by joining strings.
- `src/runtime/` is copied into every installation, so it imports only Node built-ins and its own files.
- The installer never overwrites content it did not write. Any change to `init`, `upgrade` or `uninstall` keeps that guarantee.
- Before finishing, run `node bin/paacm.mjs check --tier quick` (the kit's checks in `.agent/checks.conf`) and report the result.
