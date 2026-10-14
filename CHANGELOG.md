# Changelog

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
