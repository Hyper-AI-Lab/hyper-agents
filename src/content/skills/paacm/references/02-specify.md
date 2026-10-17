# Phase 2: Specify

**When:** route DEEP, or STANDARD when the acceptance criteria are not already explicit.

1. `paacm task phase specifying`
2. **Interview the human one question at a time.** Skip anything the request or the supporting data already answers. Ask about behaviour, constraints and edge cases, not about implementation details you can decide yourself. Stop when the answers would no longer change the solution.
3. **Write `.agent/tasks/<task-id>/SPEC.md`** from `templates/SPEC.md`. It has exactly seven parts:
   1. Goal
   2. Context sources (files with line ranges, documents, screenshots, reference repositories with their commit)
   3. Constraints
   4. Out of scope
   5. Boundaries: always do, ask first, never do
   6. Acceptance criteria: numbered, each one a statement a check can confirm
   7. Done when: the exact commands and their expected results
4. Mark every unresolved point as `[NEEDS CLARIFICATION: <question>]` instead of guessing. A specification with a marker is not ready.
5. **Ask the human to approve the specification.** Show the acceptance criteria and the out-of-scope list; they are what the human most needs to check. Record the approval: `paacm task log "spec approved by the human"`.
6. **DEEP work:** recommend continuing in a fresh session that starts from `SPEC.md`, so implementation starts with a clean context.

A good acceptance criterion names an observable behaviour and how to observe it: "Requests with a session idle for more than 30 minutes receive 401 (test `session_expiry.test.ts`)". A bad one is a wish: "Sessions should be secure."

---

**Project extensions:** if `.agent/extensions/02-specify.md` exists in the repository, read it now and follow it as part of this file. It may add steps, fields, reviewers and checks; it never removes or weakens a gate.
