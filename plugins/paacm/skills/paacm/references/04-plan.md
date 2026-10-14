# Phase 4: Plan

**When:** STANDARD and DEEP.

1. `paacm task phase planning`
2. **Write `.agent/tasks/<task-id>/PLAN.md`** from `templates/PLAN.md`:
   - A numbered list of tasks. Each task names the files it touches, the one acceptance criterion it advances, and the verification command that proves it.
   - Each task must be small enough to finish within one fresh context. If you cannot name its verification command, it is not a task yet; split it.
   - The files the plan does not touch and what is out of scope.
   - Tasks that are mechanical and independent (renames, removals, migrations, test scaffolding) marked `delegable`.
   - Open questions from exploration that the plan depends on.
3. **Multi-session work** (the task will span several sessions): also write `features.json` from `templates/features.json`, one entry per user-visible feature, each with `"passes": false`. From then on you may change only the `passes` fields, and only when the feature's test steps pass.
4. **Get the plan checked:**
   - L0–L2: ask the human to approve it, then `paacm task log "plan approved by the human"`.
   - L3: delegate a critique to `paacm-reviewer` with `SPEC.md` and `PLAN.md`; resolve every correctness finding.
5. **Before starting each plan task, re-read `PLAN.md`.**

A bad plan is worse than no plan. When evidence shows the plan is wrong, stop, revise `PLAN.md`, log why, and get the revision approved at L0–L2. Never silently deviate from the approved plan; an edit outside the plan's files is escalation trigger 6.
