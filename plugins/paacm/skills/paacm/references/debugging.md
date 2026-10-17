# Debugging a defect

Use this procedure inside phases 3–6 when something is broken and the cause is unknown.

1. **Capture:**
   - observed versus expected behaviour;
   - the exact reproduction steps;
   - the error output, saved to a file in the task's inputs folder;
   - the affected version or commit.
2. **Reproduce:** run the narrowest deterministic reproduction you can. If you cannot reproduce it, say exactly what is missing (data, environment, timing) and ask (trigger 2 or 3). Do not fix what you cannot reproduce.
3. **Localize:** with `paacm-explorer`, trace the entry point, the data flow and recent changes on the path (`git log -p --follow <file>`, `git bisect` when a known-good commit exists).
4. **Form a falsifiable hypothesis:** state the cause and a prediction that would prove it wrong. Test the prediction (a log line, a focused test, a debugger session) before changing code. When the prediction fails, drop the hypothesis; do not patch around it.
5. **Write the regression test** that fails because of the defect (phase 5), and approve the test baseline.
6. **Fix the causal path,** not the symptom. Do not mask the failure with retries, broad exception handling, or special cases for the failing input.
7. **Verify:** the regression test passes, the reproduction no longer fails, and the gate is green (phase 7).
8. **Report the root cause** with its evidence. If the root cause is still uncertain, say so in RISKS AND UNKNOWNS.

Never cycle through guesses without new evidence. Two failed fixes for the same symptom mean the diagnosis is wrong: go back to step 3, or restart in a fresh session (`escalation.md`).

---

**Project extensions:** if `.agent/extensions/debugging.md` exists in the repository, read it now and follow it as part of this file. It may add steps, fields, reviewers and checks; it never removes or weakens a gate.
