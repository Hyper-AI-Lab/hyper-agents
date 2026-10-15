---
name: paacm-verify
description: Runs the PAACM verification ladder (protected-path audit, configured check tiers, security checks when relevant) and produces evidence lines for each acceptance criterion. Use before declaring any coding task done, before claiming that tests pass, or when asked to verify, prove or double-check that a change works.
---

# Verify a change with executed evidence

Claims about a change count only when a command the harness ran proves them. This skill gives you that evidence.

`paacm <command>` means `node .claude/skills/paacm/scripts/paacm.mjs <command>` from the repository root (or the runtime command printed at session start when PAACM is a plugin).

1. **Run the gate:** `paacm gate`. It audits protected paths and runs the check tier for the current task's route. Without a current task it runs the `quick` tier. Add `--tier full` before delivering STANDARD work, and `--tier security` for security-relevant changes.
2. **Read the exit code:**
   - **0:** passed.
   - **1:** a check failed. Fix the cause and run the gate again.
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
