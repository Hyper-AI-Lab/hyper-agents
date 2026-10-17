# Requirements and traceability

This document defines what this repository must deliver, records the state of the 2.0.0 release against those requirements, and (from 3.0.0) maps every requirement to the files and tests that satisfy it.

## Specification

The project owner's statement of intent, which every requirement below derives from:

> The best existing principles and approaches of AI agentic coding. It should create the study of all the existing top-notch approaches, architectures, ways, methods, libraries, modules and tools. Then those have to be analyzed and processed to be merged in the single ultimate method having the best and most optimal structure providing the most efficient and optimal results and most intelligent, autonomous and accurate results. The resulting methodology should be suitable for the most popular IDEs and can be easily set up there.
>
> The implementation of the single most optimal and efficient algorithm for agentic coding that could be implemented in 1) Claude Code and 2) Cursor. It should have the full entire instructions set for the AI agent in those IDEs: explain to the IDE agent how to run the code development algorithm so that its application leads to that most efficient agentic coding implementation found in the research. It should also have instructions for the user about how to properly run agentic coding to use that algorithm. Prioritize efficiency, clarity, intelligence, reliability, autonomy and usage simplicity. It is an agentic coding kit that an agent can use. The input is the user's request prompt and, optionally, supporting data: a GitHub repository, an existing local codebase, or anything else related to the task.

Scope decisions recorded on 2026-10-14:

- Supported IDEs: **Claude Code** and **Cursor**. `AGENTS.md` remains the canonical policy file, which other agents that read it can also use, but no other IDE is a supported target.
- Design posture: a **portable core** every installation gets, plus an **opt-in power layer** (specialist subagents, hooks, autonomy levels, parallel work, MCP templates, evaluation).
- Installation: a **zero-dependency Node CLI** run with `npx`, working on Linux, macOS and Windows, alongside native plugin installation in each IDE.

## Requirements

| ID | Requirement |
|---|---|
| R1 | A study of existing agentic-coding approaches, architectures, methods, libraries, modules and tools, with sources and analysis. |
| R2 | A single method synthesized from the study, with each major design choice justified by it. |
| R3 | The method is designed for efficiency, clarity, intelligence, reliability, autonomy and simplicity of use. |
| R4 | Complete implementations of the method for Claude Code and for Cursor. |
| R5 | A full agent-facing instruction set that makes the IDE agent execute the method. |
| R6 | User-facing instructions explaining how to run agentic coding with the method. |
| R7 | The method accepts a request prompt plus optional supporting data (a GitHub repository, a local codebase, documents or other material). |
| R8 | Setup in each IDE is simple. |
| R9 | The kit provides the tools and templates an agent needs to apply the method. |
| R10 | A portable core plus an opt-in power layer with explicit autonomy levels. |
| R11 | A cross-platform Node CLI installer run with `npx`. |
| R12 | Production quality: tested, continuously integrated, internally coherent, free of known defects and placeholders. |

## Baseline: release 2.0.0 (commit `ca85a03c`)

Status key: ✗ not met, ◐ partially met, ✓ met.

| ID | Status | Evidence |
|---|---|---|
| R1 | ✗ | No research, sources or comparison exist in the repository. |
| R2 | ◐ | `AGENTS.md` defines an eight-step loop, but it is not derived from evidence and the README disclaims optimality. |
| R3 | ◐ | Safety and verification are addressed; autonomy and intelligence features (delegation, specialist roles, autonomy levels) are deliberately absent. |
| R4 | ◐ | Claude Code: `CLAUDE.md` import and one skill. Cursor: one command. No subagents, hooks, rules, settings or plugins for either IDE. |
| R5 | ◐ | Three short workflows (`implement`, `debug`, `review`) and two policies. No intake, specification, task-graph planning, roles, autonomy or context model. |
| R6 | ◐ | `docs/agentic-kit/USER_GUIDE.md` covers onboarding briefly; it does not explain how to write requests, attach supporting data, choose autonomy, or read results, and has no examples or troubleshooting. |
| R7 | ✗ | No step handles supporting data such as a repository URL or a local codebase. |
| R8 | ◐ | A POSIX `sh` installer only; no plugin installation; not usable natively on Windows. |
| R9 | ◐ | A check runner and a task-contract template exist; evaluation is a schema with no tooling. |
| R10 | ✗ | No layering and no autonomy levels. |
| R11 | ✗ | No Node CLI. |
| R12 | ◐ | Smoke-level CI only, and the defects below. |

### Defects found in 2.0.0

