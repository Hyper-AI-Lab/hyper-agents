# Upgrading a project from PAACM 2.0.0

PAACM 2.0.0 was installed by copying 17 files into a project with `scripts/install-to-project.sh`. PAACM 3 replaces those files and both scripts. One command migrates a project, and it never deletes a file you changed.

## Run the migration

From the project's root, on a clean working tree:

```bash
npx github:Hyper-AI-Lab/hyper-agents upgrade --from-v2 --dry-run
```

Read the plan it prints, then run the same command without `--dry-run`. The options of `paacm init` apply: add `--ide`, `--layer` or `--autonomy` to choose them now (the defaults are both IDEs, the core layer and autonomy L1). Review the result with `git status` and `git diff`, then run `paacm doctor` and commit.

## What happens to each file

The migration compares every PAACM 2 file with its exact 2.0.0 content.

- **Unchanged files** are removed and replaced by their PAACM 3 equivalents.
- **`AGENTS.md` and `CLAUDE.md` you edited** are kept. PAACM 3 adds its marked block at the top; delete the old PAACM 2 text below it yourself and keep your own rules.
- **`.agent/checks.conf`** is always kept, because the format has not changed. Its 2.0.0 `shell-syntax` line checks both scripts, so it is removed too unless you kept both of them. Remove any line of your own that still calls `scripts/agent-check` or `scripts/install-to-project.sh`.
- **`.claude/skills/paacm/SKILL.md` you edited** stops the migration before anything is written, because the PAACM 3 skill must take its place. Move your changes elsewhere, delete the file and run the migration again.
- **Any other file you edited** is kept and reported. PAACM 3 does not read it; delete it when you no longer need it.

## Where things are now

| PAACM 2.0.0 | PAACM 3 |
|---|---|
| `AGENTS.md` (the whole file) | A marked PAACM block in `AGENTS.md`; everything outside the block is yours |
| `CLAUDE.md` | A marked PAACM block in `CLAUDE.md` that imports `AGENTS.md` |
| `.agent/workflows/implement.md`, `debug.md`, `review.md` | The `paacm` skill's phase references in `.claude/skills/paacm/references/` (including `debugging.md`) and the `paacm-review` skill |
| `.agent/policies/security.md`, `verification.md` | `references/security.md`, `references/07-verify.md` and the `paacm-verify` skill |
| `.agent/templates/task-contract.md` | `references/templates/SPEC.md` and `PLAN.md` |
| `.agent/integrations/mcp-inventory.md` | `references/mcp.md` |
| `.agent/evals/task-schema.md` | `paacm eval` and its task-set format in `.agent/evals/tasks.json` ([evaluation](evaluation.md)) |
| `.agent/state/` | `.agent/tasks/`, one folder per task, ignored by git through `.agent/.gitignore` |
| `.agent/checks.conf` | The same file and format, with the same tiers |
| `.claude/skills/paacm/SKILL.md`, `.cursor/commands/paacm.md` | The `paacm`, `paacm-verify` and `paacm-review` skills in `.claude/skills/`, which both IDEs read; start a request with `/paacm` |
| `sh scripts/agent-check --quick` (`--full`, `--security`, `--list`) | `paacm check --tier quick` (`--tier full`, `--tier security`, `--list`), run as `npx github:Hyper-AI-Lab/hyper-agents check` or, inside the project, `node .claude/skills/paacm/scripts/paacm.mjs check` |
| `sh scripts/install-to-project.sh` | `npx github:Hyper-AI-Lab/hyper-agents init`, `upgrade` and `uninstall` |
| `docs/agentic-kit/USER_GUIDE.md` | The guide in the PAACM repository's `docs/guide/`; it is no longer copied into projects |

## Differences to expect

- The check runner closes standard input for every check, validates the whole manifest before running anything, accepts CRLF line endings and prints PASS or FAIL for each check with a summary.
- A tier that a task needs but that has no checks fails closed: `paacm check` and `paacm gate` exit with code 3 instead of passing.
- `.agent/paacm.lock.json` records what was installed, so later upgrades update only files you have not changed and `paacm uninstall` removes only what PAACM wrote.
