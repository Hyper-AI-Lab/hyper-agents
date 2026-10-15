# 0004. Minimal always-on instructions; skills for procedures; hooks for must-happen rules

- **Status:** accepted
- **Date:** 2026-10-14

## Context

Instruction files are loaded into every request. Longer files are followed less reliably and cost tokens on every turn.

## Decision

`AGENTS.md` holds only what the agent cannot discover: commands, non-default conventions, gotchas and hard boundaries, under 200 lines. The algorithm's procedures live in skills that load on demand. Rules that must hold regardless of what the model decides live in hooks.

## Evidence

- Repository context files raised cost by more than 20% without raising success; LLM-generated files lowered success by 0.5–3 points ([architectures](../../research/02-architectures-and-context.md)).
- Even the best models followed only about 68% of 500 instructions ([practices](../../research/10-practices.md)).
- Both vendors document instruction files as advisory and hooks as guaranteed ([IDE reference](../../research/07-claude-code-and-cursor.md)).

## Consequences

The kit's always-on file is short and the bulk of the method sits in skills. Teams add rules only after a repeated mistake.

## Alternatives considered

Kitchen-sink rule packs and generated instruction files (rejected in [ADR 0014](0014-rejected-approaches.md)).
