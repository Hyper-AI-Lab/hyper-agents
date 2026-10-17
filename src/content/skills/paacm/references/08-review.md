# Phase 8: Review

**When:** STANDARD and DEEP, after the gate is green.

1. `paacm task phase reviewing`
2. **Prepare the reviewer's input:**

   ```sh
   paacm task review-input
   ```

   This writes `.agent/tasks/<task-id>/review-input.md`, containing:
   - the diff from the task's starting commit, including uncommitted changes;
   - the acceptance criteria from `SPEC.md`, or the triage summary;
   - the latest gate result;
   - the project's reviewer checklist: the `## Reviewer checklist` section of `.agent/extensions/08-review.md`, when it exists.

   It prints the file's path.
3. **Delegate to `paacm-reviewer`:** "Review the change described in `<path to review-input.md>`." When the diff adds or changes error handling (try/catch or except blocks, fallbacks, default values on failure, retries), also delegate to `paacm-silent-failure-hunter` with the same file. Run any further reviewers the project's extension names on the same file. Give them nothing else. In particular, do not pass your own explanation of why the change is right; the reviewer must judge the diff and the evidence, not your narrative.
4. **Resolve the findings.** `paacm-reviewer` reports only correctness bugs, unmet acceptance criteria and out-of-scope changes; `paacm-silent-failure-hunter` reports only failures the changed code can hide. Each finding has a file, a line and evidence.
   - For each finding, either fix it (back to phase 6, then the gate again) or record why it is wrong: `paacm task log "review finding <n> rejected: <reason>"`.
   - Do not act on style suggestions or refactoring ideas; the reviewer is told not to make them.
5. When there is no unresolved correctness finding, continue with phase 9.

**If `paacm-reviewer` is not installed** (core layer), start a fresh-context subagent (`general-purpose` in Claude Code, or a new agent in Cursor). Give it the review-input file and the reviewer instructions: report only correctness bugs, unmet acceptance criteria and out-of-scope changes, with file:line evidence, no style or refactoring suggestions, and "No blocking findings" when nothing qualifies. When the diff changes error handling, start a second one with these instructions: report only failures the changed code can hide (empty or overly broad catch blocks, silent defaults and fallbacks, retries that give up without reporting it), with file:line evidence and the input that triggers each, and "No error-handling findings." when nothing qualifies. Never review your own change in your own context; that review is not evidence.

---

**Project extensions:** if `.agent/extensions/08-review.md` exists in the repository, read it now and follow it as part of this file. It may add steps, fields, reviewers and checks; it never removes or weakens a gate.