| ID | Location | Defect | Reproduction |
|---|---|---|---|
| D1 | `scripts/agent-check` | Checks run inside the loop that reads the manifest and inherit it as standard input. A check that reads standard input consumes the remaining manifest lines, so later checks silently never run while the runner reports success. | Manifest `quick\|reads-stdin\|cat >/dev/null` followed by `quick\|second\|echo SECOND-RAN`: `--quick` prints `Completed mode: quick` and the second check never runs. |
| D2 | `scripts/agent-check` | Validation is interleaved with execution: a malformed line is reported only after earlier checks have run, and `--full`/`--security` with no checks in those tiers fail only after running every quick check. | `--full` on the shipped manifest runs both quick checks, then fails with "Full checks are not configured". |
| D3 | `scripts/agent-check` | When a check fails, `set -e` terminates the runner without printing which check failed or a summary. | Any manifest command that exits non-zero. |
| D4 | `scripts/agent-check` | A manifest with Windows (CRLF) line endings passes a trailing carriage return into every command. | Save the manifest with CRLF endings. |
| D5 | `scripts/install-to-project.sh` | The installer copies itself into every target project, where it has no purpose, and does not reject a target located inside the kit. | Install into an empty directory: `scripts/install-to-project.sh` appears in the target. |
| D6 | `.github/workflows/kit-checks.yml` | Only the installer happy path and one conflict case are tested; fail-closed modes, malformed manifests and the runner's failure handling are untested. | Read the workflow. |
| D7 | `scripts/install-to-project.sh` | `umask 077` gives every installed file mode `600`, readable only by the installing user. | Install, then `stat -c %a AGENTS.md` prints `600`. |

### Baseline check results

Commands run on the 2.0.0 tree on 2026-10-14 (Node 24.21.0, Linux):

| Command | Result |
|---|---|
| `sh -n scripts/agent-check scripts/install-to-project.sh` | pass |
| `sh scripts/agent-check --list` | exit 0, two quick checks listed |
| `sh scripts/agent-check --quick` | exit 0 |
| `sh scripts/agent-check --full` | exit 2 after running the quick tier (fail-closed by design; see D2) |
| `sh scripts/agent-check --security` | exit 2 after running the quick tier (fail-closed by design; see D2) |
| Installer dry run, apply, conflict refusal (the CI steps) | pass; 17 files installed with mode 600 (D7) |

## Release 3.0.0

### Traceability

