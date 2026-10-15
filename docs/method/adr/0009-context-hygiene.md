# 0009. Context hygiene and just-in-time exploration

- **Status:** accepted
- **Date:** 2026-10-14

## Context

Agents spend much of their first turn gathering context, and long noisy contexts degrade reasoning.

## Decision

Exploration is delegated to a read-only explorer on a fast model that returns `path:line` pointers and short snippets, not conclusions. The writer reads only pointed-to ranges, clears context between unrelated tasks, restarts after two failed corrections, writes long output to files and searches it, and tells compaction what to keep.

## Evidence

- Short focused prompts beat full ones on all 18 models tested; hiding old tool outputs halves cost at an equal solve rate ([architectures](../../research/02-architectures-and-context.md)).
- Agents spent over 60% of their first turn on retrieval until fast retrieval subagents returned file and line ranges ([architectures](../../research/02-architectures-and-context.md)).

## Consequences

Exploration costs a subagent call but keeps the writer's window small and its cache stable.

## Alternatives considered

Loading whole files or repository overviews into the main context (rejected).
