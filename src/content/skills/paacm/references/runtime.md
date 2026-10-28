# The PAACM runtime

`paacm <command>` means `node <runtime>/paacm.mjs <command>`, run from the repository root. In a project install, `<runtime>` is `.claude/skills/paacm/scripts`; when PAACM is a plugin, the session-start message prints the full command. The runtime needs Node.js 20 or later and has no other dependencies.

Write each runtime command out in full, one per call, from the repository root. A command joined to others with `;`, `&&` or a pipe, prefixed with `cd … &&`, or called through a shell variable does not match the IDE's allow rule and is refused. `paacm check` and `paacm gate` end with a line `paacm <command>: exit <code>` that you can quote as evidence. To keep their output short, add `--quiet`; with a task, the gate saves its full output as `gate.log` in the task folder.

## Task commands

| Command | Effect |
|---|---|
| `paacm task start --slug <slug> --route <FAST\|STANDARD\|DEEP> --summary "<text>" [--high-stakes] [--autonomy <L0\|L1\|L2\|L3>] [--ref <work item>]` | Creates `.agent/tasks/<YYYY-MM-DD>-<slug>/` with `state.json` and `progress.md`, records the current commit as `baseCommit`, and makes it the current task. Refuses if another task is active, or if the latest task is blocked and files frozen by its approved tests have changed since (resume that task to settle the change with the human). High-stakes forces route DEEP and autonomy L1. `--ref` links the task to its work item: an issue number (`123`, `#123`), a tracker key (`PROJ-123`), `owner/repo#123` or an `https://` URL. |
| `paacm task status [--json]` | Prints the current task's state, or says that there is none. |
| `paacm task phase <phase>` | Sets the status to one of `specifying`, `exploring`, `planning`, `testing`, `implementing`, `verifying`, `reviewing`, logs the change, and prints the reference to read (and the project extension of the same name, when there is one). |
| `paacm task log "<text>"` | Appends a timestamped line to `progress.md`. |
| `paacm task approve-tests` | Records the current commit as `testsApprovedAt` and moves a task in `testing` to `implementing`. Refuses while protected test files have uncommitted changes, and, when the tests are already approved, while a frozen file (a test, `.agent/checks.conf`, `.agent/paacm.json`) has changed since the approval: that change needs `reopen-tests` first. From now on the protect hook and the audit treat test files as read-only. |
| `paacm task reopen-tests --reason "<text>"` | Clears `testsApprovedAt` and returns the task to `testing`, so that a test change the human approved in the conversation can be made. The shell guard asks the human to confirm it. Run `approve-tests` again after committing the change. |
| `paacm task review-input` | Writes `review-input.md` for `paacm-reviewer` and prints its path: the work item and acceptance criteria; the evidence (the latest gate and its `gate.log`, protected configuration the task changed or a merge brought in, and other files you saved in the task folder); the changed files; the `## Reviewer checklist` section of `.agent/extensions/08-review.md`; and the diff since `baseCommit`, new untracked files included. Diffs of generated files (`linguist-generated` in `.gitattributes`) and very large diffs are written to `review-diffs/` and listed instead. |
| `paacm task block --trigger <1-7> --reason "<text>"` | Sets the status to `blocked`, records the trigger and reason, and clears the current-task pointer. |
| `paacm task done` | Sets the status to `done` and clears the current-task pointer. Refuses unless the task reached its last phase (`reviewing` for STANDARD and DEEP; `verifying` or `reviewing` for FAST), the tests were approved, the latest gate passed at the route's tier (or higher) at the current commit with nothing uncommitted since, and `REPORT.md` begins with `OUTCOME: done`. Each refusal says what is missing. |
| `paacm task resume <task-id>` | Makes an existing task the current one again (after a block was answered). |

## Verification commands

| Command | Effect |
|---|---|
| `paacm check --list` | Prints the configured checks. |
| `paacm check --tier <quick\|full\|security> [--quiet] [--json]` | Validates the whole manifest first, then runs the checks of the tier and the tiers below it, each with standard input closed, prints PASS or FAIL per check with its duration, and stops at the first failure. `--quiet` leaves out the checks' output except the last 30 lines of a failing one. A check that exits 127 (9009 on Windows) gets a hint: a command was not found. |
| `paacm audit [--json]` | Lists protected paths changed since the task's baseline. Violations: test files, `.agent/checks.conf` and `.agent/paacm.json` changed since `testsApprovedAt`. Warnings: other configuration files changed since `baseCommit`, printed as `WARN` when the task changed them and as `NOTE` when they arrived only by merging a branch that is already on a remote (such as the base branch); a branch made and merged locally counts as the task's own. Both include uncommitted changes. |
| `paacm gate [--tier <tier>] [--quiet] [--json]` | Runs the audit, then the checks for the route's tier (or the given tier); records the result and the consecutive-failure count in `state.json`, saves the full output as `gate.log` in the task folder, and, when it passes, prints the next phase. `--quiet` as for `check`. |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | A check failed, or the command refused because a precondition does not hold |
| 2 | Usage error (unknown command or option) or invalid configuration |
| 3 | A required check tier has no checks configured |
| 4 | The audit found a change to a protected path |

## Files

| Path | Content |
|---|---|
| `.agent/paacm.json` | Project configuration: default autonomy, gate tiers, retry cap, check timeout, protected-path patterns, post-edit commands |
| `.agent/checks.conf` | The check manifest: `tier\|label\|command` per line |
| `.agent/extensions/<reference>.md` | The project's additions to a reference of this skill (read with the reference; protected configuration) |
| `.agent/tasks/CURRENT` | The current task's identifier |
| `.agent/tasks/<task-id>/state.json` | Route, autonomy, status, `baseCommit`, `testsApprovedAt`, gate results, block details |
| `.agent/tasks/<task-id>/progress.md` | The append-only log |
| `.agent/tasks/<task-id>/SPEC.md`, `PLAN.md`, `REPORT.md`, `features.json`, `review-input.md`, `review-diffs/`, `gate.log`, `inputs/` | The task's working files |

---

**Project extensions:** if `.agent/extensions/runtime.md` exists in the repository, read it now and follow it as part of this file. It may add steps, fields, reviewers and checks; it never removes or weakens a gate.
