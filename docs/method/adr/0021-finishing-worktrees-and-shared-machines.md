# 0021. Tasks finish through the runtime; state and protection follow the worktree

- **Status:** accepted
- **Date:** 2026-10-28

## Context

Running PAACM 3.4.1 on a team project, with several people on one server, linked worktrees and headless agent runs, showed gaps between what the method says and what the runtime enforces:

- **Finishing.** Agents stopped with the task still `triaged`, without `REPORT.md` and without `paacm task done`. The stop gate let any task stop once the gate was green, `task done` checked only the gate, and nothing pointed the agent to the references of the later phases, so they were never opened.
- **Worktrees.** The hooks took the project from `CLAUDE_PROJECT_DIR`, which stays at the original root in a worktree session. An edit in a sibling worktree was not checked at all, and every edit in a worktree nested under `.claude/worktrees/` was treated as agent configuration.
- **Shared machines.** Session baselines lived in a shared temporary folder. A second account's session start failed on the first account's folder and lost the whole session context; other accounts could read or forge the baselines.
- **Frozen tests.** `approve-tests` could take a new baseline over an approved test changed through the shell, so the writer could approve its own test edit.
- **Review and evidence.** The review input left out the content of new files, could silently become empty for a very large diff, and was swamped by generated files; reviewers, who have no shell, saw one line of gate evidence. Agents piped the gate's output to shorten it, which the IDE's allow rules refuse, and a missing tool (exit 127) looked like failing code.
- **Audit.** After a merge of the base branch, the audit listed protected files the merge changed as changed by the task, and a report claimed approvals for changes the task never made.

## Decision

- **A task finishes through the runtime.** `paacm task done` requires the route's last phase (review for STANDARD and DEEP, verify for FAST), approved tests, a passing gate at the route's tier at the current commit with nothing uncommitted, and a `REPORT.md` whose outcome is done. The stop gate nudges once, never on a continuation, when an open task's gate is green, and when a STANDARD or DEEP task changes files while still triaged; it never holds an agent that is waiting for the human. A nudge is guidance, so Claude Code receives it as `additionalContext`, which continues the turn under the same `stop_hook_active` protection as a block but is not shown to the user as a hook error; a failing gate still blocks. `task start`, `task phase` and a passing gate name the reference to read next.
- **State and protection follow the worktree.** The project is the nearest directory with `.agent/paacm.json` within the current worktree, never above it. The hooks anchor the repository on the IDE's project directory and follow the agent's current directory into worktrees of the same repository. The protect hook judges a file by the worktree it is in, with that worktree's configuration and task. The stop gate judges both the worktree the agent works in and the session's own project, so moving into a worktree never releases a failing gate. When the session's folder is not a git repository, each checkout below it is judged by its own rules.
- **Per-account state stays with the account.** Session baselines live in the worktree's own git directory, private to the clone's owner; a baseline that cannot be written is a warning, not a failed hook.
- **A new test baseline cannot absorb a frozen-file change.** `approve-tests` refuses while the audit reports one; the change needs `reopen-tests`, which the human confirms. Approving moves the task from testing to implementing, so later fixes are gated.
- **The reviewer gets the whole change and the evidence.** The diff includes new files; generated and very large diffs go to separate files the reviewer can read; the evidence names the gate log, the configuration warnings and the files the writer saved for the reviewer. The gate saves its full output in the task folder and has a `--quiet` form; a missing tool is named as an environment problem (trigger 2).
- **The audit tells merged changes from the task's own.** Configuration warnings carry their origin: a change counts as merged only when it came from commits a remote-tracking branch already has, so a branch the writer made and merged locally stays the task's own. Violations stay strict for both: a merge cannot bring in a change to an approved test or to the gate configuration.
- **The shell guard asks before skipping git hooks** (`--no-verify`, `core.hooksPath`, `HUSKY=0` and similar), and CI actions and git-hook manager files are protected configuration by default.
- **A task can name its work item** (`paacm task start --ref`), shown in the status, the session context, the review input and the report.

## Evidence

- Headless runs on a project: tasks left `triaged` without a report or `task done` while the gate was green; agents did not open references 06–09; gate commands with pipes and shell variables were refused by the allow rules.
- On a server with two Linux accounts, the second account's session start failed with `EACCES` on the shared `paacm-sessions` folder and produced no context; with baselines in the git directory both accounts work (see [requirements](../../project/requirements.md#release-350)).
- Claude Code documents that `CLAUDE_PROJECT_DIR` keeps the original project root in a worktree session while the hook input's `cwd` follows the agent ([Claude Code hooks reference](https://code.claude.com/docs/en/hooks), checked on 28 October 2026).
- A review input of about 1 MB, mostly one generated file, and an audit whose warnings mixed a merge's changes with the task's own.

## Consequences

A task that skips phases cannot be closed, and the agent learns which reference to read at each step. Worktrees can be used for parallel work without losing protection. Several accounts can share a machine. Existing tasks keep working: old state files simply have no work item. Two changes need a human: re-approving after a frozen file changed now goes through `reopen-tests`, and a project whose `.agent/paacm.json` lists `protect.config` explicitly adds the new defaults itself.

## Alternatives considered

- Enforcing the order of every phase in `task phase` (rejected: agents legitimately go back a phase; the last-phase check at `task done` is enough).
- Blocking every stop of an open task until it is done (rejected: an agent waiting for an approval or an answer must be able to stop).
- Baselines in `.agent/` inside the working tree (rejected: they would show up as changes and be visible to git tooling).
- Exempting merged-in test changes from the audit (rejected: a merge of the writer's own branch would launder a test edit).
