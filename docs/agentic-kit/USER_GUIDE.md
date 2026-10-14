# PAACM 2.0 — Team user guide

## Purpose and limits

PAACM is a repository-local operating method for Claude Code and Cursor, not an autonomous security boundary. Its objective is accepted, regression-free coding outcomes with predictable cost and clear handoff. It has not been proven universally superior to simpler coding workflows.

## Onboard a repository

1. Review the kit source, license, and current repository policies.
2. In a **new** project, copy the PAACM configuration files or start from a reviewed template.
3. In an **existing** project, use **sh scripts/install-to-project.sh TARGET --dry-run**, then **--apply** only if there are no conflicts. If conflicts exist, merge instructions manually using INSTALL_PROMPT.md; never blindly overwrite AGENTS.md or CLAUDE.md.
4. Configure .agent/checks.conf with actual project commands. Quick should include relevant lint/typecheck/focused tests; full should include build/integration/regression checks; security should be specific to the risk and toolchain.
5. Review each manifest command before executing it. The runner uses a shell; it does not sandbox commands.
6. Confirm Claude Code import/skill and Cursor command support on the versions your team uses. Fall back to ordinary agent chat reading AGENTS.md if an adapter is unsupported.
7. Pilot on representative low-risk tasks before enabling DEEP mode for sensitive work.

## Day-to-day use

Describe the task, acceptance criteria, and constraints. The agent should select FAST, STANDARD, or DEEP; localize code before editing; preserve existing work; and report actual verification. Use **/paacm** in Claude Code when the skill is loaded. Cursor command availability varies by version.

A task is not complete merely because tests pass. Inspect the diff for semantic correctness and behavior not covered by tests.

## Verification commands

~~~sh
sh scripts/agent-check --list
sh scripts/agent-check --quick
sh scripts/agent-check --full
sh scripts/agent-check --security
~~~

Full and security modes intentionally fail until their check tiers are configured. In security mode, quick, full, and security checks all run. Do not interpret a generic shell syntax check as project validation.

## Approvals and autonomy

Read-only inspection is generally safe within granted access. Reversible local edits are permitted within the user's requested scope. Require explicit approval for publishing, deployment, consequential deletion, credential or permission changes, spending, or production migrations. Markdown instructions cannot enforce these limits; use IDE permissions and actual access controls.

## Long tasks and parallelism

Use one patch owner. Parallelize only separable read-only discovery or independent review when it saves time. For long tasks, checkpoint a brief, non-secret progress record in .agent/state/ and resume from observable repository state.

## Team maintenance

Maintain this kit as a versioned source of truth. Review changes through pull requests, document compatibility changes in CHANGELOG.md, and tag releases. Consuming repositories do not receive automatic updates: upgrade them deliberately, reviewing policy conflicts and changed scripts.

## Measure rather than assume

Use .agent/evals/task-schema.md to compare a baseline workflow with PAACM on the same repository-specific task set. Measure accepted regression-free completion, time/cost per accepted task, human interventions, safety incidents, and recovery. Evaluate optional reviewer, subagent, or MCP features independently.