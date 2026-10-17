# 0019. An error-handling reviewer and optional companion plugins

- **Status:** accepted
- **Date:** 2026-10-17

## Context

The reviewer's scope (correctness, requirements, scope) covers a bug that the tests reveal, but an error that the code swallows produces no failing test and no wrong output until production. Anthropic's official plugin marketplace has reviewers and security tools that the study of 14 October did not assess.

## Decision

- The kit ships `paacm-silent-failure-hunter`, adapted from Anthropic's `silent-failure-hunter` (Apache License 2.0): read-only, fed the same `review-input.md` as the reviewer, run in phase 8 when the diff changes error handling, and limited to failures the changed code can actually hide.
- High-stakes verification runs the `claude-security` plugin's scan of the changes when the plugin is installed. The kit does not ship it.
- The setup guide describes `security-guidance` as an optional companion, with its costs. The kit neither ships nor enables it.

## Evidence

- The reviewer agents in `pr-review-toolkit`, including `silent-failure-hunter`, are licensed under Apache License 2.0, the kit's own licence; the original prompt names one company's internal logging functions and asks for every instance "no matter how minor", so it is adapted rather than copied ([pr-review-toolkit](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/pr-review-toolkit)) [V].
- `claude-security` verifies each finding with independent agents before reporting it, and writes a report and a SARIF log; it is proprietary ("All rights reserved") and adds small Bash hooks for metrics and tips ([claude-security](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/claude-security)) [V].
- `security-guidance` adds pattern warnings on edits, an LLM review of the diff when a turn ends and an agentic review on each commit. Its session-start hook installs the Claude Agent SDK into a virtual environment under `~/.claude/security/` from the package index when the SDK is missing, whatever review switches are set, and its reviews send the diff to the model endpoint ([security-guidance](https://github.com/anthropics/claude-plugins-official/tree/main/plugins/security-guidance)) [V].

## Consequences

Swallowed errors become review findings. High-stakes changes get an independent security scan where the plugin is available. Teams that want `security-guidance` know what it installs and duplicates: a project's linters often cover its pattern layer (for example Ruff's `S` rules and Biome's security rules), and its turn-end review runs beside PAACM's stop gate.

## Alternatives considered

Shipping the whole `pr-review-toolkit` (rejected: its test, comment and simplification agents overlap the reviewer and the phase rules), enabling `security-guidance` by default (rejected: a runtime install and a second review on every turn), and vendoring `claude-security` (not permitted by its licence).
