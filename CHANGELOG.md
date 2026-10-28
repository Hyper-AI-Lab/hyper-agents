# Changelog

## 3.5.0 — Finishing, worktrees and shared machines

Running 3.4.1 on a team project (several people on one server, linked worktrees, headless agent runs) showed where the runtime enforced less than the method asks. Each fix is covered by tests that failed before it ([ADR 0021](docs/method/adr/0021-finishing-worktrees-and-shared-machines.md)).

- **A task finishes through the runtime.** `paacm task done` now also requires the route's last phase (review for STANDARD and DEEP, verify for FAST), approved tests, a passing gate at the route's tier, and a `REPORT.md` that begins with `OUTCOME: done`. The stop gate nudges once, never twice in a row, when an open task's gate is green and when a STANDARD or DEEP task changes files while still triaged; in Claude Code its nudges are guidance (`additionalContext`), not hook errors; a gate below the route's tier no longer counts. Before, agents stopped with tasks still triaged and without a report.
- **The runtime says what to read next.** `task start`, `task phase` and a passing `gate` name the reference (and the project extension) for the next step.
- **Worktrees.** The hooks follow the agent into a worktree of the same repository (Claude Code keeps `CLAUDE_PROJECT_DIR` at the original root), and the protect hook judges every edit by the worktree the file is in, with that worktree's configuration and task. Before, an edit in a sibling worktree was not checked, and every edit in a worktree under `.claude/worktrees/` needed approval as agent configuration. The runtime never climbs out of a worktree into the checkout that contains it, and finds the task from inside a submodule.
- **Shared machines.** Session baselines live in the worktree's git directory, readable only by their owner, instead of a shared temporary folder where a second account's session start failed and lost its whole context. A baseline that cannot be written is a warning.
- **Frozen tests stay frozen.** `approve-tests` refuses to take a new baseline over a test, `.agent/checks.conf` or `.agent/paacm.json` changed since the approval, even when the change was committed; that needs `reopen-tests`, which the human confirms. Approving moves the task from testing to implementing.
- **Review input.** New untracked files are reviewed with their content; diffs of generated files (`linguist-generated`) and very large diffs go to `review-diffs/`; the fence cannot be closed by the diff; a diff too large for git's buffer is an error, never an empty review. The evidence names the gate log, the configuration warnings and the files the writer saved for the reviewer, who has no shell. A level-2 heading inside a code block no longer ends the reviewer checklist.
- **Gate output.** `paacm gate --quiet` and `paacm check --quiet` print only the check lines and a failing check's last lines; the gate saves its full output as `gate.log` in the task folder. A check that cannot find a command (exit 127, 9009 on Windows) is reported as a missing tool, not as failing code.
- **Audit.** Configuration warnings say whether the task changed the file or a merge of a branch already on a remote, such as the base branch, brought the change in (`WARN` or `NOTE`, `origin` in JSON); a branch made and merged locally counts as the task's own. Violations stay strict for both.
- **Shell guard and protected paths.** The guard asks before skipping git hooks (`--no-verify`, `git commit -n`, `core.hooksPath`, `HUSKY=0`, `SKIP=`, `LEFTHOOK=0`) and catches deploys with global options (`terraform -chdir=… apply`, `kubectl --context … apply`). `.github/actions/**`, `.husky/**`, `.pre-commit-config.yaml` and the lefthook files are protected configuration by default.
- **Work items.** `paacm task start --ref <work item>` links a task to an issue number, a tracker key, `owner/repo#N` or a URL, shown in the status, the session context, the review input and the report.
- **doctor** warns about a check whose program is not installed, and about a review extension without a `## Reviewer checklist`.
- **Instructions.** The always-on rules cover every change to the repository's files, documentation included, and add a rule to follow the phases to the end and run each runtime command on its own; no reference recommends a compound command any more. Tests-first runs the fixers on the tests and updates the lists a change makes wrong before approval. The setup guide explains running the checks in CI and what stays per person on a shared machine.

