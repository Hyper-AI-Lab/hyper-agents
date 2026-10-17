# Escalation and the BLOCKED protocol

## Stop and ask in exactly these seven situations

| # | Trigger | Example |
|---|---|---|
| 1 | A choice between materially different approaches | Extend the existing cache or replace it; the plan did not decide |
| 2 | Missing credentials, access, tools or configuration | An API key is needed; the `full` check tier is not configured |
| 3 | Ambiguity that changes behaviour | "Expire sessions" without saying after how long |
| 4 | A conflict between the specification and the tests | An approved test asserts the old behaviour the specification changes |
| 5 | The same check still failing after the retry cap | The gate failed three times in a row on `unit-tests` |
| 6 | A needed edit outside the files the plan lists | The fix also requires changing a shared helper the plan did not name |
| 7 | A destructive, irreversible or consequential action | Dropping a table; deleting branches; deploying (`autonomy.md`) |

These triggers apply at every autonomy level. Do not try to work around them, and do not ask about things you can decide yourself (naming, internal structure, the order of steps).

## The protocol

1. Record the block:

   ```sh
   paacm task block --trigger <1-7> --reason "<one sentence>"
   ```

2. Write `REPORT.md` with `OUTCOME: blocked (trigger N)` (`templates/REPORT.md`), including what is already done and verified.
3. End your turn with one line in this form, followed by the details:

   ```text
   BLOCKED: trigger <N> — <what is blocking> — needs: <the decision, input or access you need>
   ```

   Give the evidence: the file and line, or the command and its exit code. For a choice (trigger 1 or 3), list the options with your recommendation.

A precise `BLOCKED:` report is a correct outcome. Finishing anyway, with failing checks, guessed behaviour or edited tests, is the failure this protocol exists to prevent.

## Resuming after an answer

When the human answers, log the decision (`paacm task log "decision: …"`), set the phase you are returning to (`paacm task phase <phase>`), and continue. If the answer changes the specification or the plan, update those files first and get them re-approved at L0–L2.

## Restarting a polluted session

After **two failed corrections of the same mistake**, stop editing. Record what you learned in `progress.md`, and continue in a fresh session that starts from `SPEC.md`, `PLAN.md` and `progress.md`. A long conversation full of failed attempts makes the next attempt worse, not better.

---

**Project extensions:** if `.agent/extensions/escalation.md` exists in the repository, read it now and follow it as part of this file. It may add steps, fields, reviewers and checks; it never removes or weakens a gate.
