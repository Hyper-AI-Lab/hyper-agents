# Changelog

## 3.3.0 — Error-handling review and companion plugins

- **Error-handling reviewer.** `paacm-silent-failure-hunter`, adapted from Anthropic's `silent-failure-hunter` (Apache License 2.0), reviews the same `review-input.md` as the reviewer when a diff changes error handling, and reports only failures the changed code can hide: swallowed errors, overly broad catches, unrequested fallbacks, retries that give up silently ([ADR 0019](docs/method/adr/0019-error-handling-review-and-companion-plugins.md)).
- **Security scan for high-stakes work.** When Anthropic's `claude-security` plugin is installed, verification of high-stakes work runs its scan of the changes at high effort.
- **Companion plugins.** The setup guide explains `claude-security` and `security-guidance`, including what `security-guidance` installs at runtime and which of its reviews duplicate PAACM's.
- **Research addendum.** An assessment of Anthropic's official plugins in [07-claude-code-and-cursor.md](docs/research/07-claude-code-and-cursor.md).

## 3.2.0 — Code intelligence and test strength

- **Reasoning effort by role.** The reviewer runs at `high` effort and the implementer at `medium`, as [ADR 0010](docs/method/adr/0010-model-allocation.md) prescribes; Cursor ignores the field.
- **Code intelligence.** The explorer and the reviewer use the read-only `LSP` tool when a code-intelligence plugin is installed. The setup guide explains the official plugins, and `paacm doctor` warns when a project enables one whose language server is not on `PATH` ([ADR 0017](docs/method/adr/0017-code-intelligence.md)).
- **Test strength.** Phase 5 adds a property-based test for rule, parsing and transformation logic when the project has a property-testing library. A project may add a mutation check to the `full` tier; when it fails, the agent reports the surviving mutants and asks for more tests instead of editing the frozen ones ([ADR 0018](docs/method/adr/0018-test-strength.md)).
- **Evaluation.** The evaluation guide shows how to read the outcome, tokens, cost and time of a `claude -p` trial for `eval grade`, including resumed runs.
- **Research addendum (17 October 2026).** New evidence on mutation testing, property-based testing and clean code in [04-verification.md](docs/research/04-verification.md), and on code intelligence in [07-claude-code-and-cursor.md](docs/research/07-claude-code-and-cursor.md).

## 3.1.0 — Project extensions

- **Project extensions.** A repository adds its own rules to any phase in `.agent/extensions/<reference file name>`, for example a knowledge base to read at intake, fields a spec must have, reviewers to run, or a learnings step at delivery. So an existing team workflow and PAACM run as one process.
  - Every reference ends with the line that loads its extension, and the session-start message lists the extensions present.
  - The `## Reviewer checklist` section of `.agent/extensions/08-review.md` reaches the fresh-context reviewer through `review-input.md`.
  - An extension never removes or weakens a gate ([ALGORITHM.md section 15](docs/method/ALGORITHM.md#15-project-extensions), [ADR 0016](docs/method/adr/0016-project-extensions.md), [guide](docs/guide/extending.md)).
- **Protection and health checks.** `.agent/extensions/**` is protected configuration by default. `paacm doctor` reports extensions whose name matches no reference and extensions an explicit protect list does not cover.
- **Shared machines.** The setup guide explains how to run PAACM on a server several people use: one account and one clone per person, no long-lived cloud keys where agents run, and not as root ([setup guide](docs/guide/setup.md#shared-machines)).
- **Upgrading from 3.0.** An untouched `.agent/paacm.json` is updated by `paacm upgrade`. If you changed it, add `".agent/extensions/**"` to `protect.config` yourself before adding extensions; `paacm doctor` reports when it is missing.

## 3.0.0 — The Verified Single-Writer Loop

The method is rebuilt from a study of current research, vendor guidance and tooling, and specified in `docs/method/ALGORITHM.md` with a decision record for each major choice.

- **Method:** phases from intake to delivery, routed FAST, STANDARD or DEEP with a high-stakes flag; autonomy levels L0–L3; one writer with read-only explorer and reviewer subagents in fresh contexts; tests written first and frozen after approval; completion gated on executed checks; seven escalation triggers and the `BLOCKED:` protocol; task state on disk.
- **Supporting data:** reference repositories, documents, screenshots, logs and links are recorded per task and treated as untrusted data.
- **Claude Code and Cursor:** skills (`paacm`, `paacm-verify`, `paacm-review`), subagents, hooks (session start, test and configuration protection, a shell guard, post-edit checks, the stop gate) and permission profiles per autonomy level, from one source for both IDEs.
- **Distribution:** a plugin for both IDEs from this repository's marketplaces, or a project install.
- **Command-line tool** (`npx github:Hyper-AI-Lab/hyper-agents`, Node.js 20 or later, no dependencies): `init`, `upgrade` and `uninstall` that never overwrite your content; `doctor`; `detect`; `check`; and `eval` for grading runs of your own task set and comparing arms.
- **Check runner:** validates the whole manifest first, closes standard input for every check, accepts CRLF, prints PASS or FAIL per check with a summary, and fails closed on a missing tier. This fixes the 2.0.0 defects D1–D4.
- **Installer:** refuses targets inside the kit, never writes through symbolic links, and installs files with normal permissions. This fixes D5 and D7.
- **Tests and CI:** `node:test` suites for the runner, the installer, the runtime, every hook against both IDEs' contracts, the generator and `eval`. CI runs them on Linux, macOS and Windows with Node.js 20, 22 and 24, installs into fixture projects, lints the Markdown, checks every relative link, and validates the plugin with Claude Code. This fixes D6.
- **Removed:** `scripts/agent-check` and `scripts/install-to-project.sh`. `paacm upgrade --from-v2` migrates 2.0.0 projects (`docs/guide/upgrading-from-2.md`).

## 2.0.0 — Initial PAACM release

- Introduced a portable, adaptive coding loop with FAST, STANDARD, and DEEP routes.
- Added shared AGENTS.md policy, Claude Code skill, and Cursor command adapter.
- Added implementation, debugging, review, security, and verification modules.
- Added a fail-closed, manifest-driven check runner and non-overwriting project installer.
- Added task contracts, evaluation guidance, MCP inventory, and team onboarding documentation.

This release is an initial implementation for pilot evaluation, not a claim of benchmarked superiority.
