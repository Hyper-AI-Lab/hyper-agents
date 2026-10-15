# 0002. Accept only on independent, executed evidence

- **Status:** accepted
- **Date:** 2026-10-14

## Context

Agents report success they have not verified, and their own tests reflect their own misunderstanding of the task.

## Decision

A change is accepted only on checks the harness runs and the writer cannot alter: the configured check tiers, the protected-path diff audit, the fresh-context review and, for high-stakes work, held-out tests in CI. The completion report marks every acceptance criterion passed, failed or untested, quoting harness output.

## Evidence

- With human-written failing tests an agent reached 94.3% on SWE-bench Verified, versus about 69.8% with its own tests; agent-written tests did not change resolution rates ([verification](../../research/04-verification.md)).
- Models claim to have run code they could not run in 5–30% of probes ([verification](../../research/04-verification.md)).
- Execution-based selection beats majority votes and reward models, which plateau ([verification](../../research/04-verification.md)).

## Consequences

Humans spend their attention on acceptance criteria and tests rather than on watching the agent. Wrong tests lock in wrong behaviour, so tests are reviewed like code.

## Alternatives considered

Self-review in the same context (rejected: self-attribution bias drops AUROC from 0.99 to 0.89); trusting the agent's narration (rejected).
