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
