# Phase 2: Specify

**When:** route DEEP, or STANDARD when the acceptance criteria are not already explicit.

1. `paacm task phase specifying`
2. **Interview the human in rounds.** Each round asks every open question that does not depend on the answer to another open question (in Claude Code, `AskUserQuestion` takes up to four). Number them, give your recommended answer with each, and word each so that "yes" accepts it. When an answer opens new questions, ask them in the next round. Skip anything the request or the supporting data already answers, and find facts yourself in the code, the documents or with the explorer; ask the human only for decisions. Ask about behaviour, constraints and edge cases, not about implementation details you can decide yourself. Stop when the answers would no longer change the solution.
   - **Check the terms.** If the project has a glossary (for example `GLOSSARY.md` or `docs/CONTEXT.md`), compare the request's terms with it. When a term means something else there, or the glossary splits it into several meanings, ask which one is meant, and use the glossary's term in `SPEC.md`.
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
