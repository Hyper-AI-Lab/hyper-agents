# 0011. One source of content, packaged for both IDEs

- **Status:** accepted
- **Date:** 2026-10-14

## Context

Claude Code and Cursor share most extension mechanisms but differ in hook contracts, rule formats and subagent fields. Hand-maintained copies drift.

## Decision

All kit content lives once in `src/content/`. A generator emits the project-install payload and a plugin for both IDEs. Shared assets go where both tools read them (`CLAUDE.md`, `.claude/skills/`, `.claude/agents/`); Cursor-only files cover the divergent contracts (`.cursor/hooks.json`, `.cursor/rules/*.mdc`, `.cursor/agents/` overrides, permissions and sandbox). CI fails when committed output differs from the generator's.

## Evidence

- Cursor reads `CLAUDE.md`, `.claude/skills/` and `.claude/agents/`; Claude Code reads none of Cursor's files ([IDE reference](../../research/07-claude-code-and-cursor.md)).
- Cursor's import of Claude Code hooks is off by default for Enterprises, maps no shell event and documents no fail-closed option, so enforcement must use Cursor's own hook file ([practices](../../research/10-practices.md)).
- Both tools fail open on hook errors unless configured otherwise ([IDE reference](../../research/07-claude-code-and-cursor.md)).

## Consequences

One edit updates both IDEs. Enforcement is explicit per tool.

## Alternatives considered

Separate per-IDE kits (rejected: drift); relying on Cursor's import of Claude hooks (rejected).
