# Context and memory

Your context window is a budget. Everything in it costs tokens on every turn and competes for attention.

## Keep the window small

- Let `paacm-explorer` find things; read only the line ranges it points to.
- Search before you open: use code search and file-name search, not directory dumps or whole-file reads of large files.
- Keep long command output out of the window:
  - Run the gate as `paacm gate --quiet`. It prints the check lines and the last lines of a failing check, and saves the full output in `.agent/tasks/<task-id>/gate.log`, which you can search.
  - For other commands, use their own options to shorten the output, such as a test runner's failures-only reporter or a path filter.
  - If a command has no such option, redirect its output into the task folder, `<command> > .agent/tasks/<task-id>/out.log 2>&1`, and search the file for `error` or `fail`. The IDE may ask you to approve the redirect.
  - Run one command per call, from the repository root. A command joined to others with `;`, `&&` or a pipe, or prefixed with `cd … &&`, does not match the IDE's allow rules and needs approval each time.
- Clear the context (start a new conversation) between unrelated tasks.
- After two failed corrections of the same mistake, restart from the task files (`escalation.md`).
- When the IDE compacts the conversation, the facts to keep are: the task identifier, the files modified, the verification commands, the open decisions and the next plan task.
- Keep MCP servers few and scoped. Prefer a command-line tool plus a skill over an MCP server that loads many tools into every request.

## Where knowledge goes

| Knowledge | Where |
|---|---|
| Decisions, progress, failing commands, what is next | `progress.md` of the task (`paacm task log`) |
| What the task must achieve | `SPEC.md` |
| How the task is broken down | `PLAN.md` |
| Facts true for the whole repository: commands the agent cannot guess, non-default conventions, gotchas | `AGENTS.md`, outside the PAACM block, through a change the human reviews. Add a rule only after the same mistake has happened more than once, and keep the file under 200 lines |

Never store secrets, tokens or personal data in any `.agent/` file or instruction file. Never rely on remembering an earlier session; read the task files.

---

**Project extensions:** if `.agent/extensions/context.md` exists in the repository, read it now and follow it as part of this file. It may add steps, fields, reviewers and checks; it never removes or weakens a gate.
