# 0016. Projects extend the method per phase, never by removing a gate

- **Status:** accepted
- **Date:** 2026-10-17

## Context

Teams adopt PAACM into repositories that already have their own agent conventions: a knowledge base to consult, a plan-of-plans to respect, specialist reviewers, a learnings file, sensitive paths. Before 3.1 the only place for such rules was the always-on `AGENTS.md`. There they cost tokens in every session and sit far from the moment they apply. A project with its own workflow ends up with two competing processes.

## Decision

A project adds rules to any reference of the `paacm` skill by creating `.agent/extensions/<reference file name>`, for example `.agent/extensions/01-intake-triage.md` or `.agent/extensions/08-review.md`.

- **Loading.** Every reference ends with a line telling the agent to read its extension, and the session-start hook lists the extensions present. So the rule loads exactly when the phase starts.
- **Reviewers.** The `## Reviewer checklist` section of the review extension is copied into `review-input.md`, so the fresh-context reviewer receives it.
- **Explorer.** The explore reference tells the writer to put the explore extension's requirements in the explorer's brief.
- **Protection.** Extensions are protected configuration (`.agent/extensions/**` in the default `protect.config`). `paacm doctor` warns about names that match no reference and about extensions an explicit protect list does not cover.
- **The rule.** An extension may add steps, fields, reviewers and checks. It must not remove or weaken a gate: human approvals, frozen tests, the gate, the escalation triggers, approval of consequential actions. On a conflict the gate wins and the agent tells the human.

This is a rule the agent follows, not a machine check: the gates it protects are enforced by the hooks and the runtime regardless of what an extension says.

## Evidence

- Instructions work best when they load at the moment of use and the always-on file stays short ([context](../../research/02-architectures-and-context.md); [ADR 0004](0004-minimal-instructions.md), [ADR 0009](0009-context-hygiene.md)).
- Subagents start from a fresh context and see only what their brief contains ([IDE reference](../../research/07-claude-code-and-cursor.md)), so project review criteria must travel in the review input.

## Consequences

Project rules live in small files next to the phase they change, survive `paacm upgrade` because the kit never writes them, and can be reviewed like code. An install made before 3.1 that lists `protect.config` explicitly must add `.agent/extensions/**` itself; `doctor` reports it.

## Alternatives considered

- Project rules only in `AGENTS.md` (rejected: always-on cost, loaded far from the phase, invisible to subagents).
- Configuration keys in `.agent/paacm.json` for reviewers, sources and fields (rejected: a schema for every kind of rule, and the agent still needs prose to apply them).
- Forking the skill per project (rejected: upgrades overwrite or diverge).
