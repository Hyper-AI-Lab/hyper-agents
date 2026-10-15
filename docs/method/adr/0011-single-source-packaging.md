# 0011. One source of content, packaged for both IDEs

- **Status:** accepted
- **Date:** 2026-10-14

## Context

Claude Code and Cursor share most extension mechanisms but differ in hook contracts, rule formats and subagent fields. Hand-maintained copies drift.

## Decision

All kit content lives once in `src/content/`. A generator emits the project-install payload and a plugin for both IDEs. CI fails when the committed output differs from the generator's.

- **Shared assets** go where both tools read them: `AGENTS.md`, `CLAUDE.md`, `.claude/skills/` and `.claude/agents/`.
- **Cursor-only files** cover only the contracts that differ:
  - `.cursor/hooks.json`, because Cursor's hook schema differs;
  - `.cursor/agents/` overrides, generated with `model: inherit` because Cursor accepts no Claude Code model alias;
  - `.cursor/permissions.json` allowlists.
- **No extra `.mdc` rules in project installs.** Cursor already reads `AGENTS.md` natively, and a second always-on rule would only add cost on every request (ADR 0004).
- **Plugin always-on rules:** the plugin, which can ship neither `AGENTS.md` nor `CLAUDE.md`, carries the core rules as an always-applied Cursor rule generated from `AGENTS.md`, because Cursor cloud agents do not run session-start hooks. Claude Code receives the same rules from the session-start hook.
- **Duplicate hook runs:** Cursor imports Claude Code hooks by default, so in a project installed for both IDEs a hook can run twice for one event. The protect hook and the shell guard keep no state. The stop gate recognises a result recorded moments earlier for the same working tree and reuses it, so one failure is never counted twice.

## Evidence

- Cursor reads `CLAUDE.md`, `.claude/skills/` and `.claude/agents/`; Claude Code reads none of Cursor's files ([IDE reference](../../research/07-claude-code-and-cursor.md)).
- Cursor's import of Claude Code hooks is off by default for Enterprises, maps no shell event and documents no fail-closed option, so enforcement must use Cursor's own hook file ([practices](../../research/10-practices.md)).
- Both tools fail open on hook errors unless configured otherwise ([IDE reference](../../research/07-claude-code-and-cursor.md)).

## Consequences

One edit updates both IDEs. Enforcement is explicit per tool.

## Alternatives considered

Separate per-IDE kits (rejected: drift); relying on Cursor's import of Claude hooks (rejected).
