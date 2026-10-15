# Phase 7: Verify

**When:** you believe the change is complete.

1. `paacm task phase verifying`
2. **Run the gate:**

   ```sh
   paacm gate
   ```

   The gate first audits protected paths, then runs the check tier for the route: the `gate.tier` setting (default `quick`) for FAST and STANDARD, and `gate.deepTier` (default `full`) for DEEP. It records the result in the task state. With the power layer installed, the stop hook runs the same gate whenever you try to finish, and refuses to let you finish while it fails.

   | Exit | Meaning | What you do |
   |---|---|---|
   | 0 | Audit clean, every check passed | Continue |
   | 1 | A check failed | Read the failure, fix the cause, run the gate again |
   | 3 | A required tier has no checks in `.agent/checks.conf` | You cannot fix this by coding. Report the tier under CHECKS NOT RUN and ask the human to configure it (trigger 2) |
   | 4 | The audit found an edit to a protected path | Undo your edit to that path; if the edit is needed, use trigger 4 |

3. **STANDARD work:** also run `paacm gate --tier full` before delivery. If the `full` tier is not configured, record that under CHECKS NOT RUN.
4. **Security-relevant diffs** (input handling, authentication, permissions, secrets, cryptography, dependency changes): also run `paacm gate --tier security`. Confirm that every new dependency exists in its registry under the exact name you used.
5. **User-interface work:** run the browser end-to-end checks the repository has, and compare screenshots with the design from intake.
6. **High-stakes work:**
   - Ask the human to run the held-out acceptance tests in CI (tests kept outside your workspace), and wait for the result.
   - Optionally, when the human asks for it, run best-of-N: two to four attempts in separate worktrees (`delegation.md`), filtered by the regression and acceptance tests, then chosen by `paacm-reviewer`.

**The retry cap.** The gate counts consecutive failures. After **three** consecutive failures of the same check, stop and escalate with trigger 5 instead of trying again. More attempts against the same visible tests make an agent more likely to game them, not to fix the problem.

Never weaken a check, edit a protected file, or claim a pass the gate did not report. If a check cannot run (a missing tool, a missing service), record the exact reason and the risk it leaves under CHECKS NOT RUN.
