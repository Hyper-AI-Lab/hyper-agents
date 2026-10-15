# The synthesized method: a verified single-writer loop with state on disk

The method proposed here is called the **Verified Single-Writer Loop (VSWL)**. It rests on six principles, each derived from the evidence above. First, **one agent writes**: other agents may explore, review or verify, and parallel writes happen only in isolated worktrees on independent units. Second, **context is a budget**: the always-on file is minimal, everything else loads just in time, and exploration happens in isolated helpers. Third, **a change is accepted only on independent, executed evidence** produced by the harness, never on the agent's own report. Fourth, **long-running state lives in files and git**, not in the context window. Fifth, **autonomy scales with how verifiable the task is and how much damage a mistake could do**. Sixth, **every component is removable**: each one encodes an assumption about what the model cannot yet do, so each must be ablatable when models change ([Anthropic](https://www.anthropic.com/engineering/harness-design-long-running-apps)) [V].

## Nine phases, most of them skippable for small work

| Phase | What happens | Artifact | Gate or exit | Main evidence |
|---|---|---|---|---|
| 0. Orient | A session-start hook injects branch, `git status`, recent commits and the progress file. `init.sh` runs a smoke test before any new work | `progress.md`, `init.sh` | Smoke test green, or inherited breakage recorded first | [Anthropic harness](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) [V] |
| 1. Triage | Classify the request as trivial (diff fits in one sentence), small, large/ambiguous, or high-stakes, and assign an autonomy level (table below) | One line in the plan or chat | Trivial work skips to phase 6 with checks | [Claude Code](https://code.claude.com/docs/en/best-practices) [V]; [arXiv 2604.12147](https://arxiv.org/abs/2604.12147) [PP] |
| 2. Intake and spec (large or ambiguous only) | Interview one question at a time, skipping questions when the request already says what matters. Mark unresolved ambiguity as `[NEEDS CLARIFICATION]`, then write `SPEC.md` (see below). A human approves; execution starts in a fresh session | `SPEC.md` | Human approval; no open markers | [Claude Code](https://code.claude.com/docs/en/best-practices) [V]; [Codex](https://learn.chatgpt.com/docs/learn/best-practices) [V]; [Spec Kit](https://github.com/github/spec-kit/blob/main/spec-driven.md) [V] |
| 3. Explore | A read-only explorer subagent on a fast model returns `path:line` pointers, short quoted snippets and a summary of at most ~2k tokens. The writer does not read hundreds of files itself | Pointer list | Pointers resolve; open questions listed | [Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) [V]; [Cognition](https://cognition.com/blog/swe-grep) [V] |
| 4. Plan (small and up) | A plan file lists tasks. Each task names its files, one acceptance criterion and the verification command, and is sized to finish in one fresh context. The plan also lists what is out of scope. The writer re-reads it before each task | `PLAN.md` (or the tool's plan file) | Human review at levels 1–2; fresh-context critic at level 3 | [arXiv 2604.12147](https://arxiv.org/abs/2604.12147) [PP]; [Manus](https://manus.im/blog/Context-Engineering-for-AI-Agents-Lessons-from-Building-Manus) [V]; [HumanLayer](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/ace-fca.md) [A] |
| 5. Tests first | Write pre- and postconditions, then reproduction or acceptance tests from the spec. Confirm they fail. A human approves them for consequential work. Commit. From here on, tests are **read-only to the writer** (enforced by hook) | Committed failing tests | Tests fail for the right reason | [TDFlow](https://arxiv.org/abs/2510.23761) [PR]; [arXiv 2608.17177](https://arxiv.org/abs/2608.17177) [PR]; [ImpossibleBench](https://arxiv.org/html/2510.20270v1) [PP] |
| 6. Implement | The single writer works one task at a time. Post-edit hooks run the formatter, linter and type-checker on touched files and feed errors back. Mechanical tasks go to a cheaper subagent under a written brief. Parallel work happens only in worktrees. If the spec and tests conflict, the writer stops with `BLOCKED:` and a reason | Commits per task | Post-edit checks clean | [SWE-agent](https://arxiv.org/html/2405.15793) [PR]; [Cognition](https://cognition.com/blog/making-fable-cheaper-than-opus) [V] |
| 7. Verify | A Stop hook runs the check script (build, lint, types, full test suite) and blocks completion until it passes, with a retry cap (about 3) before escalating. A fresh-context reviewer on a strong model gets the diff, spec and check output and may flag only correctness, requirement or scope problems. Security-relevant diffs get scanners and security tests; UI work gets browser end-to-end checks with screenshots | Check log; review notes | Gate green; no unresolved correctness findings | [Claude Code](https://code.claude.com/docs/en/best-practices) [V]; [arXiv 2603.04582](https://arxiv.org/html/2603.04582v1) [PP]; [SusVibes](https://proceedings.mlr.press/v306/zhao26ax.html) [PR] |
| 8. Evidence and close | A completion report lists the commands, exit codes and key output lines, and marks each acceptance criterion passed, failed or untested. Update `progress.md` and `features.json`, then open the PR for human merge review | PR description; updated state files | Human merge decision | [Cognition](https://cognition.com/blog/testing-development) [V]; [METR](https://metr.org/blog/2025-08-12-research-update-towards-reconciling-slowdown-with-time-horizons/) [PP] |

**Two escalations apply to high-stakes work.** The first is held-out acceptance tests, kept outside the agent's workspace and run in CI ([SpecBench](https://arxiv.org/html/2605.21384)) [PP]. The second is optional best-of-N: two to four worktree-isolated attempts, filtered by the regression and acceptance tests, then picked by the fresh-context reviewer ([Anthropic](https://www.anthropic.com/news/claude-sonnet-4-5)) [V]. Both are worth their cost only when the selector is independent of the tests the writer saw.

**`SPEC.md`** has seven parts: the goal; context sources (files, docs, screenshots); constraints; an explicit out-of-scope list; three-tier boundaries of always do, ask first and never do ([Osmani](https://addyosmani.com/blog/good-spec/)) [A]; acceptance criteria written as checkable statements; and "done when", with the exact verification commands and their expected results. This is the common core of Codex's four-part prompt, Claude Code's `SPEC.md`, Superpowers' design document and ExecPlans' self-containment rule. **`features.json`** is used only for multi-session work. Each entry holds `id`, `description`, `test_steps` and `passes: false`, and the writer may change only `passes` ([Anthropic](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)) [V]. **`progress.md`** is an append-only log of what was done, what was decided and what is next. It doubles as the handoff file when a session resets.

## Five roles, one of which is a script

| Role | Implemented as | Model | Tools | Context |
|---|---|---|---|---|
| Writer (lead) | Main session | Strongest available; effort high for planning and diagnosis, medium for routine edits | Edit, shell and tests within the permission boundary | Main thread, kept lean |
| Explorer | Subagent | Fast, cheap model (Haiku-class) | Read-only | Fresh; returns pointers, not conclusions |
| Implementer (optional) | Subagent, worktree-isolated when parallel | Cheaper model | Edit and shell | Fresh; receives a written brief |
| Reviewer | Subagent | Strong model, optionally a different vendor's model | Read-only | Fresh; sees only diff, spec and evidence |
| Gate | Hook script | None (deterministic) | Runs build, lint, types and tests | n/a |

The human approves specs, plans and consequential tests, answers escalations, and merges.

Delegation briefs follow a fixed template, because brief quality alone moved one task's score from 25 to 94 ([Cognition](https://cognition.com/blog/making-fable-cheaper-than-opus)) [V]:

```text
GOAL: <one sentence>
CONTEXT: <path:line pointers; the spec section; patterns to follow>
CONSTRAINTS: <files you may touch; APIs to keep stable; no new dependencies>
EDGE CASES: <list>
DONE WHEN: <exact command(s) and expected result>
REPORT: changed files, commands run with exit codes, anything untested or uncertain.
Do not commit. Do not edit tests. If the task conflicts with the tests or spec, stop and report BLOCKED.
```

Delegation should happen early and only for mechanical work: renames, migrations, removals, test scaffolding and slow test triage. Design work, serial debugging and short tasks stay with the writer. Switching the main session's model mid-task breaks the prompt cache, so the model mix comes from subagents, each with its own cache, rather than from flipping the lead's model ([Cognition](https://cognition.com/blog/devin-fusion)) [V].

## Autonomy tiers follow verifiability and blast radius

| Level | Use for | Claude Code setting | Cursor setting | Required gates |
|---|---|---|---|---|
| L0: explore and plan only | Unfamiliar code, ambiguous requests, incident analysis | `plan` mode | Plan or Ask mode | None (no writes) |
| L1: supervised edits | Core business logic, security, data migrations, critical fixes | `default` (Manual) or `acceptEdits` with `ask` rules | Allowlist run mode | Human approves the plan and tests; full ladder |
| L2: automatic inside a sandbox | Peripheral features, prototypes, refactors with strong tests, dependency bumps | `auto` or `acceptEdits` with `sandbox.enabled` | Auto-review with the sandbox | Hooks, Stop gate and fresh-context review |
| L3: unattended or background | Only tasks with machine-checkable success and low blast radius | `claude -p --permission-mode dontAsk` with explicit `--allowedTools`, in a worktree or container | Cloud Agents, or `agent -p --force` inside a VM | All of L2, plus held-out tests and human merge |

This mirrors Anthropic's internal split between asynchronous peripheral work and supervised core work ([Anthropic PDF](https://www-cdn.anthropic.com/58284b19e702b49db9302d5b6f135ad8871e7658.pdf)) [V], and Codex's "tight by default" advice ([Codex](https://learn.chatgpt.com/docs/learn/best-practices)) [V].

At every level, the writer must stop and ask in seven situations: a choice between materially different approaches, missing credentials or access, ambiguity that changes behaviour, a conflict between the spec and the tests, the same check still failing after the retry cap, a needed edit outside the files the plan lists, and any destructive or irreversible action. These triggers match the reasons Claude itself pauses in the field: approach choice 35%, diagnostics 21%, vague requests 13%, credentials 12% ([Anthropic](https://www.anthropic.com/research/measuring-agent-autonomy)) [V]. They also cover the abort path that cut cheating ([ImpossibleBench](https://arxiv.org/html/2510.20270v1)) [PP] and the irreversible-action failure in the Replit incident ([AI Incident Database](https://incidentdatabase.ai/entities/replit)) [A].

## Context hygiene keeps the writer's window small

The always-on file stays under Claude Code's 200-line target (Cursor's rule guidance is 500 lines) and as far below it as the repository allows. It holds only commands the agent cannot guess, non-default conventions, gotchas and hard boundaries ([arXiv 2602.11988](https://arxiv.org/abs/2602.11988)) [PP]. Clear the context between unrelated tasks. After two failed corrections, restart with a better prompt. Write logs and long outputs to files and grep them, printing summary lines such as `ERROR` on one line ([Anthropic C compiler](https://www.anthropic.com/engineering/building-c-compiler)) [V]. Tell compaction what to keep: modified files, test commands and open decisions ([Claude Code](https://code.claude.com/docs/en/best-practices)) [V]. Keep MCP servers few and scoped, preferring a CLI plus a skill where one exists ([Playwright MCP](https://github.com/microsoft/playwright-mcp)) [V].
