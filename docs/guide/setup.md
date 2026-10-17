# Setting up PAACM

PAACM installs in one of three ways. Pick the one that matches how your team works; you can switch later.

| Path | Best for | What the repository gets | Start a request with |
|---|---|---|---|
| [Claude Code plugin](#claude-code-plugin) | One person or a team on Claude Code | Only `.agent/checks.conf`, which you write | `/paacm:paacm <request>` |
| [Cursor plugin](#cursor-plugin) | One person or a team on Cursor | Only `.agent/checks.conf`, which you write | The `paacm` skill in Agent |
| [Project install](#project-install) | A team that wants PAACM versioned with the code, in both IDEs | `AGENTS.md` and `CLAUDE.md` blocks, the skills, and optionally subagents, hooks and permission profiles | `/paacm <request>` in either IDE |

All three need **git** and **Node.js 20 or later** in the environment where the agent runs: the hooks and the runtime are Node scripts, and task baselines, the audit and per-task commits use git.

The commands below run the PAACM command-line tool with `npx github:Hyper-AI-Lab/hyper-agents`. To pin a version, add `#<tag or commit>`, for example `npx github:Hyper-AI-Lab/hyper-agents#v3.0.0`.

## Claude Code plugin

In Claude Code:

```text
/plugin marketplace add Hyper-AI-Lab/hyper-agents
/plugin install paacm@hyper-agents
```

To share it with your team, declare both in the repository's `.claude/settings.json` from a terminal at the repository root, and commit that file. Teammates are offered the plugin when they trust the folder.

```bash
claude plugin marketplace add Hyper-AI-Lab/hyper-agents --scope project
```

```bash
claude plugin install paacm@hyper-agents --scope project
```

The plugin brings the skills (`/paacm:paacm`, `/paacm:paacm-verify`, `/paacm:paacm-review`), the three subagents and all hooks. Its session-start hook gives Claude Code the core rules, so the repository needs no `AGENTS.md` changes. Then [configure the checks](#configure-the-checks).

## Cursor plugin

PAACM is not in Cursor's public marketplace. Two ways in:

- **Team marketplace** (Cursor 2.6 or later, Teams and Enterprise plans): an admin adds `https://github.com/Hyper-AI-Lab/hyper-agents` as a team marketplace and enables the `paacm` plugin for the team ([Cursor plugins](https://cursor.com/docs/plugins)).
- **Local plugin** for your own machine:

  ```bash
  npx github:Hyper-AI-Lab/hyper-agents init --cursor-user
  ```

  This copies the plugin to `~/.cursor/plugins/local/paacm`. Restart Cursor, or run **Developer: Reload Window**. Run the same command with `upgrade` to update it, or `uninstall --cursor-user` to remove it.

The plugin brings the skills, the subagents, the hooks and an always-applied rule with the core rules. Then [configure the checks](#configure-the-checks).

## Project install

From the repository root, on a clean working tree:

```bash
npx github:Hyper-AI-Lab/hyper-agents init --dry-run
```

Read the plan, then run it again without `--dry-run`. Options:

| Option | Values | Default |
|---|---|---|
| `--ide` | `claude`, `cursor`, or `claude,cursor` | both |
| `--layer` | `core` or `power` | `core` |
| `--autonomy` | `L0`, `L1`, `L2`, `L3` ([which one](using-paacm.md#choose-the-autonomy-level)) | `L1` |

The **core layer** installs:

- a marked PAACM block at the top of `AGENTS.md`, and for Claude Code one in `CLAUDE.md` that imports `AGENTS.md`;
- the `paacm`, `paacm-verify` and `paacm-review` skills in `.claude/skills/`, which both IDEs read, with the runtime in `.claude/skills/paacm/scripts/`;
- `.agent/paacm.json` (configuration), `.agent/checks.conf` (the check manifest) and `.agent/.gitignore` (keeps task state out of git).

The **power layer** adds:

- the `paacm-explorer`, `paacm-implementer` and `paacm-reviewer` subagents in `.claude/agents/` (and `.cursor/agents/` copies that Cursor can use);
- the hooks: session start, protection of approved tests and executable configuration, the shell guard, post-edit checks and the stop gate, merged into `.claude/settings.json` and `.cursor/hooks.json`;
- the permission profile of the autonomy level, merged into `.claude/settings.json` and `.cursor/permissions.json`.

Without the power layer the agent still follows the whole method, but nothing enforces it: the agent runs the gate itself, uses the IDE's built-in subagents, and protected files are protected only by instruction. Use the power layer once the core layer works for you.

The installer never overwrites what it did not write. Your text outside the PAACM blocks stays yours, and JSON settings files get only PAACM's entries added; a setting you already have is kept and reported. If anything conflicts, for example an existing file at a path PAACM needs or a settings file with comments, nothing is written and the conflicts are listed. Resolve them by hand, or ask your agent to with [INSTALL_PROMPT.md](../../INSTALL_PROMPT.md). `.agent/paacm.lock.json` records what was installed.

Review the result with `git diff`, [configure the checks](#configure-the-checks), run `doctor`, and commit.

To add your project's own rules to particular phases (a knowledge base to consult, reviewers to run, a checklist), see [Extending PAACM for your project](extending.md).

### Upgrade and uninstall

```bash
npx github:Hyper-AI-Lab/hyper-agents upgrade
```

`upgrade` updates the files you have not changed, restores missing ones, keeps the ones you changed and reports them. Pass `--layer`, `--ide` or `--autonomy` to change them; options you leave out keep their installed values. Add `--dry-run` to see the plan first.

```bash
npx github:Hyper-AI-Lab/hyper-agents uninstall
```

`uninstall` removes the files PAACM installed that you have not changed, the PAACM blocks and the PAACM entries in settings files, and keeps everything else, including the task history in `.agent/tasks/`.

A project that has PAACM 2.0.0 upgrades with `upgrade --from-v2` ([details](upgrading-from-2.md)).

## Configure the checks

The gate accepts a change only when the commands in `.agent/checks.conf` pass. Each line is `tier|label|command`:

```text
quick|lint|npm run lint
quick|typecheck|npx tsc --noEmit
quick|unit-tests|npm test
full|build|npm run build
full|integration-tests|npm run test:integration
security|audit|npm audit --audit-level=high
```

- **quick** runs before every finish: lint, type checks and fast tests.
- **full** adds the slower checks: build, integration and end-to-end tests. DEEP tasks need it, and STANDARD tasks run it before delivery.
- **security** adds scanners and security tests, for security-relevant changes.

Running a tier runs the tiers before it too. A tier the task needs but that has no checks makes the gate stop with exit code 3 and the agent ask you to configure it: a missing check is never treated as a pass.

To get proposals from the commands your project already defines (`package.json` scripts, Makefile targets, `pyproject.toml` tools, Cargo and Go):

```bash
npx github:Hyper-AI-Lab/hyper-agents detect
```

Copy the lines you trust into `.agent/checks.conf`, or run `detect --write` to append the proposals whose labels are not yet there; this also creates the file for a plugin install. **The file is executable code**: review every command, and review changes to it in pull requests like any other code. Once tests are approved for a task, the agent may not edit it.

Run the checks yourself to see that they work:

```bash
npx github:Hyper-AI-Lab/hyper-agents check --tier quick
```

## Check the installation

```bash
npx github:Hyper-AI-Lab/hyper-agents doctor
```

`doctor` checks Node.js and git, that every installed file is present and valid, that the hooks and settings entries are in place, and that the checks are configured. It exits with 1 when it finds a problem; warnings, such as a tier without checks, do not fail it. In a plugin install it notes that there is no project install and checks the configuration and the checks.

## Autonomy L2 and L3 need a sandbox

With `--autonomy L2` or `L3` and the power layer, Claude Code runs shell commands in its sandbox and refuses them if the sandbox is unavailable. On Linux and WSL2 the sandbox needs `bubblewrap` and `socat`; `doctor` checks for both. Native Windows has no Claude Code sandbox: use WSL2 or autonomy L1. In Cursor, choose the matching run mode yourself ([autonomy levels](using-paacm.md#choose-the-autonomy-level)).
