# 0005. Size-gated routing and planning

- **Status:** accepted
- **Date:** 2026-10-14

## Context

Planning helps on large work and wastes time on small work; a wrong plan does more harm than none.

## Decision

Every request gets one route: FAST (a one-sentence diff), STANDARD or DEEP, plus a high-stakes flag. FAST skips the specification, plan and review. STANDARD and DEEP plan in a file whose tasks each name files, one acceptance criterion and a verification command, which the writer re-reads before each task. Plans are human-approved at L0–L2 and critiqued by a fresh-context reviewer at L3.

## Evidence

- A standard plan plus plan reminders improves results, and a subpar plan hurts more than no plan; for strong models planning mainly saves cost ([methodologies](../../research/03-methodologies.md)).
- Vendor guidance converges on skipping the plan when the diff fits in one sentence ([methodologies](../../research/03-methodologies.md)).

## Consequences

Small tasks stay fast. A human reviews plans because a bad plan is the costliest failure.

## Alternatives considered

Full-ceremony specification for every change (rejected: spec-driven frameworks show no controlled benefit and turned one bug fix into 16 acceptance criteria).
