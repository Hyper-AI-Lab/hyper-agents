# Delegation and parallel work

## Who does what

| Helper | Use it for | Never use it for |
|---|---|---|
| `paacm-explorer` (read-only, fast model) | Finding where things are: entry points, call paths, tests, commands, conventions | Deciding the solution |
| `paacm-implementer` (inexpensive model) | Mechanical, independent edits: renames, removals, migrations, test scaffolding, triage of slow test suites | Design work, serial debugging, short tasks, anything touching protected files |
| `paacm-reviewer` (read-only, strong model) | Reviewing the diff against the acceptance criteria (phase 8); critiquing a plan at L3 | Writing code; style or refactoring advice |

Delegate **early** and only **mechanical** work. A clear brief matters more than the model. Do not switch your own model in the middle of a task; the model mix comes from the helpers.

## The brief

Every delegation to `paacm-implementer` uses this brief, filled in completely (`templates/brief.md`):

```text
GOAL: <one sentence>
CONTEXT: <path:line pointers; the SPEC.md section; patterns to follow>
CONSTRAINTS: <files you may touch; APIs to keep stable; no new dependencies>
EDGE CASES: <list>
DONE WHEN: <exact command(s) and expected result>
REPORT: changed files, commands run with exit codes, anything untested or uncertain.
Do not commit. Do not edit tests. If the task conflicts with the tests or spec, stop and report BLOCKED.
```

When the implementer reports back:

1. Read its diff yourself.
2. Run the DONE WHEN command yourself; its claim that the command passed is not evidence.
3. Commit only after both checks pass.

## Parallel work

Parallel edits are allowed **only** for units that share no files. Each unit runs in its own git worktree, on its own branch, under its own brief:

```sh
git worktree add ../<repo>-<task-id>-<unit> -b <task-id>/<unit>
```

Then:

1. Merge the units back yourself.
2. Run `paacm gate` on the merged tree.
3. Remove each worktree with `git worktree remove <path>`.

Agents never share a working tree, and there are no swarms, peer teams or votes.

## Best-of-N (high-stakes, on request)

1. Run two to four independent attempts in separate worktrees.
2. Discard every attempt that fails the regression or acceptance tests.
3. Give the survivors' diffs to `paacm-reviewer` to choose.

The selection must not rest only on tests the attempts could see.

---

**Project extensions:** if `.agent/extensions/delegation.md` exists in the repository, read it now and follow it as part of this file. It may add steps, fields, reviewers and checks; it never removes or weakens a gate.
