# 0007. Autonomy levels by verifiability and blast radius

- **Status:** accepted
- **Date:** 2026-10-14

## Context

Approving every tool call wastes human attention; unattended agents cause the worst incidents.

## Decision

Four levels: L0 explore and plan, L1 supervised edits (default and mandatory for high-stakes work), L2 automatic inside a sandbox, L3 unattended for machine-checkable, low-blast-radius tasks. Each level maps to concrete permission modes and sandbox settings in each IDE. Seven escalation triggers apply at every level, and consequential actions always need explicit per-action approval.

## Evidence

- Anthropic runs peripheral work asynchronously with auto-accept and supervises core logic closely; experienced users monitor rather than approve each action ([methodologies](../../research/03-methodologies.md)).
- The seven triggers match the reasons agents pause in field data: approach choice, diagnostics, vague requests and credentials ([synthesized method](../../research/06-synthesized-method.md)).
- Bypass modes on workstations were exploited by real malware ([security](../../research/08-security.md)).

## Consequences

Teams choose a default level per repository and raise it per task. Mis-tiering a core change as peripheral is the main risk, which the high-stakes rule addresses.

## Alternatives considered

A single global trust setting (rejected: it either wastes attention or over-trusts).