| ID | Status | Evidence |
|---|---|---|
| R1 | ✓ | [docs/research/](../research/README.md): benchmarks, architectures and context, methodologies, verification, a comparison matrix, Claude Code and Cursor mechanisms, security, evaluation and ranked practices, each with sources and an evidence grade, plus the five evidence notes they condense. |
| R2 | ✓ | [ALGORITHM.md](../method/ALGORITHM.md) specifies one method; [docs/research/06-synthesized-method.md](../research/06-synthesized-method.md) derives it, and [15 decision records](../method/adr/README.md) justify each major choice from the study, including the approaches rejected (ADR 0014). |
| R3 | ✓ | Efficiency: routing scales process with risk (ALGORITHM §5, ADR 0005), minimal always-on instructions and context hygiene (ADR 0004, 0009), cheap helper models (ADR 0010). Reliability: executed evidence, protected tests and the gate (ADR 0002, 0003). Autonomy: levels L0–L3 tied to verifiability and blast radius (ADR 0007). Clarity and simplicity: one writer, nine phases, a fixed report format (ALGORITHM §3, §6, §12). |
| R4 | ✓ | Claude Code and Cursor: skills, subagents, hooks for both IDEs' contracts, permission profiles, the always-on rules, and a plugin for each IDE, all generated from `src/content/` and `src/runtime/` (ADR 0011). Tests: `test/content.test.mjs` (formats, drift, every combination, Claude Code's validator), `test/hooks.test.mjs` (each hook against both contracts). |
| R5 | ✓ | `src/content/instructions/AGENTS.md` (the always-on rules), the `paacm` skill with one reference per phase and for autonomy, escalation, delegation, context, security, debugging, MCP and the runtime, its templates, the `paacm-verify` and `paacm-review` skills, and three subagents. |
| R6 | ✓ | [The user guide](../guide/README.md): setup on each path, running a request step by step, writing requests, supporting data, autonomy levels, reading reports and `BLOCKED:` stops, worked examples for both IDEs, troubleshooting and an FAQ, evaluation, and upgrading from 2.0.0. |
| R7 | ✓ | Phase 1 normalizes the target repository, reference repositories (GitHub URLs cloned shallowly into the task's `inputs/`, local paths read in place), documents, screenshots, logs and links, all as untrusted data (ALGORITHM §6 phase 1, ADR 0006, `references/01-intake-triage.md`). |
| R8 | ✓ | Two commands install the Claude Code plugin; one installs the Cursor plugin locally, or a team marketplace serves it; `init` installs into a project. `detect` proposes the checks and `doctor` verifies the result ([setup](../guide/setup.md)). |
| R9 | ✓ | The runtime (`paacm task`, `check`, `gate`, `audit`), templates for every task file, the hooks, `paacm detect`, `paacm doctor` and `paacm eval`. |
| R10 | ✓ | `--layer core` and `--layer power`, and `--autonomy L0`–`L3`, each level with its Claude Code permission and sandbox profile and its Cursor allowlist (`src/content/profiles/`). Tests: `test/content.test.mjs`, `test/install.test.mjs`. |
| R11 | ✓ | `npx github:Hyper-AI-Lab/hyper-agents` with `init`, `upgrade` (including `--from-v2`), `uninstall`, `doctor`, `detect`, `check` and `eval`; Node.js 20 or later, no dependencies (ADR 0015). CI runs it on Linux, macOS and Windows with Node.js 20, 22 and 24. |
| R12 | ✓ | 80 tests (`npm test`), CI in `.github/workflows/ci.yml` (tests, drift, fixture installs with `doctor`, Markdown lint, link and anchor checks, Claude Code's plugin validator), no known open defects, and no placeholders outside the fill-in templates. |

### The 2.0.0 defects

| ID | Fix | Test |
|---|---|---|
| D1 | Every check runs with standard input closed. | `test/checks.test.mjs`: a check that reads standard input gets end-of-file, and the next check still runs |
| D2 | The whole manifest is validated before anything runs, and a missing tier fails before any check runs (exit code 3). | `test/checks.test.mjs`, `test/runtime.test.mjs` |
| D3 | PASS or FAIL for each check with its exit code and timing, the failing output, and a summary line. | `test/checks.test.mjs` |
| D4 | CRLF line endings and a byte-order mark are accepted. | `test/checks.test.mjs` |
| D5 | The installer is not copied into projects, and a target inside the kit is refused. | `test/install.test.mjs` |
| D6 | CI covers the runner's failure handling, the installer's conflicts and every hook (see R12). | `.github/workflows/ci.yml` |
| D7 | Installed files get normal permissions (`644`, scripts `755`). | `test/install.test.mjs` |

### Verification on 2026-10-14

- `npm test`: 80 tests pass (Linux, Node.js 24.21.0). `node bin/paacm.mjs validate` and `build --check` pass. markdownlint-cli2 0.23.3 reports no issues.
- Fixture installs (empty, an existing `AGENTS.md`, a Node app, a Python app): `init --layer power`, `detect`, `doctor` (no problems), `check --tier quick` (passed), and `uninstall`, which restores the existing `AGENTS.md` exactly.
- `claude plugin validate` (Claude Code 2.1.285 and 2.1.292) accepts the plugin with `--strict` and the marketplace.
- Headless Claude Code 2.1.292 runs (`claude -p` in temporary projects):
  - **Plugin:** the session lists `/paacm:paacm`, `/paacm:paacm-verify` and `/paacm:paacm-review` and the three subagents, with no plugin errors, and the session-start hook succeeds.
  - **Project install:** the session lists the `paacm` skills and the three subagents.
  - **Shell guard:** with Bash allowed, the guard blocked `cp .claude/settings.json …` (rule `rewrite-agent-config`) and no file was written.
  - **Protect hook:** with Edit allowed, an edit to an approved test was denied and the file stayed unchanged.
  - **Stop gate:** with a failing check, the agent's finish was refused with the gate output; it then stopped with a `BLOCKED:` report.
- Three defects found during this verification were fixed before release. In a plugin install, approved tests and executable configuration were unprotected without `.agent/paacm.json`. The plugin's core rules named project-install paths. The stop hook attributed pre-existing uncommitted files to the agent.

### Limits

- **Cursor** was not run live: no Cursor CLI was available. The Cursor side is verified against the documented formats (`paacm validate`), and the hooks against Cursor's contract with recorded payloads (`test/hooks.test.mjs`).
- **macOS and Windows** were verified only through the CI matrix, not on a local machine.
- **Effectiveness:** PAACM's effect on a team's own code is not measured by this release. `paacm eval` and the [evaluation guide](../guide/evaluation.md) let each team measure it, and ALGORITHM §14 sets how the method evolves from those results.

## Release 3.1.0

Release 3.1.0 adds project extensions (R4, R5, R9). A repository extends any phase in `.agent/extensions/<reference>.md` without forking the kit ([ALGORITHM.md section 15](../method/ALGORITHM.md#15-project-extensions), [ADR 0016](../method/adr/0016-project-extensions.md), [guide](../guide/extending.md)).

Evidence (`npm test`, 86 tests):

- `test/content.test.mjs`: every reference ends with its extension line.
- `test/hooks.test.mjs`: the session-start listing for both IDEs and protection of extensions.
- `test/runtime.test.mjs`: the reviewer checklist in `review-input.md`.
- `test/tools.test.mjs`: `doctor`'s warnings.
- `test/install.test.mjs`: install, upgrade from 3.0 and uninstall leave extensions intact.

## Release 3.2.0

Release 3.2.0 acts on an efficiency review of 3.1.0 (R1, R3, R4, R9). It sets reasoning effort by role, as [ADR 0010](../method/adr/0010-model-allocation.md) prescribes; adds code intelligence for the read-only subagents and a `doctor` check for missing language servers ([ADR 0017](../method/adr/0017-code-intelligence.md)); strengthens the frozen tests with property-based tests and an optional mutation check ([ADR 0018](../method/adr/0018-test-strength.md)); and records the new evidence as a dated addendum to the study ([research](../research/README.md)).

Evidence (`npm test`, 88 tests):

- `test/tools.test.mjs`: `doctor` finds the official code-intelligence plugins a project enables and reports whether each language server is installed.
- `node bin/paacm.mjs validate`: the subagents' new `effort` fields are supported subagent fields; `build --check`: the plugin copies for both IDEs match the source.
- `test/docs.test.mjs`: every new link and anchor resolves.
