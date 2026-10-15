# 0013. Evaluation on a private, frozen task set

- **Status:** accepted
- **Date:** 2026-10-14

## Context

Public benchmarks are contaminated and mis-graded; method claims need evidence from the team's own code.

## Decision

`paacm eval` records runs of a repository-specific task set (30–60 real tasks, development and held-out splits, hidden acceptance tests) in paired arms: without PAACM, with PAACM, and with single components removed. It reports accepted regression-free completion as the primary metric, with cost, time, interventions, scope creep, test tampering, false completion claims and safety incidents, and states when a difference is too small to detect.

## Evidence

- SWE-bench Verified was retired after an audit found most examined hard tasks flawed; about 30% of SWE-bench Pro's public tasks are broken ([benchmarks](../../research/01-benchmarks.md)).
- Clustered standard errors can be over three times naive ones; with about 40 tasks only effects of 15–20 points are detectable ([evaluation](../../research/09-evaluation.md)).
- Fixing grader bugs moved one score from 42% to 95% ([evaluation](../../research/09-evaluation.md)).

## Consequences

Teams learn which components help on their code and remove the rest.

## Alternatives considered

Choosing components by public leaderboard deltas or popularity (rejected).
