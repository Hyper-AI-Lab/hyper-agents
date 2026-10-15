# 0001. One writer, read-only helpers

- **Status:** accepted
- **Date:** 2026-10-14

## Context

Coding work is sequential and tightly coupled: a change in one file constrains the next. Multi-agent systems are widely promoted for coding.

## Decision

Exactly one agent, the writer, edits the working tree. Explorer and reviewer subagents are read-only and start from a fresh context. Parallel edits are allowed only for independent units, each in its own git worktree, merged by the writer, who re-runs the gate on the merged tree.

## Evidence

- Every multi-agent variant degraded sequential tasks by 39–70% in the only controlled topology study, with up to 17.2× error amplification ([architectures](../../research/02-architectures-and-context.md)).
- Vendors that run large agent fleets keep writes single-threaded and use helpers for exploration and review ([architectures](../../research/02-architectures-and-context.md)); parallel writers succeeded only as planner → isolated workers → judge with an automated oracle.
- A diff-only review agent catches about two bugs per pull request, 58% of them severe ([verification](../../research/04-verification.md)).

## Consequences

Less wall-clock parallelism than a swarm. Independent units can still run in parallel worktrees.

## Alternatives considered

Peer teams, swarms and consensus topologies (rejected in [ADR 0014](0014-rejected-approaches.md)); a separate planner subagent (rejected: planning stays with the writer, which owns the plan's consequences, and forced delegation lowered results).
