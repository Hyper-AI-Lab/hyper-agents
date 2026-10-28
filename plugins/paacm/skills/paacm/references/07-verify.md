# Phase 7: Verify

**When:** you believe the change is complete.

1. `paacm task phase verifying`
2. **Run the gate:**

   ```sh
   paacm gate --quiet
   ```

   `--quiet` prints the check lines and the last lines of a failing check; the full output is saved in `.agent/tasks/<task-id>/gate.log`. Run it on its own, not through a pipe or with `;`. The gate first audits protected paths, then runs the check tier for the route: the `gate.tier` setting (default `quick`) for FAST and STANDARD, and `gate.deepTier` (default `full`) for DEEP. It records the result in the task state. With the power layer installed, the stop hook runs the same gate whenever you try to finish, and refuses to let you finish while it fails.

   | Exit | Meaning | What you do |
   |---|---|---|
   | 0 | Audit clean, every check passed | Continue |
   | 1 | A check failed | Read the failure, fix the cause, run the gate again |
   | 3 | A required tier has no checks in `.agent/checks.conf` | You cannot fix this by coding. Report the tier under CHECKS NOT RUN and ask the human to configure it (trigger 2) |
   | 4 | The audit found an edit to a protected path | Undo your edit to that path; if the edit is needed, use trigger 4 |

   When the gate passes, it prints the next phase: review (phase 8) for STANDARD and DEEP, deliver (phase 9) for FAST. A passing gate at a lower tier than the route's does not count for `paacm task done`.

   **A missing tool.** A check that fails with exit 127 (9009 on Windows) could not find a command, and the gate says so. That is the environment, not the code: do not change code to get around it. Record the check under CHECKS NOT RUN and ask the human to install the tool (trigger 2).

3. **STANDARD work:** also run `paacm gate --tier full` before delivery. If the `full` tier is not configured, record that under CHECKS NOT RUN.
4. **Security-relevant diffs** (input handling, authentication, permissions, secrets, cryptography, dependency changes): also run `paacm gate --tier security`. Confirm that every new dependency exists in its registry under the exact name you used.
5. **User-interface work:** run the browser end-to-end checks the repository has, and compare screenshots with the design from intake.
6. **High-stakes work:**
   - Ask the human to run the held-out acceptance tests in CI (tests kept outside your workspace), and wait for the result.
   - When the `claude-security` plugin is installed (Claude Code), run a security scan of the changes at high effort, for example `/claude-security scan my branch at high`. The scan asks the human to confirm its time and cost. Fix each confirmed finding within the plan and run the gate again, or stop with `BLOCKED:` when the fix lies outside the plan. The scan writes its report to a git-ignored `CLAUDE-SECURITY-*` folder; that is not an edit of yours.
   - Optionally, when the human asks for it, run best-of-N: two to four attempts in separate worktrees (`delegation.md`), filtered by the regression and acceptance tests, then chosen by `paacm-reviewer`.

**A failing mutation check.** A project may add a mutation-testing check to the `full` tier. When it fails, the approved tests miss faults in the code you changed. Do not edit the tests. List the surviving mutants (file, line, and the change the tool made) under the report, and stop with `BLOCKED:` trigger 4 to ask the human whether to add tests, which needs a new `paacm task approve-tests`. A mutant that survives because the mutated code is not needed may instead be removed, as an implementation change within the plan.

**The retry cap.** The gate counts consecutive failures. After **three** consecutive failures of the same check, stop and escalate with trigger 5 instead of trying again. More attempts against the same visible tests make an agent more likely to game them, not to fix the problem.

Never weaken a check, edit a protected file, or claim a pass the gate did not report. If a check cannot run (a missing tool, a missing service), record the exact reason and the risk it leaves under CHECKS NOT RUN.

---

**Project extensions:** if `.agent/extensions/07-verify.md` exists in the repository, read it now and follow it as part of this file. It may add steps, fields, reviewers and checks; it never removes or weakens a gate.