**Upgrading.** `paacm upgrade` updates an untouched `.agent/paacm.json`. If yours lists `protect.config` explicitly, add `".github/actions/**"`, `".husky/**"`, `".pre-commit-config.yaml"`, `"lefthook.yml"`, `"lefthook.yaml"`, `".lefthook.yml"` and `"lefthook-local.yml"` yourself if they apply. A task started with 3.4.1 can be finished with 3.5.0; `paacm task done` now asks for its last phase, approved tests and a report. Rules your project added to work around the 3.4.1 behaviour (for example "run every file change through PAACM", "run the gate without pipes" or "a task ends with REPORT.md and `task done`") are now part of the kit and can be removed.

## 3.4.1 — Hardening from an audit

An audit of 3.4.0 found ways around the gates. Each is fixed and covered by a test in `test/hardening.test.mjs`.

- **The gate's own configuration is frozen with the tests.** Changing `.agent/checks.conf` or `.agent/paacm.json` after `paacm task approve-tests` is now a violation (exit 4), not a warning. Before, a shell edit could remove a failing check, or empty the protected test patterns, and the gate still passed. A change the human approved is followed by a new `paacm task approve-tests`.
- **Task state is written only by the runtime.** The protect hook refuses edits to `.agent/tasks/<task>/state.json` and `.agent/tasks/CURRENT`, and the shell guard refuses shell writes to them, to the check manifest, `.agent/paacm.json` and project extensions. Before, deleting `testsApprovedAt` from `state.json` turned test protection off.
- **The protect hook fails closed when it cannot find the edited file.** Before, a tool call without a recognised path field was allowed. In Cursor, whose `preToolUse` input fields are undocumented, an edit with an unrecognised payload is now refused with a message saying so.
- **Paths are judged by their real location.** The protect hook resolves symbolic links, matches case-insensitively on macOS and Windows, and no longer treats a file whose name starts with `..` as outside the project.
- **Hiding changes from git needs approval.** The shell guard asks before `git update-index --assume-unchanged` or `--skip-worktree`, which would hide an edit from the audit.
- **Evaluation:** `eval` refuses a task set whose hidden-tests path contains a space while an acceptance command uses `{{HIDDEN}}` without quotes.

Headless Claude Code runs on a fixture project found four more:

- **A test change the human approved can now be made.** The method allowed it, but the protect hook refused every edit to approved tests and nothing could lift that, so the task stuck until the human edited the file. `paacm task reopen-tests --reason "<the approved change>"` clears the baseline; the shell guard asks the human to confirm it, and `approve-tests` sets a new one.
- **Approvals are not blocks.** The agent ended an ordinary request for test approval with a `BLOCKED:` line. The always-on rules and `escalation.md` now say that the approvals the phases ask for are ordinary questions.
- **`gate` and `check` print their exit code** as a last line, `paacm gate: exit 0`, so the report can quote it without a compound command, which the IDE's allow rule refuses.
- **Headless runs need a trusted folder.** In `claude -p`, Claude Code ignores a project's `permissions.allow` rules in a folder that was never trusted, so every PAACM runtime command was refused. The evaluation guide, the unattended (L3) example and `autonomy.md` now say how to trust the folder or pass the rules with `--allowedTools`. `runtime.md` asks for one runtime command per call.

## 3.4.0 — Questions in rounds and loop-first debugging

- **Questions in rounds.** Intake and specification ask every open question that does not depend on another open answer in one numbered round, each with a recommended answer worded so that "yes" accepts it, instead of one question per turn. The agent finds facts itself and asks only for decisions. The specification phase checks the request's terms against the project's glossary.
- **Questionnaires.** When a decision belongs to someone outside the conversation, the agent offers to draft a questionnaire for them in the task folder.
- **Loop-first debugging.** Debugging builds one fast, deterministic command that fails on the reported symptom, shrinks the reproduction, ranks three to five falsifiable hypotheses before testing any, and tags temporary log lines so that one search removes them.
- **Tests and extensions.** Tests compute expected values independently of the code under test. The extension guide gives five rules for writing agent instructions.
- These practices come from Matt Pocock's skills (MIT), rewritten in the method's own terms ([ADR 0020](docs/method/adr/0020-question-rounds-questionnaires-and-loop-first-debugging.md)). The research addendum also records why ECC and the official `ralph-loop` plugin are not adopted.

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
