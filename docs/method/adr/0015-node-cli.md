# 0015. A zero-dependency Node command-line tool replaces the shell scripts

- **Status:** accepted
- **Date:** 2026-10-14

## Context

Release 2.0.0 shipped POSIX shell scripts that do not run natively on Windows and had defects D1–D7 ([requirements](../../project/requirements.md)). Teams need installation, upgrade, removal, health checks and evaluation, not only a copy step.

## Decision

`paacm` is a single Node package with no runtime dependencies, run with `npx github:Hyper-AI-Lab/hyper-agents`. It provides `init`, `upgrade`, `uninstall`, `doctor`, `detect`, `check`, `eval` and `build`. It merges into existing instruction files through marked blocks, never overwrites user content, records installed files and hashes in a lock file, and runs the check manifest with preflight validation, isolated standard input and per-check results. Hook scripts are Node too, so they run identically on Linux, macOS and Windows.

## Evidence

- The project owner chose a Node CLI run with `npx` (2026-10-14, [requirements](../../project/requirements.md)).
- One Node implementation runs unchanged on Linux, macOS and Windows, which removes the need for parallel shell and PowerShell versions of every script and hook. Both IDEs run hook commands as ordinary processes, so `node` scripts work in either ([IDE reference](../../research/07-claude-code-and-cursor.md)).

## Consequences

Node 20 or later is required to install and to run hooks. The v2 check manifest format is kept, so existing manifests keep working.

## Alternatives considered

Keeping POSIX shell plus a PowerShell copy (rejected: two implementations to keep consistent); a Python tool (rejected by the project owner).
