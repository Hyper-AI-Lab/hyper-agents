# Phase 5: Tests first

**When:** STANDARD and DEEP; FAST when no existing test covers the change.

1. `paacm task phase testing`
2. **Write the tests before the fix or feature:**
   - For a defect: a regression test that reproduces it.
   - For new behaviour: acceptance tests derived from the acceptance criteria in `SPEC.md` (or from the triage summary), plus assertions of important pre- and postconditions.
   - Assert observable behaviour, not implementation details, so the tests survive a correct refactor.
3. **Run them and confirm they fail for the right reason.** A test that passes before the change proves nothing; a test that fails because of a typo or a missing import is not yet a test. Quote the failure line.
4. **Approval.** At L1, and for every high-stakes task, show the tests to the human and ask for approval. Wrong tests lock in wrong behaviour, so the human reviews them like code.
5. **Commit the tests**, then record the baseline:

   ```sh
   paacm task approve-tests
   ```

   This records the current commit as `testsApprovedAt`. Run it even on FAST tasks that rely on existing tests, before you change anything, so the existing tests are protected too.

**From this point on, test files, CI configuration, `.agent/checks.conf` and agent configuration are read-only to you.** The protect hook refuses edits to them, and `paacm audit` reports any change made by other means (including shell commands). If a test turns out to contradict the specification, or a legitimate test change is needed:

- Stop with `BLOCKED:` trigger 4 (`escalation.md`) and show the conflicting lines.
- Only after the human explicitly approves the change in the conversation may it be made, by the human or by you, followed by a new `paacm task approve-tests`.

---

**Project extensions:** if `.agent/extensions/05-tests-first.md` exists in the repository, read it now and follow it as part of this file. It may add steps, fields, reviewers and checks; it never removes or weakens a gate.
