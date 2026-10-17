# Claude Code and Cursor expose the same seven levers under different contracts

Every detail in this section comes from the official documentation as served on 14 October 2026. For Claude Code that is code.claude.com/docs, whose newest changelog entry is **v2.1.299 (14 October 2026)** ([changelog](https://code.claude.com/docs/en/changelog)). For Cursor it is cursor.com/docs, whose release timeline tops out at editor **3.24** ([release notes](https://cursor.com/docs/release-notes.md)). Both tools move quickly, so each version annotation below is the vendor's own. All of this section is [V] by construction. Where this study goes beyond the documentation, the text says so.

## One repository layout serves both tools

Cursor deliberately reads Claude Code's files. It loads skills from `.claude/skills/`, subagents from `.claude/agents/` and instructions from `CLAUDE.md`, and it can import hooks from `.claude/settings*.json` ([Cursor skills](https://cursor.com/docs/skills.md); [Cursor subagents](https://cursor.com/docs/subagents.md); [Cursor third-party hooks](https://cursor.com/docs/reference/third-party-hooks.md)). Claude Code reads none of Cursor's files. The simplest dual-tool kit therefore keeps shared assets in Claude's locations and adds Cursor-only files where the formats diverge:

```text
repo/
├── AGENTS.md                      # portable always-on instructions (Cursor native; Claude Code via import)
├── CLAUDE.md                      # first line "@AGENTS.md", then Claude-only lines; Cursor also always-applies it
├── .mcp.json                      # Claude Code MCP servers (${VAR} interpolation)
├── .worktreeinclude               # gitignored files copied into Claude Code worktrees
├── .agent/                        # method state, not tool config: SPEC.md, PLAN.md, progress.md, features.json, init.sh, check.sh
├── .claude/
│   ├── settings.json              # permissions (deny/ask/allow), sandbox, hooks
│   ├── rules/*.md                 # path-scoped rules, frontmatter `paths:` (Claude Code only)
│   ├── skills/<name>/SKILL.md     # Agent Skills, read by both tools
│   ├── agents/*.md                # subagents, read by both tools
│   └── hooks/*.sh                 # hook scripts shared by both tools
└── .cursor/
    ├── hooks.json                 # Cursor-native hooks pointing at .claude/hooks/*.sh
    ├── rules/*.mdc                # path-scoped rules, frontmatter `globs`/`alwaysApply` (Cursor only)
    ├── agents/*.md                # optional Cursor overrides; win over .claude/agents on a name clash
    ├── permissions.json           # terminal and MCP allowlists (IDE)
    ├── cli.json                   # CLI permissions (project level holds permissions only)
    ├── sandbox.json               # sandbox filesystem/network policy
    ├── mcp.json                   # Cursor MCP servers (${env:NAME} interpolation)
    └── worktrees.json             # worktree setup commands
```

Method state lives outside `.claude/` and `.cursor/` for two reasons. Claude Code never auto-approves writes to `.claude`, and Cursor's sandbox write-protects `.cursor/**/*.json` and `.claude/**/*.json` ([Claude Code permission modes](https://code.claude.com/docs/en/permission-modes#protected-paths); [Cursor sandbox.json](https://cursor.com/docs/reference/sandbox.md)). Both protections are good for configuration but would block the agent from updating its own progress files.

## Instruction files: Claude Code skips AGENTS.md beside a CLAUDE.md

| Aspect | Claude Code | Cursor |
|---|---|---|
| Project file | `./CLAUDE.md` or `./.claude/CLAUDE.md`, plus personal `./CLAUDE.local.md`. Loaded from the cwd and every ancestor at launch, concatenated root → cwd, not overridden. Subdirectory files load on demand when Claude touches files there | `AGENTS.md` at the root and in subdirectories; nested files combine with parents, and more specific instructions win. `CLAUDE.md` at the root is read "the same way" and **always applied**. Project rules live in `.cursor/rules/**/*.mdc` |
| AGENTS.md | Native since **v2.1.277 (18 Sep 2026)**. The default setting `claude-md-or-agents-md` reads AGENTS.md **only if no CLAUDE.md, .claude/CLAUDE.md or CLAUDE.local.md exists** on the path. Other values (`claude-md-and-agents-md`, `claude-md`, `managed-only`) can be set only via `pluginConfigs` in user settings, `--settings` or managed settings; they are ignored in project and local settings. The recommended portable pattern is a CLAUDE.md that imports `@AGENTS.md` | Native |
| Path-scoped rules | `.claude/rules/**/*.md`. The only frontmatter field read is `paths` (glob list); a rule loads when Claude reads or edits a matching file. Since **v2.0.64 (10 Dec 2025)** | `.mdc` only (plain `.md` in `.cursor/rules` is ignored). Fields `description`, `globs` and `alwaysApply`: `alwaysApply: true` means always; `globs` means auto-attach; `description` alone means the agent decides; none means manual `@rule` |
| Imports | `@path` anywhere, relative to the importing file, at most 4 hops. Imports load at launch and save no context | `@file` mentions in rules are **not inlined**; the agent reads the file when needed |
| User and organization | `~/.claude/CLAUDE.md` and `~/.claude/rules/`. Managed file at `/etc/claude-code/CLAUDE.md` (Linux) or via the `claudeMd` key in managed settings | User Rules (account-synced) and `~/.cursor/rules` (machine-local). Team Rules (dashboard, enforceable). Precedence: **Team → Project → User** |
| Size guidance | "target under 200 lines per CLAUDE.md file"; a file larger than 4 MiB is skipped | "Keep rules under 500 lines" |
| Delivery | As a user message after the system prompt, so advisory; the project-root file is re-injected after `/compact` | "Included at the start of the model context"; rules do not apply to Tab, Inline Edit or Bugbot |
| Audit tools | `/context`, `/memory`, `/doctor prompt-audit` (v2.1.283+), `InstructionsLoaded` hook | Context breakdown in the UI |
| Legacy | `.claude/commands/*.md` still works and was merged into skills in v2.1.3 | `.cursorrules` "is legacy and will be deprecated" |

Sources: [Claude Code memory](https://code.claude.com/docs/en/memory), [Cursor rules](https://cursor.com/docs/rules.md), [Cursor rules help](https://cursor.com/help/customization/rules.md).

Cursor always applies `CLAUDE.md`, so any Claude-only lines in it also reach Cursor. Keep them tool-neutral or put them in `.claude/rules/`. Whether Cursor expands `@AGENTS.md` inside CLAUDE.md is not documented. It does not matter for content, because Cursor loads AGENTS.md natively anyway.

## Skills: one SKILL.md under .claude/skills serves both tools

Both tools implement the open Agent Skills standard ([agentskills.io](https://agentskills.io/specification)): a folder `<name>/SKILL.md` with YAML frontmatter, plus optional `scripts/`, `references/` and `assets/`. Only the descriptions load at startup; the body loads on invocation or when the agent judges the skill relevant.

| Field | Claude Code | Cursor | Open spec |
|---|---|---|---|
| `name` | Optional; defaults to the directory name | **Required**; lowercase, digits, hyphens; must match the folder | Required, 1–64 chars, must match the parent directory |
| `description` | Recommended; with `when_to_use`, truncated at 1,536 chars in the listing | **Required** | Required, 1–1,024 chars |
| `paths` | Globs limiting auto-activation | Globs (legacy `globs` accepted) | — |
| `disable-model-invocation` | `true` = user-only, and the description is kept out of context | `true` = only via `/skill-name` | — |
| `user-invocable` | `false` hides it from the `/` menu | `false` (CLI changelog) | — |
| `allowed-tools` | Pre-approves tools **only for the invoking turn** | Not documented | Experimental |
| `context: fork`, `agent`, `background`, `model`, `effort`, `hooks`, `argument-hint`, `arguments`, `shell` | Supported | Not documented | — |
| `icon`, `color` | Ignored (unknown fields are silently ignored) | Custom Mode badge | — |
| `license`, `compatibility`, `metadata` | Accepted, not acted on | `metadata` documented | Optional |
| Discovery | `~/.claude/skills/`, `.claude/skills/` (cwd up to the repo root, plus nested dirs on demand), plugin `skills/`, managed dir. **Does not document** `.agents/skills/` | `.agents/skills/`, `.cursor/skills/`, `~/.agents/skills/`, `~/.cursor/skills/`, plus compatibility dirs `.claude/skills/`, `.codex/skills/`, `~/.claude/skills/`, `~/.codex/skills/` | Recommends `.<client>/skills/` and `.agents/skills/` |
| Introduced | v2.0.20 (16 Oct 2025); `context: fork` v2.1.0 (7 Jan 2026) | 2.4 (22 Jan 2026) | — |

Sources: [Claude Code skills](https://code.claude.com/docs/en/skills), [Cursor skills](https://cursor.com/docs/skills.md), [spec](https://agentskills.io/specification).

**The shared location is `.claude/skills/<name>/`, with `name` equal to the folder name.** Claude Code-specific fields are safe in Cursor only by assumption: Cursor does not document ignoring unknown keys. The SKILL.md bodies should stay under 500 lines; the spec recommends under 5,000 tokens. Claude Code limits the skill listing to 1% of the context window, and after auto-compaction it re-attaches the first 5,000 tokens of each invoked skill, up to 25,000 tokens combined.

One trap matters for public kits. claude.ai uploads, the Skills API and `package_skill.py` accept only `name`, `description`, `license`, `compatibility`, `metadata` and `allowed-tools`. They **fail with a hard error** on any other key, such as `argument-hint` ([Claude Code skills](https://code.claude.com/docs/en/skills#using-skill-frontmatter-outside-claude-code)). In Claude Code, `` !`cmd` `` lines inject shell output before the model sees the skill. Any non-zero exit aborts the invocation (except exit 1 from search or compare commands), so append `|| true` where failure is acceptable.

A minimal skill that is valid in both tools and in the open spec:

```markdown
---
name: verify-change
description: Runs the verification ladder (format, lint, types, full tests) and writes an evidence report. Use before declaring any coding task done, or when asked to verify or prove a change works.
---
# Verify a change
Run `.agent/check.sh` from the repository root. Report the exact command, its exit code and the last 30 lines of output.
For each acceptance criterion in `.agent/SPEC.md`, mark it passed, failed or untested, quoting the evidence line.
Never edit tests, CI configuration or hook scripts to make a check pass. If the spec and the tests conflict, stop and report `BLOCKED:` with the conflicting lines.
```

## Subagents: Cursor reads Claude's files but not its tool limits

| Aspect | Claude Code | Cursor |
|---|---|---|
| Files | `.claude/agents/*.md` (cwd up to the repo root, recursive), `~/.claude/agents/`, plugin `agents/`, managed dir, `--agents` JSON. Priority: managed > CLI > project > user > plugin | `.cursor/agents/`, `~/.cursor/agents/`, plus compatibility `.claude/agents/`, `.codex/agents/`, `~/.claude/agents/`, `~/.codex/agents/`. **`.cursor/` wins over `.claude/`** on a name clash, and project wins over user |
| Required fields | `name` (≤ 256 chars, no `:`) and `description`. A file missing either is **silently skipped** | None; `name` defaults to the filename |
| Tool restriction | `tools` (allowlist), `disallowedTools` (applied first), `Agent(type, …)` for spawning | **No `tools` field**; subagents inherit all parent tools, including MCP. `readonly: true` blocks edits and state-changing shell |
| Model | `sonnet`, `opus`, `haiku`, `fable`, a full ID such as `claude-opus-5-5`, or `inherit`. Resolution: invocation parameter > frontmatter > `CLAUDE_CODE_SUBAGENT_MODEL` > main model | `inherit` (default) or a model ID with parameters, e.g. `claude-opus-5[effort=high,context=300k]`. On legacy request plans without Max Mode, subagents run on Composer |
| Other fields | `permissionMode`, `maxTurns`, `skills` (preloaded), `mcpServers`, `hooks` (`Stop` becomes `SubagentStop`), `memory` (`user`/`project`/`local`), `background`, `omitClaudeMd` (v2.1.271+), `effort`, `isolation: worktree`, `color`, `initialPrompt` | `is_background` |
| Starting context | Fresh: the body is the **entire system prompt**, plus the delegation message, the CLAUDE.md hierarchy and git status (Explore and Plan skip both) | Clean; the parent must pass what is needed |
| Built-ins | `Explore` (read-only; **main model by default**), `Plan`, `general-purpose`, others | `explore` ("uses a faster model"), `browser` |
| Limits | Nesting depth 3; 20 concurrent; fork mode on by default in interactive sessions (v2.1.232+) | Main agent and its direct subagents may spawn; one nested level since 2.5 |
| Isolation | `isolation: worktree` creates a temporary worktree, removed if unchanged | On request: an isolated worktree or a cloud VM per subagent |
| Plugin caveat | Plugin subagents **ignore** `hooks`, `mcpServers` and `permissionMode` | Plugin agents document only `name` and `description` |

Sources: [Claude Code subagents](https://code.claude.com/docs/en/sub-agents), [Cursor subagents](https://cursor.com/docs/subagents.md).

A reviewer that works in both tools can declare both tools' restriction fields. Claude Code ignores unknown fields such as `readonly`, while Cursor reads `readonly` and does not document `tools`.

```markdown
---
name: diff-reviewer
description: Fresh-context reviewer. Use proactively after implementation and before reporting a task done. Reviews only the diff, the spec and the check output it is given.
model: inherit
tools: Read, Grep, Glob
readonly: true
---
You review a change you did not write. Your inputs are in .agent/review-input.md: the diff, the acceptance criteria and the latest check output.
Report only correctness bugs, unmet acceptance criteria, and changes outside the spec's scope, each with file:line and evidence.
Do not suggest style changes, new abstractions, or tests for cases that cannot happen. If nothing qualifies, reply "No blocking findings."
```

The cheap explorer is the one place where the two tools need different files. `.claude/agents/explorer.md` sets `model: haiku`, `tools: Read, Grep, Glob`. To change the built-in instead, define an agent named `Explore` with `model: haiku`. A same-named `.cursor/agents/explorer.md` sets `readonly: true` and either `model: inherit` or a Cursor model ID, and it overrides the Claude file inside Cursor. The model IDs differ between tools, so `inherit` is the only portable value.

## Hooks: the gates live here, and both tools fail open by default

Instructions are advisory in both tools. Cursor's enterprise documentation says "rules are suggestions, not guarantees", and Claude Code's says hooks "guarantee the action happens" ([Cursor LLM safety](https://cursor.com/docs/enterprise/llm-safety-and-controls.md); [Claude Code best practices](https://code.claude.com/docs/en/best-practices)). The method therefore puts its gates in hooks. The two contracts differ in ways that matter for enforcement:

| Aspect | Claude Code | Cursor |
|---|---|---|
| Where | `hooks` key in `~/.claude/settings.json`, `.claude/settings.json`, `.claude/settings.local.json` or managed settings; a plugin's `hooks/hooks.json`; skill or subagent frontmatter | `.cursor/hooks.json` (project, trusted workspaces only), `~/.cursor/hooks.json`, Team (dashboard, Enterprise), Enterprise MDM files (`/etc/cursor/hooks.json` and others); Claude Code settings hooks via Third-Party Imports |
| Shape | `{"hooks": {"<Event>": [{"matcher": "…", "hooks": [{"type": "command", "command": "…"}]}]}}` | `{"version": 1, "hooks": {"<event>": [{"command": "…", "matcher": "…"}]}}` |
| Handler types | `command`, `http`, `mcp_tool`, `prompt`, `agent` (experimental) | `command`, `prompt` |
| Handler options | `if` (a permission rule), `timeout` (seconds; default 600 for command), `args` (exec form), `async`, `asyncRewake`, `shell`, `onFailure` (`continue` \| `block`, **v2.1.295+**), `once` (skills only) | `timeout` (seconds), `loop_limit` (default 5; `null` for Claude Code hooks), `failClosed` (default `false`), `matcher` (regex) |
| Exit 0 | Success. Stdout is parsed only if it is exactly one JSON object. Plain stdout becomes context only for `UserPromptSubmit`, `UserPromptExpansion`, `SessionStart` and `PostModelSwitch` | Success, use the JSON. **For permission hooks** (`preToolUse`, `beforeShellExecution`, `beforeMCPExecution`, `beforeReadFile`, `beforeTabFileRead`, `subagentStart`), invalid or non-schema JSON **blocks** |
| Exit 2 | Blocking error on events that can block; stderr becomes the reason | Block, equivalent to `permission: "deny"` |
| Other exit codes | **Non-blocking: the action proceeds**, unless `onFailure: "block"` | **Fail-open**, unless `failClosed: true`, in which case a crash, timeout, non-zero exit or empty output blocks |
| Timeout | A timed-out `PreToolUse` does **not** block unless `onFailure: "block"` | Blocks only with `failClosed: true` |
| Multiple hooks | All matching hooks run in parallel and merge across levels; `deny` > `defer` > `ask` > `allow` | All sources run; `deny` > `ask` > `allow`; message fields concatenate; for `followup_message` the last response wins |
| Environment | `CLAUDE_PROJECT_DIR`, `CLAUDE_PLUGIN_ROOT`, `CLAUDE_PLUGIN_DATA`, `CLAUDE_EFFORT`; no TTY | `CURSOR_PROJECT_DIR`, `CURSOR_VERSION`, `CURSOR_USER_EMAIL`, `CURSOR_TRANSCRIPT_PATH`, `CURSOR_CODE_REMOTE`, and `CLAUDE_PROJECT_DIR` as an alias |
| Trust | Interactive sessions hold hooks until the workspace trust dialog is accepted; `-p` treats the folder as trusted and **runs repository hooks** | Project hooks run in trusted workspaces; Cloud Agents run command hooks only |

Sources: [Claude Code hooks reference](https://code.claude.com/docs/en/hooks), [Cursor hooks](https://cursor.com/docs/hooks.md).

The method needs six hook points:

| Method role | Claude Code event (output) | Cursor event (output) |
|---|---|---|
| Inject branch, status and progress at session start | `SessionStart`, matcher `startup\|resume\|clear\|compact`. Plain stdout or `hookSpecificOutput.additionalContext`; `CLAUDE_ENV_FILE` can persist env vars | `sessionStart` (fire-and-forget). `additional_context`, `env` |
| Block edits to tests, CI and agent config | `PreToolUse`, matcher `Edit\|Write`. Exit 2, or `hookSpecificOutput.permissionDecision: "deny"` with `permissionDecisionReason` | `preToolUse`, matcher `Write\|Delete`. Exit 2, or `permission: "deny"`. **`ask` is not enforced** for `preToolUse` |
| Gate dangerous shell commands | `PreToolUse`, matcher `Bash` with `if: "Bash(rm *)"`-style filters | `beforeShellExecution` (`allow`/`deny`/`ask`), matched on the full command string |
| Lint, format and type-check after each edit | `PostToolUse`, matcher `Edit\|Write`. Exit 2 shows stderr to Claude; or `decision: "block"` + `reason`; or `additionalContext` | `postToolUse`, matcher `Write`, returning `additional_context`; `afterFileEdit` for formatters that need no feedback |
| Refuse "done" until checks pass | `Stop` (no matcher). `{"decision": "block", "reason": "…"}` keeps Claude working; check `stop_hook_active`; **cap of 8 consecutive continuations** (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`), reset when Claude calls a tool | `stop` (input `status`, `loop_count`). `followup_message` is auto-submitted as the next user message, capped by `loop_limit` |
| Check subagent output | `SubagentStop` (same decision format as Stop) | `subagentStop` (`followup_message` when `status` is `completed`) |

Cursor imports Claude Code hooks when "Include Third-Party Plugins, Skills, and Other Configs" is on. It is on by default, but defaults to off for Enterprises since 3.0. The import maps `PreToolUse→preToolUse`, `PostToolUse→postToolUse`, `UserPromptSubmit→beforeSubmitPrompt`, `Stop→stop`, `SubagentStop→subagentStop`, `SessionStart→sessionStart`, `SessionEnd→sessionEnd` and `PreCompact→preCompact`. `Notification` and `PermissionRequest` are unsupported. Tool names map `Bash→Shell` and `Edit→Write`, and `Glob` is unsupported. Both the nested `hookSpecificOutput` format and the flat format are accepted, and `decision: "block"` on Stop becomes a follow-up ([Cursor third-party hooks](https://cursor.com/docs/reference/third-party-hooks.md)).

Relying on the import alone is simpler. But it maps no shell-specific event such as `beforeShellExecution`, documents no `failClosed` option, and is off by default for Enterprises. Shipping `.cursor/hooks.json` as well means that, with imports on, Cursor runs each hook twice, so the scripts must be idempotent. This study recommends the native file for enforcement hooks.

A single script can serve both tools. It branches on the `hook_event_name` field that both send ("PreToolUse" vs "preToolUse") and uses exit 2 for denials, which both honour. Cursor's permission hooks need an explicit allow verdict, because empty output blocks under `failClosed`. The sketch below is this study's design, not vendor code. Test it against captured payloads, since Cursor does not document the `tool_input` field names for `preToolUse`; its `afterFileEdit` and `beforeReadFile` payloads use `file_path`.

```bash
#!/usr/bin/env bash
# .claude/hooks/protect-tests.sh: Claude Code PreToolUse (Edit|Write) and Cursor preToolUse (Write|Delete)
set -u
input=$(cat)
event=$(printf '%s' "$input" | jq -r '.hook_event_name // empty')
path=$(printf '%s' "$input" | jq -r '.tool_input.file_path // .tool_input.path // empty')
case "$path" in
  */tests/*|*.test.*|*_test.*|*/.github/workflows/*|*/.claude/*|*/.cursor/*)
    if [ "${VSWL_ALLOW_TEST_EDITS:-0}" != "1" ]; then   # set only by the human, in the shell that launches a test-writing session
      echo "Protected path: $path. Do not edit tests, CI or agent config while implementing. If the spec and tests conflict, stop and report BLOCKED." >&2
      exit 2                                           # Claude Code: block, stderr = reason. Cursor: deny.
    fi ;;
esac
[ "$event" = "preToolUse" ] && printf '{"permission":"allow"}\n'   # Cursor permission hooks need an explicit verdict
exit 0
```

```bash
#!/usr/bin/env bash
# .claude/hooks/stop-gate.sh: Claude Code Stop and Cursor stop. Refuse completion until .agent/check.sh passes, at most 3 times.
set -u
input=$(cat)
event=$(printf '%s' "$input" | jq -r '.hook_event_name // empty')
sid=$(printf '%s' "$input" | jq -r '.session_id // .conversation_id // "default"')
root="${CLAUDE_PROJECT_DIR:-$PWD}"; counter="${TMPDIR:-/tmp}/vswl-stop-$sid"
if out=$("$root/.agent/check.sh" 2>&1); then rm -f "$counter"; exit 0; fi
n=$(( $(cat "$counter" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$counter"
[ "$n" -gt 3 ] && { rm -f "$counter"; exit 0; }       # retry cap reached: let it stop; the report must say checks failed and escalate
msg="Checks failed (attempt $n/3). Fix the cause; do not edit tests or CI. If impossible, report BLOCKED. Output tail:
$(printf '%s\n' "$out" | tail -n 30)"
if [ "$event" = "stop" ]; then jq -n --arg m "$msg" '{followup_message: $m}'        # Cursor
else jq -n --arg m "$msg" '{decision: "block", reason: $m}'; fi                      # Claude Code
exit 0
```

A pre-tool hook sees only the edit tools, so an agent can still change a test through the shell. The authoritative check is therefore a **diff audit** inside `.agent/check.sh` and CI: fail when `git diff --name-only <base>...HEAD` touches tests, CI or hook files without an approval marker. The matching configuration files:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "hooks": {
    "SessionStart": [{ "matcher": "startup|resume|clear|compact",
      "hooks": [{ "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/session-start.sh", "args": [] }] }],
    "PreToolUse": [{ "matcher": "Edit|Write",
      "hooks": [{ "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/protect-tests.sh", "args": [], "timeout": 10, "onFailure": "block" }] }],
    "PostToolUse": [{ "matcher": "Edit|Write",
      "hooks": [{ "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/post-edit.sh", "args": [], "timeout": 120 }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "${CLAUDE_PROJECT_DIR}/.claude/hooks/stop-gate.sh", "args": [], "timeout": 900 }] }]
  }
}
```

```json
{
  "version": 1,
  "hooks": {
    "sessionStart":         [{ "command": ".claude/hooks/session-start.sh" }],
    "preToolUse":           [{ "command": ".claude/hooks/protect-tests.sh", "matcher": "Write|Delete", "failClosed": true, "timeout": 10 }],
    "beforeShellExecution": [{ "command": ".claude/hooks/guard-shell.sh", "failClosed": true, "timeout": 10 }],
    "postToolUse":          [{ "command": ".claude/hooks/post-edit.sh", "matcher": "Write", "timeout": 120 }],
    "stop":                 [{ "command": ".claude/hooks/stop-gate.sh", "loop_limit": 3, "timeout": 900 }]
  }
}
```

The first block belongs in `.claude/settings.json` and the second in `.cursor/hooks.json`. Cursor runs project hooks from the project root, so the paths are relative. Claude Code recommends exec form (`args`) with `${CLAUDE_PROJECT_DIR}`. Inside a worktree, `${CLAUDE_PROJECT_DIR}` keeps pointing at the original root, so scripts that need the worktree should read `cwd` from the input.

Debug Claude Code hooks with `claude --debug-file <path>` (v2.1.296+ logs each hook's status and duration) and `/hooks`. In Cursor, use the Hooks tab and the "Hooks" output channel. Hooks have existed in Claude Code since v1.0.38 (30 Jun 2025). In Cursor they arrived as a beta in 1.7 (29 Sep 2025), project hooks came in 2.1, and Claude-hook compatibility in the CLI in 2.4 ([Cursor changelog 1.7](https://cursor.com/changelog/1-7); [2.1](https://cursor.com/changelog/2-1); [2.4](https://cursor.com/changelog/2-4)).

## Permissions: deny rules apply before trust, allow rules after

**Claude Code settings.** Precedence runs managed > `--settings` > `.claude/settings.local.json` > `.claude/settings.json` > `~/.claude/settings.json`. Scalar keys take the highest-precedence value, and list keys such as `permissions.allow` merge. Rules use `Tool` or `Tool(specifier)` syntax and are evaluated **deny → ask → allow**. A deny at any level cannot be overridden: "An allow rule can't carve an exception out of a deny rule" ([Claude Code permissions](https://code.claude.com/docs/en/permissions)). Bash rules match by prefix (`Bash(npm run *)`), and compound commands are split, so each part must match. Bash deny rules **are not a security boundary**, because `sh -c` or absolute paths bypass them; the sandbox or a hook must back them up. Read and Edit rules use gitignore syntax; `Write(...)` path rules are ignored with a warning.

Three committed-settings behaviours catch kit authors. First, a repository's `permissions.allow`, `additionalDirectories`, `extraKnownMarketplaces` and most `env` apply only after the user trusts the folder, while `deny` and `ask` apply immediately. Second, `defaultMode: "auto"` or `"bypassPermissions"` in project or local settings never takes effect. Third, in `-p` mode repository hooks and skill `allowed-tools` run, but `permissions.allow` does not apply ([Claude Code settings](https://code.claude.com/docs/en/settings)).

The permission modes are `default` (Manual), `acceptEdits`, `plan`, `auto` (classifier-checked; the terminal default since v2.1.283), `dontAsk` (denies anything that would prompt, for CI) and `bypassPermissions` (containers and VMs only). Writes to `.git`, `.claude`, `.vscode`, `.husky` and similar paths are never auto-approved outside bypass ([permission modes](https://code.claude.com/docs/en/permission-modes)). The sandbox (`"sandbox": {"enabled": true}`) runs Bash under Seatbelt on macOS, or bubblewrap and socat on Linux/WSL2. It falls back to unsandboxed unless `failIfUnavailable: true`. `allowUnsandboxedCommands: false` disables the escape hatch. Note that reads default to "most of the machine, including credential files", so add `filesystem.denyRead`, and that hooks, MCP servers and the file tools run *outside* the sandbox ([Claude Code sandboxing](https://code.claude.com/docs/en/sandboxing.md)).

A minimal committed baseline follows. Its deny rules and sandbox apply immediately; its allow rules are conveniences that take effect only after trust. Merge it with the hooks block above into a single `.claude/settings.json`:

```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "deny": ["Read(./.env)", "Read(./.env.*)", "Bash(git push *)", "Bash(curl *)", "Bash(wget *)"],
    "allow": ["Bash(./.agent/check.sh *)", "Bash(git diff *)", "Bash(git status *)"]
  },
  "sandbox": { "enabled": true, "failIfUnavailable": true, "allowUnsandboxedCommands": false }
}
```

Organizations should also set `permissions.disableBypassPermissionsMode: "disable"` in managed settings. Validate with the published schema, `/status` (setting sources) and `claude doctor`.

**Cursor run modes and permission files.** The IDE has three Run Modes: **Auto-review** (the recommended default since 3.6, 29 May 2026), **Allowlist** and **Run Everything**. In Auto-review, allowlisted calls run, other shell commands are sandboxed where possible, and the rest go to a classifier that "uses Gemini 3.5 Flash Lite, with Claude 4.5 Haiku as the fallback". Cursor states plainly that "Auto-review is not a security boundary" ([Run Modes](https://cursor.com/docs/agent/security/run-modes.md)).

`permissions.json` lives at `~/.cursor/permissions.json` or `<workspace>/.cursor/permissions.json` and is JSONC; arrays concatenate. It holds `mcpAllowlist` (entries `server:tool` with `*` wildcards), `terminalAllowlist` (command prefixes) and `autoRun.allow_instructions` / `autoRun.block_instructions`. The last two are natural-language steering for the classifier, "not enforcement". Precedence is team admin > permissions.json > IDE settings ([permissions.json](https://cursor.com/docs/reference/permissions.md)).

`sandbox.json` sets network and filesystem policy, merged per-user < per-repo < team-admin < hardcoded, with deny beating allow. Some paths are always write-protected: `.cursor/**/*.json`, `.claude/**/*.json`, `.vscode/**`, `.git/hooks/**`, `.git/config` and `.cursorignore`. Private ranges and `169.254.169.254` are blocked ([sandbox.json](https://cursor.com/docs/reference/sandbox.md)). The CLI reads `~/.cursor/cli-config.json` and a project `.cursor/cli.json`, which may hold only permissions. Its tokens are `Shell(cmd)`, `Read(glob)`, `Write(glob)`, `WebFetch(domain)` and `Mcp(server:tool)`, with deny taking precedence. The documented minimal global file is `{"version":1,"editor":{"vimMode":false},"permissions":{"allow":["Shell(ls)"],"deny":[]}}` ([CLI configuration](https://cursor.com/docs/cli/reference/configuration.md)). `.cursorignore` blocks the agent's file tools, but "the terminal and MCP server tools used by Agent cannot block access to code governed by `.cursorignore`" ([ignore file](https://cursor.com/docs/reference/ignore-file.md)).

## Plugins: one repository can be a marketplace for both tools

Both tools package skills, agents, hooks and MCP servers into versioned plugins distributed through Git-hosted marketplaces. Cursor's own official repository ships **both** `.cursor-plugin/marketplace.json` and `.claude-plugin/marketplace.json` at its root ([cursor/plugins](https://github.com/cursor/plugins)), which makes a dual-manifest repository a proven pattern.

| Aspect | Claude Code | Cursor |
|---|---|---|
| Manifest | `.claude-plugin/plugin.json`, optional; **only `name` required** (kebab-case; names starting `claude-`, `anthropic-`, `anthropics-` or `cc-plugin-` are errors) | `.cursor-plugin/plugin.json`, required; **only `name` required** (lowercase kebab; alphanumerics, hyphens, periods). Also accepts open Agent Plugins with a root `plugin.json` and `$schema` `https://agent-plugins.org/schemas/1.0.0/plugin.schema.json` (skills and MCP only) |
| Default components | `skills/`, `commands/`, `agents/`, `hooks/hooks.json`, `.mcp.json`, `.lsp.json`, `output-styles/`, `workflows/`, `themes/`, `monitors/monitors.json`, `bin/` (added to PATH), `settings.json` | `rules/*.mdc`, `skills/`, `agents/`, `commands/`, `hooks/hooks.json`, `mcp.json` |
| Manifest component fields | `skills` **adds to** `skills/`; `commands`, `agents`, `outputStyles`, `workflows` **replace** defaults; `hooks` and `mcpServers` **merge** | Any component field **replaces** folder discovery for that component |
| Not supported | A plugin-root `CLAUDE.md` is **not loaded**; plugin subagents ignore `hooks`, `mcpServers`, `permissionMode` | Plugin skills and agents document only `name` and `description` |
| Paths and variables | Paths must start with `./` and stay inside the root. `${CLAUDE_PLUGIN_ROOT}` changes on update; persistent state goes in `${CLAUDE_PLUGIN_DATA}` | `${CURSOR_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_ROOT}` expand in `command`, `args`, `env` and `cwd`; the open standard's `${PLUGIN_ROOT}` is not expanded in `mcp.json` |
| Versioning | Setting `version` **pins users** until it changes; omit it to track commits | `version` field; marketplace updates are reviewed |
| Marketplace file | `.claude-plugin/marketplace.json`: required `name`, `owner {name}`, `plugins[]`, with each entry needing `name` and `source`. Sources: `./relative`, `github`, `url`, `git-subdir`, `npm`, `archive` (v2.1.224+), `command` (v2.1.229+) | `.cursor-plugin/marketplace.json`: required `name`, `owner {name}`, `plugins[]` (file ≤ 10 MB). Entries need `name`; `source` is a path or `{path}`; manifest values win when merged |
| Install | `/plugin marketplace add owner/repo`, then `/plugin install <plugin>@<marketplace>`; shell `claude plugin install <p>@<m> --scope project`; repo-level auto-enable via `extraKnownMarketplaces` + `enabledPlugins` in `.claude/settings.json` (after trust) | Customize → Install (project or user scope); `/add-plugin` (2.5); CLI `/plugin`; local development in `~/.cursor/plugins/local/<plugin>`; team marketplaces (Teams: 1, Enterprise: unlimited) with Default Off / Default On / Required modes |
| Validate and test | `claude plugin validate <dir> [--strict]`; `claude --plugin-dir ./p` for one session; `claude plugin eval` (**v2.1.269, 11 Sep 2026**) | Submission checklist; public marketplace plugins must be open source and are "manually reviewed", including every update |
| Introduced | v2.0.12 (9 Oct 2025) | 2.5 (17 Feb 2026); team marketplaces 2.6 (3 Mar 2026) |

Sources: [Claude Code plugin manifest](https://code.claude.com/docs/en/plugins/manifest-reference), [marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference), [CLI reference](https://code.claude.com/docs/en/plugins/cli-reference), [Cursor plugins](https://cursor.com/docs/plugins.md), [Cursor plugins reference](https://cursor.com/docs/reference/plugins.md).

The two tools use the same default `hooks/hooks.json` path with **different schemas**. A dual plugin should keep Claude Code's format at that default path, which Claude Code merges automatically. The Cursor manifest should then point `"hooks"` at a separate file, because in Cursor a manifest field replaces folder discovery:

```text
hyper-agents/                              # one Git repo = a marketplace for both tools
├── .claude-plugin/marketplace.json        {"name":"hyper-agents","owner":{"name":"Hyper AI Lab"},"plugins":[{"name":"vswl","source":"./plugins/vswl","description":"Verified Single-Writer Loop"}]}
├── .cursor-plugin/marketplace.json        {"name":"hyper-agents","owner":{"name":"Hyper AI Lab"},"plugins":[{"name":"vswl","source":"plugins/vswl","description":"Verified Single-Writer Loop"}]}
└── plugins/vswl/
    ├── .claude-plugin/plugin.json         {"name":"vswl","description":"…","author":{"name":"…"}}
    ├── .cursor-plugin/plugin.json         {"name":"vswl","description":"…","author":{"name":"…"},"hooks":"./hooks/cursor-hooks.json"}
    ├── skills/<name>/SKILL.md             # both tools
    ├── agents/*.md                        # both tools (Claude Code drops hooks/mcpServers/permissionMode here)
    ├── rules/*.mdc                        # Cursor only (always-on rules; Claude Code plugins cannot carry CLAUDE.md)
    ├── hooks/hooks.json                   # Claude Code format: {"hooks":{"Stop":[…]}}, using ${CLAUDE_PLUGIN_ROOT}
    ├── hooks/cursor-hooks.json            # Cursor format: {"version":1,"hooks":{"stop":[…]}}, using ${CURSOR_PLUGIN_ROOT}
    └── scripts/                           # shared hook scripts
```

This layout is this study's composition of documented rules. Cursor's own example uses a bare relative `source` (`"plugin-one"`), so validate both manifests before publishing. A plugin also cannot inject always-on text into Claude Code through a `CLAUDE.md`. Always-on guidance must come from a skill, a `SessionStart` hook's `additionalContext`, or an output style with `force-for-plugin`. Plugin delivery has a security advantage too: hook scripts installed in the plugin cache sit outside the workspace, so an agent writing inside the repository cannot rewrite them.

## MCP: the same JSON shape with incompatible interpolation

| Aspect | Claude Code | Cursor |
|---|---|---|
| Project file | `.mcp.json` at the root: `{"mcpServers": {…}}`. Remote entries **must** set `"type": "http"` (alias `streamable-http`), `"sse"` or `"ws"`; an entry with a `url` but no `type` is skipped | `.cursor/mcp.json` (project) or `~/.cursor/mcp.json`: `{"mcpServers": {…}}` with `command`/`args`/`env`/`envFile`, or `url`/`headers` with optional static OAuth `auth` |
| Interpolation | `${VAR}` and `${VAR:-default}` in `command`, `args`, `env`, `url`, `headers` | `${env:NAME}`, `${userHome}`, `${workspaceFolder}`, `${workspaceFolderBasename}`, `${pathSeparator}` |
| Approval | Interactive sessions ask before connecting `.mcp.json` servers, and "a cloned repository can't approve its own servers"; `-p`, SDK and cloud sessions connect without asking | Connections need approval, and each tool call needs approval unless allowlisted via `mcpAllowlist`; MCP follows the Run Modes |
| Context cost control | Tool Search (deferred loading); subagent-scoped `mcpServers` keep tool schemas out of the main context | Definitions load only when needed (since 2.4) |
| Tool naming | `mcp__<server>__<tool>`; plugin servers `mcp__plugin_<plugin>_<server>__<tool>` | `MCP:<tool_name>` in hook matchers |

Sources: [Claude Code MCP](https://code.claude.com/docs/en/mcp), [Cursor MCP](https://cursor.com/docs/mcp.md).

The JSON shapes are compatible, but the interpolation syntax is not, so keep two files. The servers with the clearest value for this method cover browser verification, current library documentation and the code host. For browsers, use Playwright MCP or Chrome DevTools MCP, or Cursor's built-in browser; Microsoft itself recommends Playwright's CLI plus Skills for coding agents. For documentation, use Context7 or its `ctx7` CLI-plus-skill mode. For GitHub, run the official server with minimal `--toolsets`, `--read-only` and `--lockdown-mode`, which GitHub calls "**not** an authorization boundary" ([Playwright MCP](https://github.com/microsoft/playwright-mcp); [Context7](https://github.com/upstash/context7); [GitHub MCP](https://github.com/github/github-mcp-server)) [V]. Database servers should be read-only and project-scoped, as in Supabase's `read_only=true&project_ref=…` ([Supabase MCP](https://github.com/supabase/mcp)) [V]. Evidence for these servers' benefit is vendor- or self-reported only, and star counts measure popularity.

## Headless runs: the init event proves what actually loaded

Claude Code's `claude -p` runs with the same discovery as an interactive session but **without the trust dialog**. The machine-readable record of what loaded is the first `system/init` event of `--output-format stream-json --verbose`. It lists `tools`, `mcp_servers`, `slash_commands`, `skills`, `agents`, `plugins`, `plugin_errors`, `mcp_server_errors`, `permissionMode` and `claude_code_version`, and CI should fail on non-empty `plugin_errors` or `mcp_server_errors` ([Claude Code headless](https://code.claude.com/docs/en/headless)):

```bash
claude -p "/vswl:verify-change" --plugin-dir ./plugins/vswl --permission-mode dontAsk \
  --output-format stream-json --verbose \
  | jq -c 'select(.type=="system" and .subtype=="init") | {skills, agents, slash_commands, plugins, plugin_errors, mcp_servers}'
```

`--bare` (v2.1.81, 20 Mar 2026) skips all discovery and hides the skill listing, so never use it to test whether skills trigger. For deterministic runs, use `--setting-sources`, `--allowedTools`, `--max-turns` and `--max-budget-usd`. `claude plugin eval` runs each `evals/<case>/prompt.md` (frontmatter `max_turns`, `allowed_tools`, `timeout_seconds`, `model`, `tags`) three times with and three times without the plugin. Graders live in `graders/*.md` with types `llm`, `baseline`, `regex`, `tool_used`, `tool_order` and `file_exists`. For example, `type: tool_used`, `tool: Skill` with an `input_match` regex checks that a skill actually fired ([plugin evals](https://code.claude.com/docs/en/plugin-evals)).

Cursor's CLI binary is now `agent`. `agent -p` applies changes only with `--force` (or `--yolo`); without it, changes are only proposed. Other flags include `--output-format text|json|stream-json`, `--trust` (headless only), `--approve-mcps`, `--sandbox enabled|disabled`, `--mode plan|ask`, `--worktree` and `--plugin-dir`, with authentication via `CURSOR_API_KEY` ([Cursor headless](https://cursor.com/docs/cli/headless.md); [parameters](https://cursor.com/docs/cli/reference/parameters.md)). Cursor documents no built-in eval runner, so its behavioural tests run the same case prompts through `agent -p` with external graders.

## Plan mode and worktrees: git is the only complete checkpoint

| Aspect | Claude Code | Cursor |
|---|---|---|
| Plan mode | `Shift+Tab`, `/plan`, `--permission-mode plan`, or `{"permissions": {"defaultMode": "plan"}}`. Plans go to `~/.claude/plans/` or `plansDirectory`; a hook on `ExitPlanMode` receives `plan` and `planFilePath` | `Shift+Tab` or `/plan`; asks clarifying questions and produces an editable plan, then **Build**. Docs say plans save to the home directory by default, with "Save to workspace" to move them (Cursor's January 2026 blog says `.cursor/plans/`) |
| Checkpoints | Automatic per prompt, 100 kept; `/rewind` or `Esc Esc`. **Bash changes are not tracked**, nor are background-subagent edits; "not a replacement for version control" | Automatic before significant changes, stored locally and separate from git; restoring reverts files only |
| Worktrees | `claude --worktree <name>` creates `.claude/worktrees/<name>/` on branch `worktree-<name>`; `.worktreeinclude` copies gitignored files; `worktree.baseRef` is `fresh` (default) or `head`; subagent `isolation: worktree`; `/batch` fans out to 5–30 worktree subagents | `.cursor/worktrees.json` with `setup-worktree-unix`, `setup-worktree-windows` and `setup-worktree` (with `$ROOT_WORKTREE_PATH`); `/worktree`, `/best-of-n <models> <task>`, `/apply-worktree`; at most 25 worktrees per machine by default; Agents Window (3.0+) |
| Experimental or preview | Agent teams (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`), agent view (research preview), dynamic workflows in `.claude/workflows/*.js` | Cloud Agents in VMs configured by `.cursor/environment.json` (no approval prompts inside the VM) |

Sources: [Claude Code permission modes](https://code.claude.com/docs/en/permission-modes), [checkpointing](https://code.claude.com/docs/en/checkpointing), [worktrees](https://code.claude.com/docs/en/worktrees), [Cursor Plan Mode](https://cursor.com/docs/agent/plan-mode.md), [Cursor worktrees](https://cursor.com/docs/configuration/worktrees.md), [Cursor Cloud Agents](https://cursor.com/docs/cloud-agent.md).

Since neither tool's checkpoints capture everything, the method treats **git commits as the real checkpoints**. Its stable mechanism for parallel work is worktree-isolated subagents or sessions, not the experimental team features.

## Added on 17 October 2026: code intelligence

Claude Code connects language servers through code-intelligence plugins. Anthropic's official marketplace has one per language (`pyright-lsp` for Python, `typescript-lsp` for TypeScript and JavaScript, and others for C/C++, C#, Go, Java, Kotlin, Lua, PHP, Ruby, Rust and Swift). A plugin names the server command and the file extensions; the developer installs the binary. With a server running, Claude gets the errors and warnings an edit introduced right after the edit, and a read-only `LSP` tool for definitions, references, implementations, call hierarchies and workspace symbols. The tool needs no permission, stays inactive until a plugin is installed, and is not available in cloud sessions ([code intelligence plugins](https://code.claude.com/docs/en/plugins/code-intelligence); [tools reference](https://code.claude.com/docs/en/tools-reference#lsp-tool-behavior)) [V]. In Cursor, the agent reads the editor's diagnostics for open files from the same store as the Problems panel; according to Cursor staff, the Agents window, the CLI and cloud agents do not run that loop ([Cursor forum](https://forum.cursor.com/t/does-agents-iterate-on-lint-errors-work-with-custom-third-party-lsp-servers-or-only-built-in-linters/168705)) [A].

## Added on 17 October 2026: Anthropic's official plugins

Anthropic's official marketplace (`claude-plugins-official`, read at commit `ea10b21`) has plugins the study did not assess. The ones that touch this method ([marketplace](https://github.com/anthropics/claude-plugins-official/tree/main/plugins)) [V]:

| Plugin | What it does | Verdict for PAACM |
|---|---|---|
| `pr-review-toolkit` | Six review agents: code, comments, tests, silent failures, type design, simplification. Apache License 2.0 | Adapt `silent-failure-hunter` as a read-only reviewer for error handling; the others overlap the reviewer and the phase rules |
| `claude-security` | A multi-agent vulnerability scan whose findings must survive independent verification; report plus SARIF; patch suggestions. Proprietary | Use when installed, for high-stakes work and releases |
| `security-guidance` | Edit-time pattern warnings, a turn-end diff review and a per-commit agentic review. Its session-start hook installs the Claude Agent SDK from the package index when it is missing | Optional companion; project linters often cover the patterns, and the turn-end review duplicates PAACM's |
| `frontend-design` | Pushes distinctive, bold visual design for frontend work | Not adopted: it conflicts with a project's own design system |
| `ralph-loop` | A stop hook that re-feeds the prompt until the agent prints a completion phrase; unlimited iterations by default | Not adopted: PAACM's stop gate ends on executed checks and has a retry cap ([methodologies](03-methodologies.md#added-on-17-october-2026-matt-pococks-skills-ecc-and-the-official-ralph-plugin)) |
| `mattpocock-skills` | Matt Pocock's skills (MIT) | Five techniques adopted in the method's own words ([ADR 0020](../method/adr/0020-question-rounds-questionnaires-and-loop-first-debugging.md)); the plugin itself is not installed |
| `claude-md-management` | Audits `CLAUDE.md` and writes session learnings into it | Not adopted: model-written instruction files lowered success in the study's evidence, so always-on instructions stay human-written ([ADR 0004](../method/adr/0004-minimal-instructions.md)) |
