# The PAACM runtime

`paacm <command>` means `node <runtime>/paacm.mjs <command>`, run from the repository root. In a project install, `<runtime>` is `.claude/skills/paacm/scripts`; when PAACM is a plugin, the session-start message prints the full command. The runtime needs Node.js 20 or later and has no other dependencies.

## Task commands

| Command | Effect |
|---|---|
| `paacm task start --slug <slug> --route <FAST\|STANDARD\|DEEP> --summary "<text>" [--high-stakes] [--autonomy <L0\|L1\|L2\|L3>]` | Creates `.agent/tasks/<YYYY-MM-DD>-<slug>/` with `state.json` and `progress.md`, records the current commit as `baseCommit`, and makes it the current task. Refuses if another task is active. High-stakes forces route DEEP and autonomy L1. |
| `paacm task status [--json]` | Prints the current task's state, or says that there is none. |
| `paacm task phase <phase>` | Sets the status to one of `specifying`, `exploring`, `planning`, `testing`, `implementing`, `verifying`, `reviewing`, and logs the change. |
| `paacm task log "<text>"` | Appends a timestamped line to `progress.md`. |
| `paacm task approve-tests` | Records the current commit as `testsApprovedAt`. Refuses while protected test files have uncommitted changes. From now on the protect hook and the audit treat test files as read-only. |
| `paacm task review-input` | Writes `review-input.md` (diff since `baseCommit`, acceptance criteria, latest gate result) for `paacm-reviewer`, and prints its path. |
| `paacm task block --trigger <1-7> --reason "<text>"` | Sets the status to `blocked`, records the trigger and reason, and clears the current-task pointer. |
| `paacm task done` | Sets the status to `done` and clears the current-task pointer. Refuses unless the latest gate passed at the current commit and no tracked file has changed since. |
| `paacm task resume <task-id>` | Makes an existing task the current one again (after a block was answered). |

## Verification commands

| Command | Effect |
|---|---|
| `paacm check --list` | Prints the configured checks. |
| `paacm check --tier <quick\|full\|security> [--json]` | Validates the whole manifest first, then runs the checks of the tier and the tiers below it, each with standard input closed, prints PASS or FAIL per check with its duration, and stops at the first failure. |
| `paacm audit [--json]` | Lists protected paths changed since the task's baseline: test files since `testsApprovedAt`, and configuration files since `baseCommit`, including uncommitted changes. |
| `paacm gate [--tier <tier>] [--json]` | Runs the audit, then the checks for the route's tier (or the given tier); records the result and the consecutive-failure count in `state.json`. |

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
| `.agent/tasks/CURRENT` | The current task's identifier |
| `.agent/tasks/<task-id>/state.json` | Route, autonomy, status, `baseCommit`, `testsApprovedAt`, gate results, block details |
| `.agent/tasks/<task-id>/progress.md` | The append-only log |
| `.agent/tasks/<task-id>/SPEC.md`, `PLAN.md`, `REPORT.md`, `features.json`, `review-input.md`, `inputs/` | The task's working files |
