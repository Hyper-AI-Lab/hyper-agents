# 0020. Questions in rounds, questionnaires for absent deciders, and loop-first debugging

- **Status:** accepted
- **Date:** 2026-10-17

## Context

At autonomy L1 the human's waiting time is the method's largest cost, and asking one question at a time multiplies it. Client projects often block on decisions that only someone outside the conversation can make. The debugging procedure asked for one hypothesis and a reproduction, but not for a reproduction tight enough to test hypotheses against.

## Decision

- Intake and specification ask in rounds: each round asks every open question that does not depend on the answer to another open question, numbered, each with a recommended answer worded so that "yes" accepts it. The writer finds facts itself and asks only for decisions. The specification phase also checks the request's terms against the project's glossary.
- When a decision belongs to someone outside the conversation, the writer offers to draft a questionnaire for that person in the task folder.
- Debugging starts by building one fast, deterministic command that fails on the reported symptom, shrinks the reproduction, and ranks three to five falsifiable hypotheses before testing any. Temporary log lines carry one prefix so that one search removes them.
- Tests compute expected values independently of the code under test.
- The extension guide gives five rules for writing agent instructions.

## Evidence

These practices come from Matt Pocock's skills (`grilling`, `to-questionnaire`, `diagnosing-bugs`, `domain-modeling`, `tdd`, `writing-for-agents`; MIT licence), rewritten here in the method's own terms ([mattpocock/skills](https://github.com/mattpocock/skills)) [A]. The one-question rule they replace came from community practice, not from a controlled comparison ([methodologies](../../research/notes/methodologies-and-workflows.md)) [A]. `diagnosing-bugs` ranks several hypotheses because a single one anchors on the first plausible idea [A]. The kit's own evaluation can measure whether rounds lower interventions and wall-clock time on a team's tasks ([ADR 0013](0013-evaluation.md)).

## Consequences

Fewer turns spent waiting for one answer at a time, and a structured way to collect answers from people who are not present. Debugging spends more effort before the first hypothesis, and less on guesses. The evidence is practitioner experience, so the evaluation harness should confirm it on a team's own tasks.

## Alternatives considered

Keeping one question per turn (rejected: more human stops for the same information), installing Pocock's skills as a plugin (rejected: it brings its own process, router and issue-tracker setup alongside PAACM's), and adopting ECC or the official `ralph-loop` plugin (rejected; see the [research addendum](../../research/03-methodologies.md#added-on-17-october-2026-matt-pococks-skills-ecc-and-the-official-ralph-plugin)).
