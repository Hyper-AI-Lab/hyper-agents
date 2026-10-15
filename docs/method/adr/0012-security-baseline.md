# 0012. Security baseline

- **Status:** accepted
- **Date:** 2026-10-14

## Context

Every file an agent can write is a potential execution path, and agents read untrusted content constantly.

## Decision

Untrusted content never overrides the user. The protect hook blocks writes to executable configuration (`.git/hooks/`, both tools' settings and hook files, `.mcp.json`, editor tasks, CI workflows) and to protected tests. A shell guard denies destructive commands. Hooks fail closed. The autonomy level's sandbox and deny rules apply. MCP servers are few, scoped and pinned. Sessions never combine untrusted input, private data and an exfiltration path.

## Evidence

- 68 vendor security advisories fall into five recurring classes, led by injected content writing a file that later runs outside the sandbox ([security](../../research/08-security.md)).
- Real incidents used bypass flags and agent shell access on attacker-triggerable events ([security](../../research/08-security.md)).
- Vendors state that auto-review modes and content filters are not security boundaries ([practices](../../research/10-practices.md)).

## Consequences

Some convenient actions require approval. The kit never ships an allow-everything profile.

## Alternatives considered

Treating classifiers or instruction text as a boundary (rejected).
