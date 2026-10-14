# 0010. A strong lead with inexpensive helpers under a fixed brief

- **Status:** accepted
- **Date:** 2026-10-14

## Context

Frontier models are expensive; much coding work is mechanical.

## Decision

The writer uses the strongest model, with high reasoning effort for planning, diagnosis and review and medium effort for routine edits. Mechanical, independent work is delegated early to an inexpensive implementer under a fixed brief (goal, context pointers, constraints, edge cases, done-when command, report format). The explorer uses a fast model; the reviewer a strong one. The writer's own model does not change mid-task.

## Evidence

- A strong lead with a cheaper helper matched frontier quality at 40–60% lower cost; a lead that delegated early with clear briefs cost 54% less at the same score ([architectures](../../research/02-architectures-and-context.md)).
- Brief quality alone moved one task's score from 25 to 94 ([synthesized method](../../research/06-synthesized-method.md)).
- Medium effort matched the best score with 76% fewer tokens; maximum effort often lowered accuracy ([practices](../../research/10-practices.md)).

## Consequences

Lower cost per accepted change. The evidence is vendor-reported, which is why the evaluation harness re-tests it.

## Alternatives considered

Maximum effort everywhere and switching the lead's model mid-session (rejected in [ADR 0014](0014-rejected-approaches.md)).
