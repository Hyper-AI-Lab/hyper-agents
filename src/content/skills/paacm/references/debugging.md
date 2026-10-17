# Debugging a defect

Use this procedure inside phases 3–6 when something is broken and the cause is unknown.

1. **Capture:**
   - observed versus expected behaviour;
   - the exact reproduction steps;
   - the error output, saved to a file in the task's inputs folder;
   - the affected version or commit.
2. **Build a loop that goes red.** Before forming any theory, find one command that reproduces the reported symptom: it fails on this exact symptom, not merely with some error; it gives the same verdict on every run; and it runs in seconds. Try, roughly in this order: a failing test at the level that reaches the bug; a script against the running service; the command-line tool with a fixture input; a browser script; a captured request or log replayed through the code path; a small throwaway harness; a property or fuzz loop for output that is only sometimes wrong; `git bisect run` when a known-good commit exists; the same input through the old and the new version. For an intermittent bug, raise the reproduction rate (repeat it, add load, narrow the timing) until it fails often enough to debug. If you cannot build such a loop, say exactly what is missing (data, environment, timing) and ask (trigger 2 or 3). Do not fix what you cannot reproduce.
3. **Shrink it.** Remove inputs, steps, data and configuration one at a time, running the loop after each cut, until every remaining part is needed for the failure.
4. **Localize:** with `paacm-explorer`, trace the entry point, the data flow and recent changes on the path (`git log -p --follow <file>`, `git bisect` when a known-good commit exists).
5. **Rank three to five falsifiable hypotheses** before testing any. Each names a cause and a prediction that would prove it wrong: "if X is the cause, changing Y makes the failure disappear". When the human is present, show them the ranked list; they often rule some out at once. Test one prediction at a time, changing one variable per probe (a debugger session, a focused test, a targeted log line). Tag every temporary log line with one unique prefix, such as `[DEBUG-a4f2]`, so one search finds them all. When a prediction fails, drop the hypothesis; do not patch around it. For a performance regression, measure a baseline first and bisect instead of logging.
6. **Write the regression test** from the shrunken reproduction (phase 5), at a level where it exercises the bug as it really occurs, and approve the test baseline. If no such level exists, say so in the report: the design is keeping the bug from being locked down.
7. **Fix the causal path,** not the symptom. Do not mask the failure with retries, broad exception handling, or special cases for the failing input.
8. **Verify:** the regression test passes, the loop from step 2 no longer fails on the original scenario, no `[DEBUG-` line remains, and the gate is green (phase 7).
9. **Report the root cause** with its evidence. If the root cause is still uncertain, say so in RISKS AND UNKNOWNS.

Never cycle through guesses without new evidence. Two failed fixes for the same symptom mean the diagnosis is wrong: go back to step 4, or restart in a fresh session (`escalation.md`).

---

**Project extensions:** if `.agent/extensions/debugging.md` exists in the repository, read it now and follow it as part of this file. It may add steps, fields, reviewers and checks; it never removes or weakens a gate.
