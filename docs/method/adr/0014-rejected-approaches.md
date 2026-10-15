# 0014. Approaches the method rejects

- **Status:** accepted
- **Date:** 2026-10-14

## Context

Many popular practices have no controlled evidence or have measured harm.

## Decision

PAACM does not use: agent swarms or peer teams; parallel writers on coupled work or a shared tree; generated or kitchen-sink instruction files; agent-written tests or the agent's own report as acceptance; same-context self-review as a gate; prompt-only anti-cheating rules; unbounded retries against visible tests; unscoped 'find every gap' reviewers; best-of-N selected only by visible tests; full-ceremony specification for small changes; many MCP servers by default; maximum reasoning effort everywhere; bypass modes on workstations; classifiers as security boundaries; checkpoints instead of git; switching the lead's model mid-task; choosing methods by benchmark deltas or stars; enforcement through Cursor's import of Claude hooks.

## Evidence

- Each rejection and its evidence is listed in the study's [practices to avoid](../../research/10-practices.md).

## Consequences

The kit stays small. A team can still add any of these locally, and measure it with `paacm eval`.

## Alternatives considered

Including them as options (rejected: each adds cost or risk with no shown benefit).
