# Phase 6: Implement

**When:** after the plan (STANDARD, DEEP) or the triage (FAST).

1. `paacm task phase implementing`
2. **Work one plan task at a time, in order.** Re-read `PLAN.md` before each task.
3. **For each task:**
   1. Make the smallest coherent change that advances the task's acceptance criterion. Reuse the repository's existing patterns and dependencies. Do not refactor unrelated code or add dependencies the plan does not name.
   2. Fix what the post-edit hook reports (format, lint, type errors on the files you touched) before moving on.
   3. Run the task's verification command.
   4. When it passes, commit the task using the repository's commit message convention, naming the plan task. Log it: `paacm task log "task <n> done: <commit>"`.
4. **Delegable tasks:** hand them to `paacm-implementer` with the brief in `delegation.md`. Review its diff yourself before committing it; you remain responsible for it.
5. **Stop with `BLOCKED:`** (`escalation.md`) when:
   - the specification and the tests conflict (trigger 4);
   - the change needs a file the plan does not list (trigger 6);
   - the same verification still fails after three attempts (trigger 5);
   - a materially different approach looks better than the planned one (trigger 1).

**Do not:**

- edit protected files;
- silence or skip failing checks;
- weaken assertions, add skips or broaden catch-all handlers to get a green result;
- leave debug code, commented-out code or temporary files behind;
- start the next plan task while the current one is red.

**When every plan task is committed and its verification command passes, continue with phase 7.**
