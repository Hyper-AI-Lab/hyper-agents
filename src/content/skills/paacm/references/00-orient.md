# Phase 0: Orient

**When:** at the start of every session in the repository, before any new work.

1. **Read the session-start message.** With the power layer installed, a hook prints the branch, a short `git status`, the last commits, the PAACM runtime command and, if a task is active, its state, plan and the tail of its progress log. Without it, run:

   ```sh
   git status --short
   git log --oneline -5
   paacm task status
   ```

2. **Resuming an active task** (`paacm task status` shows one that is not `done` or `blocked`):
   - Read its `PLAN.md` and the last entries of `progress.md`. Do not rely on memory of earlier sessions.
   - Re-establish the baseline: `paacm check --tier quick`.
   - If the baseline fails before you changed anything, record it: `paacm task log "inherited failure: <label> exits <code>"`. Fix it first only if the plan covers it; otherwise tell the human it blocks the task (trigger 2 or 3).

3. **Uncommitted changes you did not make:** do not stash, reset or discard them. Ask the human whether they belong to the task.

4. **A new request with no active task:** continue with phase 1. **A new request while a task is active:** ask whether to finish, block or set aside the active task before starting another; never mix two tasks in one working tree.
