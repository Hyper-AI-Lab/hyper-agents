# 0008. State on disk and in git

- **Status:** accepted
- **Date:** 2026-10-14

## Context

Context windows compact and sessions end; long tasks lose their thread.

## Decision

All method state is files under `.agent/tasks/<task-id>/`: `state.json`, `SPEC.md`, `PLAN.md`, an append-only `progress.md`, `features.json` for multi-session work (only `passes` may change) and `REPORT.md`. Every completed plan task is a commit. A session-start hook re-injects the state.

## Evidence

- Anthropic's long-running harness pattern (feature list with pass flags, progress file, commits, smoke test, one feature per session) fixed documented failure modes ([architectures](../../research/02-architectures-and-context.md)).
- Checkpoints and rewind do not track shell-made changes and are local only, so git is the only complete checkpoint ([IDE reference](../../research/07-claude-code-and-cursor.md)).

## Consequences

Any session, human or agent, can resume a task from disk. Stale state is caught because orientation re-runs the quick checks.

## Alternatives considered

Relying on the conversation or on IDE checkpoints (rejected).
