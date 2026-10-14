# Deterministic verification policy

## Evidence ladder

1. Inspect the diff and run format/syntax checks relevant to the edit.
2. Run the nearest focused unit/regression tests.
3. Run project quick checks (lint, typecheck, fast tests).
4. Run full integration/build/test checks for material or cross-cutting changes.
5. For security-sensitive work, perform relevant security review and configured checks; obtain human review for consequential risks.

Use **sh scripts/agent-check --list** to inspect configured commands. **--quick**, **--full**, and **--security** execute only manifest entries for the requested tiers. Full/security modes deliberately fail if their required tiers have no commands.

## Rules

- Configure .agent/checks.conf from **real project commands**; never invent test commands or report them as run.
- Treat the manifest as executable code; review modifications before running it.
- Tests alone cannot establish semantic correctness. Review behavior against the task contract and edge cases.
- When a command cannot run, record the exact reason and the risk of the missing evidence.
- Do not weaken checks, suppress failures, or alter unrelated code solely to obtain a passing status.
- For migrations, permissions, auth, and data integrity, include explicit rollback/containment and human review.