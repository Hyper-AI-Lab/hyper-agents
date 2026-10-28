# Phase 9: Deliver

**When:** the gate is green and the review has no unresolved correctness finding.

1. **Write `.agent/tasks/<task-id>/REPORT.md`** from `templates/REPORT.md`:
   - Mark each acceptance criterion **passed**, **failed** or **untested**.
   - Quote the gate output or command, with its exit code, as the evidence for each.
   - A criterion is passed only on evidence the harness produced in this task.
2. **Close the task:**

   ```sh
   paacm task done
   ```

   It refuses unless the task reached its last phase (`paacm task phase reviewing`; `verifying` is enough for FAST), the tests were approved, the latest gate passed at the route's tier at the current commit with no uncommitted changes since, and `REPORT.md` begins with `OUTCOME: done`. Each refusal says what is missing. If the gate is the problem, go back to phase 7. If the outcome is blocked, close the task with `paacm task block` instead and end your turn with a `BLOCKED:` line.
3. **Update multi-session state:** flip `passes` to `true` in `features.json` only for features whose test steps passed in this session.
4. **Give the report as your final answer**, in the same format. Put anything that needs the human's decision under NEEDS APPROVAL.
5. **Pushing and pull requests:** push the branch or open a pull request only if the human asked for it or the autonomy level allows it (`autonomy.md`). The human decides the merge. Never merge your own change into a protected branch.

For a FAST task, the report may be short, but it still lists the gate command and its exit code.

---

**Project extensions:** if `.agent/extensions/09-deliver.md` exists in the repository, read it now and follow it as part of this file. It may add steps, fields, reviewers and checks; it never removes or weakens a gate.
