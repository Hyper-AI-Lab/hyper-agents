# PAACM implementation workflow

Use this for feature work, changes, and scoped refactors. Adapt effort to risk; do not mechanically expand simple tasks.

## 1. CONTRACT
Capture desired behavior, non-goals, constraints, compatibility, acceptance criteria, and what counts as done. Ask only when a missing decision materially changes implementation or safety.

## 2. DISCOVER / LOCALIZE
Read repository instructions and Git status. Search for the owning code path, callers, data flow, and nearest tests. Inspect relevant CI and build conventions. Do not edit before locating the likely change surface.

## 3. ROUTE
- **FAST:** clear, local, reversible change; low blast radius; straightforward test.
- **STANDARD:** default feature/bug work; multiple related files; ordinary integration.
- **DEEP:** auth/security, migrations, data loss, broad APIs, cross-cutting behavior, unclear specification, difficult rollback.

Escalate route if new evidence raises risk.

## 4. PLAN
For STANDARD/DEEP, state files, sequence, test strategy, integration hazards, and rollback. In DEEP, explicitly identify assumptions, failure modes, and review boundaries. Keep a single patch owner.

## 5. EXECUTE
Make a small coherent patch, reuse established patterns, keep unrelated changes untouched, and add focused regression tests. Do not silently rewrite generated artifacts or lockfiles unless needed and reviewed. Avoid new dependencies unless justified and approved.

## 6. LONG-TASK CONTROL
For lengthy work, write brief checkpoints under .agent/state/ (ignored by Git) with objective, completed steps, next action, failing commands, and decisions. Resume from evidence, not an imagined memory of progress. Do not store secrets there.

## 7. VERIFY
Review .agent/checks.conf before running it. Run focused tests first, then **sh scripts/agent-check --quick**, and **--full** for material changes once the full tier is configured. Run relevant security checks for high-risk work. Record exact commands and outcomes. Missing check tiers are failures to configure, not passing tests.

## 8. RECOVER
If a check fails, capture the failure, isolate the cause, make one evidence-based correction, and rerun the relevant check. Avoid endless edit/test loops. Seek approval before destructive cleanup or rollback that affects user work.

## 9. CHALLENGE
Read the final diff and test evidence as a skeptical reviewer: requirements, edge cases, security, concurrency, migration behavior, and unintended effects. Use an independent **read-only** review only when the benefit exceeds cost.

## 10. HANDOFF
Summarize outcome, files changed, commands run with pass/fail, commands not run, risks, and approvals. Do not commit, push, deploy, or publish unless requested.