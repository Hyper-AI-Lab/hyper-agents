---
name: paacm-verify
description: Runs the PAACM verification ladder (protected-path audit, configured check tiers, security checks when relevant) and produces evidence lines for each acceptance criterion. Use before declaring any coding task done, before claiming that tests pass, or when asked to verify, prove or double-check that a change works.
---

# Verify a change with executed evidence

Claims about a change count only when a command the harness ran proves them. This skill gives you that evidence.

`paacm <command>` means `node .claude/skills/paacm/scripts/paacm.mjs <command>` from the repository root (or the runtime command printed at session start when PAACM is a plugin).

If `.agent/extensions/07-verify.md` exists, read it first and follow it together with these steps. It may add checks; it never removes one.

1. **Run the gate:** `paacm gate --quiet`, on its own (no pipe, no `;`). It audits protected paths and runs the check tier for the current task's route; `--quiet` prints the check lines and a failing check's last lines, and with a task the full output is saved as `gate.log` in the task folder. Without a current task it runs the `quick` tier. Add `--tier full` before delivering STANDARD work, and `--tier security` for security-relevant changes.
2. **Read the exit code:**
   - **0:** passed.
   - **1:** a check failed. Fix the cause and run the gate again. If the check exited 127 (on Windows, cmd's "is not recognized" message), a command was not found: that is the environment, not the code. Record the check as not run and stop with `BLOCKED:` trigger 2 to ask the human for the tool.
   - **3:** a tier has no checks. Record it as not run and tell the human it needs configuring.
   - **4:** a protected path changed. Undo the change, or escalate if the change is needed.
3. **After three consecutive failures of the same check, stop and escalate** (trigger 5) instead of trying again.
4. **For each acceptance criterion** (`SPEC.md`, or the task summary), state `passed`, `failed` or `untested`. Quote the command, its exit code and the key output line that decides it. A criterion is passed only on output from this session.
5. **List every check you could not run,** with the reason and the risk it leaves.

Never:

- edit tests, CI configuration, `.agent/checks.conf` or hook files to make a check pass;
- weaken an assertion or skip a test;
- describe a check you did not run as passed.

If the requirements and the tests conflict, stop with `BLOCKED:` and show the conflicting lines.
