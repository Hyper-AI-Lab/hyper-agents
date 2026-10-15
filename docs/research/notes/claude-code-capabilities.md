# Claude Code extension capabilities and file formats (state as of 2026-10-14)

STATUS: COMPLETE for all nine key questions (2026-10-14). Every finding was taken from the official docs at code.claude.com/docs (raw markdown, fetched 2026-10-14; newest changelog entry v2.1.299, October 14, 2026) or agentskills.io. No third-party sources were used as authority. Version notes such as "v2.1.277+" are copied from the docs' own annotations.

## Memory / instructions (CLAUDE.md, imports, AGENTS.md)

Doc snapshot: official docs downloaded 2026-10-14 as raw markdown from code.claude.com/docs/en/*.md; the changelog's newest entry is **v2.1.299 (October 14, 2026)** — [Changelog](https://code.claude.com/docs/en/changelog). All "vX" notes below are taken from the docs' own version annotations.

### Takeaway
CLAUDE.md files (managed > user > project > local, plus ancestors at launch and subdirectories on demand) are concatenated, not overridden, and delivered as a user message after the system prompt; `@path` imports expand at launch (max 4 hops) and do not save context; `.claude/rules/*.md` with optional `paths:` frontmatter gives path-scoped instructions; since v2.1.277 Claude Code reads `AGENTS.md` natively but by default ONLY when no CLAUDE.md/CLAUDE.local.md exists on the path — a kit that ships both must import `@AGENTS.md` from CLAUDE.md (or the user must change the "Project instructions" setting). Target <200 lines per file.

### Cited Findings
**Locations and load order** (broadest to most specific; later = read later in context) — [Memory](https://code.claude.com/docs/en/memory#choose-where-to-put-claude-md-files)
| Scope | Location |
|---|---|
| Managed policy | macOS `/Library/Application Support/ClaudeCode/CLAUDE.md`; Linux/WSL `/etc/claude-code/CLAUDE.md`; Windows `C:\Program Files\ClaudeCode\CLAUDE.md` (cannot be excluded) |
| User | `~/.claude/CLAUDE.md` (+ `~/.claude/rules/*.md`) |
| Project | `./CLAUDE.md` or `./.claude/CLAUDE.md` (+ `./.claude/rules/**/*.md`) |
| Local | `./CLAUDE.local.md` (personal, add to `.gitignore`) |
- Managed content can also be inlined via the `claudeMd` key in `managed-settings.json` (honored only in managed/policy settings): `{"claudeMd": "Always run `make lint` before committing.\nNever push directly to main."}` — [Memory](https://code.claude.com/docs/en/memory#deploy-organization-wide-claude-md)
- Claude Code loads `CLAUDE.md` and `CLAUDE.local.md` from the cwd and every ancestor at launch; all are **concatenated rather than overriding**, ordered root → cwd; within a directory `CLAUDE.local.md` is appended after `CLAUDE.md` — [Memory](https://code.claude.com/docs/en/memory#how-claude-md-files-load)
- CLAUDE.md/CLAUDE.local.md files in **subdirectories** load on demand, once Claude reads/writes/edits a file in that subdirectory (a Bash `cat`/`head` of a single file counts as a read); they do not appear under `/context` "Memory files" — [Memory](https://code.claude.com/docs/en/memory#how-claude-md-files-load)
- Block-level HTML comments `<!-- ... -->` are stripped before injection (kept inside code blocks) — [Memory](https://code.claude.com/docs/en/memory#how-claude-md-files-load)
- `--add-dir` directories do not load CLAUDE.md unless `CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD=1`; then `CLAUDE.md`, `.claude/CLAUDE.md`, `.claude/rules/*.md`, `CLAUDE.local.md` load from them — [Memory](https://code.claude.com/docs/en/memory#load-from-additional-directories)
- CLAUDE.md "content is delivered as a user message after the system prompt, not as part of the system prompt itself"; no guarantee of strict compliance; use hooks for must-run behaviour and `--append-system-prompt` for system-prompt-level text — [Memory](https://code.claude.com/docs/en/memory#claude-isn-t-following-my-claude-md)
- Project-root CLAUDE.md survives `/compact` (re-read from disk and re-injected); nested CLAUDE.md and `paths:` rules reload on demand — [Memory](https://code.claude.com/docs/en/memory#instructions-seem-lost-after-compact)

**`@path` imports** — [Memory](https://code.claude.com/docs/en/memory#import-additional-files)
- Syntax `@path/to/import` anywhere in the file; relative paths resolve relative to the **importing file**, absolute and `@~/...` allowed; recursive imports up to **max depth of four hops**.
- Spaces must be backslash-escaped (`@Design\ Docs/api-conventions.md`); a quoted path is not imported at all.
- Parsing skips Markdown code spans and fenced blocks, so `` `@README` `` stays literal.
- Imports do not reduce context cost (imported files load at launch).
- Imports resolving outside the working directory in a project-level file are "external": first encounter shows a one-time approval dialog; if declined they stay disabled. User-scope files (`~/.claude/CLAUDE.md`, `~/.claude/rules/`) load imports without the dialog (except in Cowork desktop sessions).

**Rules directory `.claude/rules/`** — [Memory](https://code.claude.com/docs/en/memory#organize-rules-with-claude/rules/)
- All `.md` files discovered recursively; rules without `paths` load at launch with the same priority as `.claude/CLAUDE.md`; user rules `~/.claude/rules/` load before project rules.
- Only frontmatter field read: `paths` (YAML list or comma-separated string of globs, brace expansion allowed, budget 1,000 expanded patterns/4 MiB per rule). Other fields are ignored silently; unparseable YAML → rule loads as if it had no `paths` (see `claude --debug`).
- A path-scoped rule loads when Claude uses Read/Write/Edit on a matching file (or a Bash single-file read).
- Symlinks supported; a symlink target outside the working dir is treated like an external import (needs approval; afterwards only rules **without** `paths` load). Network paths (UNC, `/net`, `/Network`) are not followed.
- Project rules are skipped if `project` is excluded from `--setting-sources` (on-demand rules were also excluded only from v2.1.211).
Minimal example:
```markdown
---
paths:
  - "src/api/**/*.ts"
---
# API Development Rules
- All API endpoints must include input validation
```

**Size guidance** — [Memory](https://code.claude.com/docs/en/memory#write-effective-instructions)
- "target under 200 lines per CLAUDE.md file"; a CLAUDE.md up to 4 MiB is loaded in full, a larger file is skipped; startup and `/status` warn when a file is over the recommended length or files combined exceed a limit (each CLAUDE.md, rules file and `@path` import counts as a file) — [Memory](https://code.claude.com/docs/en/memory#my-claude-md-is-too-large)
- `/doctor prompt-audit` (v2.1.283+) audits CLAUDE.md, CLAUDE.local.md, AGENTS.md, rules, skills, commands, subagents and output styles for stale/conflicting content — [Memory](https://code.claude.com/docs/en/memory#audit-your-instruction-files)
- `claudeMdExcludes` (glob array against absolute paths, any settings layer, arrays merge) skips specific CLAUDE.md/rules files; managed CLAUDE.md can't be excluded — [Memory](https://code.claude.com/docs/en/memory#exclude-specific-claude-md-files)

**AGENTS.md** — [Memory](https://code.claude.com/docs/en/memory#agents-md)
- Native reading of `AGENTS.md` requires **v2.1.277+** (some Bedrock/telemetry-off sessions only from v2.1.281); implemented by built-in plugin `cc-plugin-agents-md@builtin` (ID was `agents-md@builtin` before v2.1.285).
- Default (`claude-md-or-agents-md`): Claude reads AGENTS.md **only if there is no `CLAUDE.md`, `.claude/CLAUDE.md` or `CLAUDE.local.md` in the cwd or any ancestor**; `~/.claude/CLAUDE.md`, managed CLAUDE.md and `.claude/rules/` don't count and load alongside.
- When read: every `AGENTS.md` and `.claude/AGENTS.md` in cwd and ancestors at start; a subdirectory AGENTS.md on Read when that subdir has no CLAUDE.md files; `@path` imports inside AGENTS.md expand. **Not read**: `AGENTS.local.md`, `AGENTS.override.md`, anything under `.agents/`.
- "Project instructions" values (`/config`, or `pluginConfigs` in user settings / `--settings` / managed only — ignored in project and local settings): `claude-md-or-agents-md` (default), `claude-md-and-agents-md`, `claude-md`, `managed-only`.
```json
{ "pluginConfigs": { "cc-plugin-agents-md@builtin": { "options": { "instructionFiles": "claude-md-and-agents-md" } } } }
```
- Differences for AGENTS.md read via the setting: `InstructionsLoaded` hooks don't fire; not loaded from `--add-dir` dirs; external imports load only if already approved.
- Recommended portable pattern: `CLAUDE.md` containing `@AGENTS.md` then Claude-specific lines (never double-loads); symlink `ln -s AGENTS.md CLAUDE.md` works but Edit/Write refuse to write through symlinks and Windows checkouts may get a one-line text file.
- `/init` migrates `.cursor/rules/`, `.cursorrules`, `.github/copilot-instructions.md` (and with `CLAUDE_CODE_NEW_INIT=1` also AGENTS.md, `.devin/rules/`, `.windsurf/rules/`, `.windsurfrules`, `.clinerules`); `/import` (v2.1.213+) copies another agent's instruction files, MCP servers, commands, subagents and skills — [Memory](https://code.claude.com/docs/en/memory#migrate-instructions-from-other-tools)

**Auto memory** — [Memory](https://code.claude.com/docs/en/memory#auto-memory)
- Stored at `~/.claude/projects/<project>/memory/` (`<project>` derived from git repo so worktrees share it), with `MEMORY.md` index + topic files; first **200 lines or 25KB** of MEMORY.md loaded each session; topic files read on demand; memory types in frontmatter `type`: `user`, `feedback`, `project`, `reference`; `modified` timestamp auto-added (v2.1.214+).
- Toggle: `/memory`, `autoMemoryEnabled` setting, or `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`; relocate with `autoMemoryDirectory` (absolute or `~/`).
- Main-conversation auto memory is not loaded into subagents (except forks); subagents have their own via the `memory` field.
- Debug: `/context` (Memory files list), `/memory`, `InstructionsLoaded` hook.


**Version history (changelog)** — [Changelog](https://code.claude.com/docs/en/changelog)
- `@path/to/file.md` imports in CLAUDE.md: v0.2.107 (May 9, 2025); `.claude/rules/` support: v2.0.64 (Dec 10, 2025); native AGENTS.md reading ("in a project with no CLAUDE.md, Claude Code reads AGENTS.md instead"): v2.1.277 (Sep 18, 2026).

### Inferences
- For a method kit that targets several agents, the safest layout is a short `CLAUDE.md` that starts with `@AGENTS.md`, because a kit cannot rely on users' "Project instructions" setting and project/local settings cannot change it.
- Path-scoped rules are the cheapest way to deliver area-specific guidance; skills are better for procedures (they load only on invocation/relevance).

### Gaps
- The exact combined-size limit that triggers the multi-file startup warning is not stated in the memory page.

## Skills (SKILL.md, frontmatter, arguments, commands, Agent Skills standard)

### Takeaway
A skill is a directory `<name>/SKILL.md` (YAML frontmatter + Markdown body) under `~/.claude/skills/`, `.claude/skills/` (also ancestors up to repo root and nested subdirs on demand), a plugin's `skills/`, or the managed settings directory; it becomes `/name` and, unless `disable-model-invocation: true`, is auto-invocable by Claude from its `description`. `.claude/commands/*.md` files are the legacy form and still work identically (skill wins on a name clash). All frontmatter fields are optional; unknown fields are silently ignored; the Agent Skills open standard (agentskills.io) defines a 6-field subset (`name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools`) and Claude Code accepts all of them, so standard-conformant skills load unchanged.

### Cited Findings
**Locations** — [Skills: Choose where skills load](https://code.claude.com/docs/en/skills#where-skills-live)
| Location | Path | Loads in |
|---|---|---|
| Enterprise | `.claude/skills/<skill-name>/SKILL.md` inside the managed settings directory (e.g. `/etc/claude-code/.claude/skills/<skill-name>/` on Linux) | all users on the machine |
| Personal | `~/.claude/skills/<skill-name>/SKILL.md` | all your projects (not Cowork/cloud sessions) |
| Project | `.claude/skills/<skill-name>/SKILL.md` | this repository |
| Nested | `<subdir>/.claude/skills/<skill-name>/SKILL.md` | sessions started in/below `<subdir>`, or once Claude touches files there |
| Additional dir | `.claude/skills/...` in a `--add-dir` directory | that session (also loads its `.claude/commands/` and `.claude/agents/`; `permissions.additionalDirectories` does NOT) |
| Plugin | `<plugin>/skills/<skill-name>/SKILL.md` | where plugin enabled, as `/plugin-name:skill-name` |
| claude.ai account | synced into `~/.claude/skills/synced/` (v2.1.273+ in terminal) | sessions signed in with that account |
- Project skills load from `.claude/skills/` in the start directory and every parent up to the repository root; in a linked git worktree the search stops at the worktree root, but on v2.1.277+ if the worktree has no `.claude/skills` at its root the main checkout's project skills load — [Skills](https://code.claude.com/docs/en/skills#discovery-from-parent-and-nested-directories)
- Nested skills with a clashing name are addressable as `/apps/web:deploy` — [Skills](https://code.claude.com/docs/en/skills#discovery-from-parent-and-nested-directories)
- Name-clash precedence: enterprise > personal > project; a user skill replaces a bundled skill/built-in command (not its aliases); a skill beats a `.claude/commands/` file of the same name; plugin skills never clash (namespaced) — [Skills](https://code.claude.com/docs/en/skills#resolve-skills-that-share-a-name)
- Reserved names: folder `synced` (any case) and `anthropic-skills` / `anthropic-skills:*` don't load outside plugins — [Skills](https://code.claude.com/docs/en/skills#where-skills-live)
- A skill folder containing `.claude-plugin/plugin.json` loads as a plugin named `<name>@skills-dir` (can bundle agents, hooks, MCP); in project `.claude/skills/` requires accepting workspace trust — [Skills](https://code.claude.com/docs/en/skills#where-skills-live)
- Live change detection: edits under `~/.claude/skills/`, `.claude/skills/`, and `--add-dir` skills are picked up without restart (not in bare mode); a newly created top-level skills dir needs `/reload-skills` — [Skills](https://code.claude.com/docs/en/skills#live-change-detection)
- Claude Code's documented skill locations do not include `.agents/skills/` (the cross-client convention described by agentskills.io for clients to scan); the memory page says nothing under a `.agents/` directory is read for AGENTS.md — [Skills](https://code.claude.com/docs/en/skills#where-skills-live), [Memory](https://code.claude.com/docs/en/memory#when-claude-code-reads-agents-md), [agentskills.io client guide](https://agentskills.io/client-implementation/adding-skills-support)

**Frontmatter reference (Claude Code)** — all optional; "A field name must match the table exactly, hyphens included: Claude Code ignores a field it doesn't recognize without reporting an error"; frontmatter is read only if `---` is the first line; unparseable YAML → skill loads with no fields (body still invocable via `/name`, but description matching fails; see `--debug`); booleans accept `yes/no/on/off/1/0` (v2.1.218+) — [Skills: Frontmatter reference](https://code.claude.com/docs/en/skills#frontmatter-reference)
| Field | Meaning |
|---|---|
| `name` | Command name in `/` menu; defaults to directory name (directory name also still invokes it) |
| `description` | Recommended. What + when; if omitted, first non-empty body line. Combined `description`+`when_to_use` truncated at **1,536 chars** in the listing |
| `when_to_use` | Extra trigger phrases, appended to description (only field with underscore) |
| `argument-hint` | Autocomplete hint, e.g. `[issue-number]` |
| `arguments` | Named positional args (space-separated string or YAML list) for `$name` substitution |
| `disable-model-invocation` | `true` → Claude can't auto-invoke; description not in context; also blocks preloading into subagents and scheduled-task firing. Default `false` |
| `user-invocable` | `false` → hidden from `/` menu, only Claude invokes. Default `true` |
| `allowed-tools` | Tools pre-approved **only during the turn that invokes the skill** (clears on next user message); space/comma string or YAML list; does not restrict other tools |
| `disallowed-tools` | Tools removed while skill active (clears on next message) |
| `model` | Model override for rest of current turn (`/model` values or `inherit`); with `context: fork` sets the fork's model |
| `effort` | `low`, `medium`, `high`, `xhigh`, `max` |
| `context` | `fork` → run in a forked subagent context |
| `agent` | Subagent type used with `context: fork` (`Explore`, `Plan`, `general-purpose` or custom; default `general-purpose`) |
| `background` | With `context: fork`; `false` waits for result in same turn. Default `true` (v2.1.218+) |
| `hooks` | Hooks registered when the skill is invoked, kept for rest of session (see Hooks section, `once` option) |
| `paths` | Globs limiting auto-activation to matching files (same format as rules) |
| `shell` | `bash` (default) or `powershell` for `!` injection |
| `metadata` | Free-form map, ignored by Claude Code |
| `license` | Agent Skills field; accepted, not acted on |
| `compatibility` | Agent Skills field; ≤500 chars; accepted, not acted on |
- `.claude/commands/` files accept the same fields **except `name` and `paths`** — [Skills](https://code.claude.com/docs/en/skills#frontmatter-reference)

**Command name resolution** — [Skills: How a skill gets its command name](https://code.claude.com/docs/en/skills#how-a-skill-gets-its-command-name)
- `.claude/skills/deploy-staging/SKILL.md` → `/deploy-staging` (or `/deploy` with `name: deploy`); `.claude/commands/deploy.md` → `/deploy`; `.claude/commands/frontend/component.md` → `/frontend:component`; `my-plugin/skills/review/SKILL.md` → `/my-plugin:review` (bare `/review` also works if unclaimed); plugin-root `SKILL.md` uses `name` (fallback plugin dir name). Prefix not doubled if `name` already has it (v2.1.246+).

**String substitutions** — [Skills: Available string substitutions](https://code.claude.com/docs/en/skills#available-string-substitutions)
- `$ARGUMENTS` (full string as typed; if no placeholder receives args, Claude Code appends `ARGUMENTS: <value>`), `$ARGUMENTS[N]` (0-based), `$N` shorthand (`$0`, `$1`), `$name` (from `arguments`), `${CLAUDE_SESSION_ID}`, `${CLAUDE_EFFORT}`, `${CLAUDE_SKILL_DIR}` (skill's own dir; for plugin skills the skill subdir), `${CLAUDE_PROJECT_DIR}`, `${CLAUDE_PLUGIN_ROOT}` and `${CLAUDE_PLUGIN_DATA}` (plugin skills only).
- `${CLAUDE_SKILL_DIR}`/`${CLAUDE_PROJECT_DIR}` (and plugin vars) are substituted in the body AND in Bash rules in `allowed-tools`, enabling prompt-free bundled scripts: `allowed-tools: Bash(${CLAUDE_SKILL_DIR}/scripts/render.sh *)`.
- Indexed args use shell-style quoting (`/my-skill "hello world" second`); missing indexed placeholder stays literal; missing named placeholder → empty string; escape literal `$1` as `\$1`.
- Stacking: `/write-tests /fix-issue 123` loads both, passing `123` to each; first skill + up to five more; stops at a forked skill.

**Dynamic context injection** — [Skills: Inject dynamic context](https://code.claude.com/docs/en/skills#inject-dynamic-context)
- `` !`cmd` `` at line start or after whitespace runs before Claude sees the content; multi-line via a fenced block opened with ```` ```! ````. Output is not re-scanned.
- Runs in the session shell's cwd, stderr merged, 2-minute Bash timeout; **any non-zero exit aborts the whole invocation** (`Shell command failed for pattern "..."`), except exit 1 from search/compare commands; append `|| true` otherwise.
- Injected commands never prompt: deny rule → abort; outside auto mode anything other than "allow" → abort, so pre-approve via `allowed-tools`.
- `"disableSkillShellExecution": true` replaces commands with `[shell command execution disabled by policy]` (user/project/plugin/add-dir skills; not bundled/managed).
- Including `ultrathink` in skill content requests deeper reasoning.

**Invocation and lifecycle** — [Skills](https://code.claude.com/docs/en/skills#control-who-invokes-a-skill)
| Frontmatter | You invoke | Claude invokes | In context |
|---|---|---|---|
| default | yes | yes | description always; full body on invoke |
| `disable-model-invocation: true` | yes | no | description not in context |
| `user-invocable: false` | no | yes | description always |
- `/name args` at the start of a message runs it; `/name` mid-sentence only grants Claude permission to run it.
- Rendered SKILL.md enters as one message and **stays across turns**; not re-read; after auto-compaction the most recent invocation of each skill is re-attached keeping the first **5,000 tokens** each, combined budget **25,000 tokens** — [Skills: Skill content lifecycle](https://code.claude.com/docs/en/skills#skill-content-lifecycle)
- `allowed-tools` is NOT gated by workspace trust (applies even in `-p` in an untrusted folder); ignored when managed `allowManagedPermissionRulesOnly` is set (v2.1.282+) — [Skills](https://code.claude.com/docs/en/skills#pre-approve-tools-for-a-skill)
- Listing budget: 1% of the model's context window (`skillListingBudgetFraction`, or `SLASH_COMMAND_TOOL_CHAR_BUDGET` chars); per-entry cap `skillListingMaxDescChars` (default 1,536) — [Skills: descriptions cut short](https://code.claude.com/docs/en/skills#skill-descriptions-are-cut-short)
- Keep `SKILL.md` under 500 lines; reference supporting files via relative Markdown links — [Skills: Add supporting files](https://code.claude.com/docs/en/skills#add-supporting-files)

**`context: fork`** — [Skills: Run skills in a subagent](https://code.claude.com/docs/en/skills#run-skills-in-a-subagent)
- Starts a subagent of type `agent` with the skill content as its prompt; no conversation history. Runs in background by default (v2.1.218+), but waits in `-p`/SDK, with `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1`, etc. Backgrounded forks get the narrower background tool set and their edits are outside checkpoints (`/rewind` can't undo). Explore/Plan start without CLAUDE.md.

**Access control** — [Skills: Restrict Claude's skill access](https://code.claude.com/docs/en/skills#restrict-claude-s-skill-access)
- Permission rules: `Skill` (all), `Skill(commit)` exact, `Skill(review-pr *)` prefix; `skillOverrides` setting with values `"on"`, `"name-only"`, `"user-invocable-only"`, `"off"` (not for plugin skills); `disableBundledSkills` turns off bundled skills.
```json
{ "skillOverrides": { "legacy-context": "name-only", "deploy": "off" } }
```

**Validation / evaluation**
- `claude plugin validate .claude/skills` (or `~/.claude/skills`) finds SKILL.md files whose frontmatter doesn't parse (v2.1.233+) — [Skills: Skill not triggering](https://code.claude.com/docs/en/skills#skill-not-triggering)
- `/skill-doctor` (v2.1.252+) reports context cost and usage per skill; `/doctor` estimates listing cost — [Skills](https://code.claude.com/docs/en/skills#find-unused-skills)
- `claude plugin eval` for plugin skills (with/without-plugin baseline; `tool_used: Skill` grader); `skill-creator` plugin (`/plugin install skill-creator@claude-plugins-official`) uses `evals/evals.json` — [Skills: Evaluate](https://code.claude.com/docs/en/skills#evaluate-and-iterate-on-a-skill)

**Minimal valid examples** — [Skills](https://code.claude.com/docs/en/skills#pass-arguments-to-skills)
```markdown
---
name: fix-issue
description: Fix a GitHub issue
disable-model-invocation: true
argument-hint: [issue-number]
---
Fix GitHub issue $ARGUMENTS following our coding standards.
```
```markdown
---
name: commit
description: Stage and commit the current changes
disable-model-invocation: true
allowed-tools: Bash(git add *) Bash(git commit *) Bash(git status *)
---
```

**Agent Skills open standard (agentskills.io)** — [Specification](https://agentskills.io/specification)
- Directory: `skill-name/SKILL.md` (required) + optional `scripts/`, `references/`, `assets/`.
- Required: `name` (1-64 chars, lowercase `a-z0-9` and hyphens, no leading/trailing/consecutive hyphens, **must match parent directory name**), `description` (1-1024 chars). Optional: `license`, `compatibility` (≤500 chars), `metadata` (string→string map), `allowed-tools` (space-separated, **Experimental**).
- Progressive disclosure: metadata ~100 tokens at startup; body <5000 tokens recommended; keep SKILL.md under 500 lines; file references one level deep, relative to skill root. Validate with `skills-ref validate ./my-skill` ([skills-ref](https://github.com/agentskills/agentskills/tree/main/skills-ref)).
- Client guide recommends clients scan `<project>/.<client>/skills/`, `<project>/.agents/skills/`, `~/.<client>/skills/`, `~/.agents/skills/` — [agentskills.io client implementation](https://agentskills.io/client-implementation/adding-skills-support)
- Claude Code: "Claude Code skills follow the Agent Skills open standard ... Claude Code extends the standard with additional features like invocation control, subagent execution, and dynamic context injection"; claude.ai uploads / Skills API / `package_skill.py` accept only `name`, `description`, `license`, `compatibility`, `metadata`, `allowed-tools` and **fail with a hard error** on other keys (`Unexpected key(s) in SKILL.md frontmatter: argument-hint. Allowed properties are: ...`) — [Skills: Using skill frontmatter outside Claude Code](https://code.claude.com/docs/en/skills#using-skill-frontmatter-outside-claude-code)


**Version history (changelog)** — [Changelog](https://code.claude.com/docs/en/changelog)
- "Added support for Claude Skills": v2.0.20 (Oct 16, 2025); `context: fork` and automatic skill hot-reload: v2.1.0 (Jan 7, 2026); "Merged slash commands and skills, simplifying the mental model with no change in behavior": v2.1.3 (Jan 9, 2026).

### Inferences
- A portable method-kit skill should: use a lowercase-hyphen `name` equal to its directory, put the trigger in the first ~200 chars of `description`, and keep Claude-Code-only fields (`disable-model-invocation`, `argument-hint`, `context`, `hooks`...) out if the same SKILL.md must also be uploaded to claude.ai/API.
- Because Claude Code does not document scanning `.agents/skills/`, a cross-tool kit should install into `.claude/skills/` (symlinked skill folders are supported) or ship as a plugin.
- `allowed-tools` grants are per-turn; durable allow rules must go in settings `permissions.allow`.

### Gaps
- No official statement found on whether Claude Code warns when `name` does not match the directory name (the spec requires it; Claude Code docs treat `name` as an override).

## Subagents (.claude/agents/*.md)

### Takeaway
A subagent is a Markdown file with YAML frontmatter (`name` and `description` required, camelCase multi-word fields) whose body is the subagent's **entire system prompt** (not the Claude Code system prompt). Files live in managed settings dir > `--agents` JSON > `.claude/agents/` (walked up to repo root, recursive) > `~/.claude/agents/` > plugin `agents/`. Claude delegates automatically from the `description` (use "use proactively"), or the user forces it via `@agent-<name>`, or runs the whole session as it with `--agent`/`"agent"` setting. Each non-fork subagent starts with a fresh context (its system prompt + Claude's delegation message + CLAUDE.md hierarchy + git status + preloaded skills); Explore/Plan skip CLAUDE.md. Plugin subagents ignore `hooks`, `mcpServers`, `permissionMode`.

### Cited Findings
**Scopes and priority** — [Subagents: Choose the subagent scope](https://code.claude.com/docs/en/sub-agents#choose-the-subagent-scope)
| Location | Priority |
|---|---|
| Managed settings dir `.claude/agents/` | 1 (highest) |
| `--agents` CLI JSON | 2 |
| `.claude/agents/` (every one from cwd up to repo root; closest wins) | 3 |
| `~/.claude/agents/` | 4 |
| Plugin `agents/` | 5 (lowest) |
- Directories scanned recursively; identity comes only from frontmatter `name` (subfolder path irrelevant for project/user; for plugins `agents/review/security.md` → `my-plugin:review:security`). Duplicate names in one tree → one loaded by filesystem read order (`/doctor` reports) — [Subagents](https://code.claude.com/docs/en/sub-agents#choose-the-subagent-scope)
- `--add-dir` directories' `.claude/agents/` also load (not watched; restart after edits) — [Subagents](https://code.claude.com/docs/en/sub-agents#choose-the-subagent-scope)
- File watcher on `~/.claude/agents/` and `.claude/agents/` picks up changes within seconds; restart needed if the `agents` dir didn't exist at session start, for `--add-dir` agents, or with `--disable-slash-commands` — [Subagents: Write subagent files](https://code.claude.com/docs/en/sub-agents#write-subagent-files)
- Plugin subagents: "For security reasons, plugin subagents don't support the `hooks`, `mcpServers`, or `permissionMode` frontmatter fields"; ship hooks in `hooks/hooks.json` and servers in `.mcp.json` instead — [Subagents](https://code.claude.com/docs/en/sub-agents#choose-the-subagent-scope)

**Frontmatter reference** ("Only `name` and `description` are required"; "Multi-word field names use camelCase ... Claude Code ignores a field it doesn't recognize without reporting an error") — [Subagents: Frontmatter reference](https://code.claude.com/docs/en/sub-agents#supported-frontmatter-fields)
| Field | Values / notes |
|---|---|
| `name` | required; ≤256 chars; no `:`; must not start with `-`; hooks get it as `agent_type`; filename needn't match |
| `description` | required; when Claude should delegate |
| `tools` | allowlist, comma string `Read, Grep, Bash` or YAML list; inherit all if omitted; `Agent(worker, researcher)` restricts spawnable types (only effective for `--agent` main thread); `mcp__<server>` / `mcp__<server>__*` patterns |
| `disallowedTools` | denylist, applied before `tools`; an entry with specifier like `Bash(git push *)` still removes the whole tool; `mcp__*` removes all MCP tools |
| `model` | `sonnet`, `opus`, `haiku`, `fable`, full ID (e.g. `claude-opus-5-5`), or `inherit` |
| `permissionMode` | `default`, `acceptEdits`, `auto`, `dontAsk`, `bypassPermissions`, `plan`, `manual` (alias of default); ignored for plugin subagents; ignored when parent is in bypassPermissions/acceptEdits/auto |
| `maxTurns` | max agentic turns; output marked partial (v2.1.246+) |
| `skills` | skills whose **full content** is preloaded at startup (first 32 names); cannot preload `disable-model-invocation: true` skills |
| `mcpServers` | list of names (reuse configured server) or inline `{name: {type, command, args...}}` (stdio/http/sse/ws); inline servers from project agents need folder trust (v2.1.238+); ignored for plugin subagents |
| `hooks` | hooks scoped to this subagent; `Stop` auto-converted to `SubagentStop`; project agents' frontmatter hooks need workspace trust (and don't run in untrusted `-p`, v2.1.218+); ignored for plugin subagents |
| `memory` | `user` → `~/.claude/agent-memory/<name>/`; `project` → `.claude/agent-memory/<name>/`; `local` → `.claude/agent-memory-local/<name>/`; injects first 200 lines/25KB of that MEMORY.md and auto-enables Read/Write/Edit |
| `background` | `true` keeps it in background |
| `omitClaudeMd` | `true` → start without user/project/local CLAUDE.md (v2.1.271+) |
| `effort` | `low`, `medium`, `high`, `xhigh`, `max` |
| `isolation` | `worktree` → temporary git worktree branched from default branch; auto-cleaned if no changes |
| `color` | `red`, `blue`, `green`, `yellow`, `purple`, `orange`, `pink`, `cyan` |
| `initialPrompt` | auto-submitted first user turn when run as main session agent |
| `experimental` | map; only `cacheTtl: 5m|1h` (v2.1.248+) |
- Files silently skipped (debug log only): no `name` (treated as documentation), `---` not on first line, invalid `name`, `name` without `description`, unparseable YAML. Plugin subagents without `name` still load under their filename. Validate with `claude plugin validate .claude/agents` (v2.1.233+) — [Subagents: Subagent files Claude Code skips](https://code.claude.com/docs/en/sub-agents#subagent-files-claude-code-skips)
- Model resolution order: per-invocation `model` param > frontmatter `model` > `CLAUDE_CODE_SUBAGENT_MODEL` > main model (order changed in v2.1.251); `CLAUDE_CODE_SUBAGENT_MODEL_FORCE=1` (v2.1.257+) forces one model — [Subagents: Choose a model](https://code.claude.com/docs/en/sub-agents#choose-a-model)

Minimal example — [Subagents](https://code.claude.com/docs/en/sub-agents#write-subagent-files)
```markdown
---
name: code-reviewer
description: Reviews code for quality and best practices. Use proactively after code changes.
tools: Read, Glob, Grep
model: sonnet
---
You are a code reviewer. When invoked, analyze the code and provide
specific, actionable feedback on quality, security, and best practices.
```
`--agents` JSON form (session-only; `prompt` = body; accepts the frontmatter fields except `color`/`experimental`; in `-p` also a JSON file path, v2.1.281+):
```bash
claude --agents '{"code-reviewer":{"description":"Expert code reviewer. Use proactively after code changes.","prompt":"You are a senior code reviewer.","tools":["Read","Grep","Glob","Bash"],"model":"sonnet"}}'
```

**Built-in subagents** — [Subagents: Built-in subagents](https://code.claude.com/docs/en/sub-agents#built-in-subagents)
- `Explore`: read-only (Write/Edit denied), main model (Opus alias when main runs Fable on Anthropic API), thoroughness quick/medium/very thorough; one-shot (no agent ID, can't resume). A user/project agent named `Explore` overrides it.
- `Plan`: read-only research agent used in plan mode; inherits model.
- `general-purpose`: all subagent tools; default for `context: fork` skills and when no type given.
- Others: `claude` (catch-all, default for background sessions), `statusline-setup` (Sonnet), `claude-code-guide` (Haiku).
- Explore and Plan start **without CLAUDE.md and git status**. Disable: `permissions.deny: ["Agent(Explore)"]`, deny `Agent` entirely, `CLAUDE_CODE_DISABLE_EXPLORE_PLAN_AGENTS=1` (v2.1.198+), or in `-p`/SDK `CLAUDE_AGENT_SDK_DISABLE_BUILTIN_AGENTS=1`.
- Task tool was renamed `Agent` in v2.1.63; `Task(...)` still works as alias — [Subagents](https://code.claude.com/docs/en/sub-agents#restrict-which-subagents-can-be-spawned)

**Delegation and invocation** — [Subagents: Work with subagents](https://code.claude.com/docs/en/sub-agents#understand-automatic-delegation)
- Automatic delegation based on request, `description`, context; "include phrases like \"use proactively\""; startup warning when combined custom descriptions exceed 15,000 tokens.
- Explicit: natural language; `@"code-reviewer (agent)"` / `@agent-<name>` / `@agent-my-plugin:code-reviewer` (guarantees that subagent); `claude --agent code-reviewer` or `{"agent": "code-reviewer"}` in `.claude/settings.json` (system prompt replaces default Claude Code prompt; CLAUDE.md still loads).
- Disable specific: `{"permissions": {"deny": ["Agent(Explore)", "Agent(my-custom-agent)"]}}` or `--disallowedTools "Agent(Explore)"` — [Subagents: Disable specific subagents](https://code.claude.com/docs/en/sub-agents#disable-specific-subagents)

**Foreground/background, forks, limits** — [Subagents: Run subagents in foreground or background](https://code.claude.com/docs/en/sub-agents#run-subagents-in-foreground-or-background)
- Fork mode is ON by default in interactive sessions (v2.1.232+) → all spawned subagents run in background; OFF in `-p` and Agent SDK (then Claude chooses; foreground when it needs the result). `CLAUDE_CODE_FORK_SUBAGENT=1|0` overrides; `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` forces foreground. Ctrl+B backgrounds a running task.
- Background subagents keep all MCP tools but only built-ins `Read, Grep, Glob, LSP, Bash, PowerShell, Edit, Write, NotebookEdit, WebFetch, WebSearch, TodoWrite, Skill, ToolSearch, EnterWorktree, ExitWorktree, Monitor, TaskStop, SendMessage, Artifact` (+ `SubagentHandback`). Always removed from subagents: `AskUserQuestion`, `EndConversation`, `EnterPlanMode`, `ExitPlanMode` (unless permissionMode plan), `ScheduleWakeup`, `WaitForMcpServers`, `Workflow`, and `Agent` at depth limit — [Subagents: Available tools](https://code.claude.com/docs/en/sub-agents#available-tools)
- Fork (`/subtask <task>`, v2.1.212+; or Claude requests type `fork`) inherits full conversation, system prompt, tools, model and prompt cache; deny with `Agent(fork)` — [Subagents: Fork the current conversation](https://code.claude.com/docs/en/sub-agents#fork-the-current-conversation)
- Nesting depth default 3 (`CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH`); concurrent limit default 20 (`CLAUDE_CODE_MAX_CONCURRENT_SUBAGENTS`, v2.1.217+) — [Subagents](https://code.claude.com/docs/en/sub-agents#let-subagents-spawn-their-own-subagents)
- Resume via `SendMessage` to agent ID/name; transcripts at `~/.claude/projects/{project}/{sessionId}/subagents/agent-{agentId}.jsonl`; subagent output scanned for instruction-shaped text (v2.1.210+) — [Subagents: Resume subagents](https://code.claude.com/docs/en/sub-agents#resume-subagents)
- Non-fork subagents don't get output style or main auto memory; context window sized by subagent's model — [Subagents: What loads at startup](https://code.claude.com/docs/en/sub-agents#what-loads-at-startup)
- `--append-subagent-system-prompt` / `--append-subagent-system-prompt-file` (non-interactive; v2.1.205+/v2.1.261+) append text to every subagent prompt — [Subagents](https://code.claude.com/docs/en/sub-agents#write-subagent-files)
- Settings-level `SubagentStart`/`SubagentStop` hooks match on agent type name (plugin scoped names contain `:` so anchor regex `^my-plugin:db-agent$`) — [Subagents: Project-level hooks](https://code.claude.com/docs/en/sub-agents#project-level-hooks-for-subagent-events)


**Version history (changelog)** — [Changelog](https://code.claude.com/docs/en/changelog)
- Custom subagents + `/agents`: v1.0.60 (Jul 24, 2025); hooks in agent frontmatter: v2.1.0 (Jan 7, 2026); `memory` frontmatter field: v2.1.33 (Feb 6, 2026); `isolation: worktree`: v2.1.49-2.1.50 (Feb 19-20, 2026); Task tool renamed Agent: v2.1.63.

### Inferences
- A method kit that needs a subagent with hooks or a specific permission mode must ship it as a project/user file, not inside a plugin (plugin subagents drop those fields).
- Because fork mode puts subagents in the background by default in interactive sessions, a kit relying on tools outside the background tool set (e.g. AskUserQuestion is never available anyway) should set `background: false` on `context: fork` skills, or not depend on those tools.

### Gaps
- No documented maximum length for the subagent body/system prompt.

## Hooks (events, config, I/O contract)

### Takeaway
Hooks are configured as `{"hooks": {<Event>: [ {"matcher": "...", "hooks": [ {handler} ]} ]}}` in any settings file, a plugin's `hooks/hooks.json` (same shape, optional top-level `description`), or skill/subagent frontmatter (YAML of the same shape). Five handler types: `command`, `http`, `mcp_tool`, `prompt`, `agent` (agent = experimental). Command hooks get JSON on stdin; **exit 0** = success (stdout JSON parsed if it is exactly one JSON object), **exit 2** = blocking error (stderr becomes the reason) on events that can block, **any other exit code** = non-blocking error (action proceeds!). As of v2.1.299 there are ~30 events. Default timeout 600 s for command/http/mcp_tool.

### Cited Findings
**Event list (what fires when)** — [Hooks reference: Hook lifecycle](https://code.claude.com/docs/en/hooks#hook-lifecycle)
`SessionStart` (session begins/resumes), `Setup` (`--init-only`, or `--init`/`--maintenance` in `-p`), `UserPromptSubmit` (prompt submitted, before Claude processes it; also on turns Claude Code starts itself), `UserPromptExpansion` (user-typed command expands into a prompt; can block), `PreToolUse` (before tool call; can block), `PermissionRequest` (tool call needs permission decision), `PermissionDenied` (auto mode denies a call), `PostToolUse` (tool succeeded), `PostToolUseFailure` (tool failed), `PostToolBatch` (after a batch of parallel tool calls resolves), `Notification`, `MessageDisplay` (while assistant text is displayed; display-only), `SubagentStart`, `SubagentStop`, `TaskCreated` (via `TaskCreate`), `TaskCompleted`, `Stop` (Claude finishes responding), `StopFailure` (turn ends due to API error), `TeammateIdle` (agent team), `InstructionsLoaded` (CLAUDE.md or `.claude/rules/*.md` loaded), `ConfigChange`, `CwdChanged`, `DirectoryAdded` (`/add-dir`), `FileChanged` (watched file changes), `WorktreeCreate` (replaces default git behaviour), `WorktreeRemove`, `PreCompact`, `PostCompact`, `PreModelSwitch` (can block), `PostModelSwitch`, `Elicitation` (MCP server requests input), `ElicitationResult`, `SessionEnd`.

**Hook locations** — [Hooks reference: Hook locations](https://code.claude.com/docs/en/hooks#hook-locations)
| Location | Scope |
|---|---|
| `~/.claude/settings.json` | all your projects |
| `.claude/settings.json` | project, committable |
| `.claude/settings.local.json` | project, not shared |
| Managed policy settings | org-wide |
| Plugin `hooks/hooks.json` | when plugin enabled |
| Skill frontmatter `hooks:` | rest of the session once skill is invoked (`once: true` honoured only here) |
| Subagent frontmatter `hooks:` | while subagent runs (`Stop` → `SubagentStop`) |
- Hook entries **merge** across levels (never replace); identical handler defined in several settings files runs once; all matching hooks run **in parallel**; settings/plugin/managed hooks also fire inside subagents with `agent_id`/`agent_type` in input — [Hooks reference](https://code.claude.com/docs/en/hooks#hook-locations)
- Managed `allowManagedHooksOnly` blocks user/project/local/plugin hooks (except force-enabled managed plugins); `disableAllHooks: true` disables all non-managed hooks (one-run override: `--settings '{"disableAllHooks": true}'`); no per-hook disable; `/hooks` is a read-only browser — [Hooks reference: Disable or remove hooks](https://code.claude.com/docs/en/hooks#disable-or-remove-hooks)
- Project-skill frontmatter hooks follow the settings-file trust rule (registered even in an untrusted `-p` run); project-subagent frontmatter hooks need explicit workspace trust (v2.1.218+) — [Hooks reference: Hooks in skills and agents](https://code.claude.com/docs/en/hooks#hooks-in-skills-and-agents)

**Matcher syntax** — [Hooks reference: Matcher patterns](https://code.claude.com/docs/en/hooks#matcher-patterns)
- `"*"`, `""` or omitted → match all. Only letters/digits/`_`/`-`/spaces/`,`/`|` → exact string or list (`Edit|Write`, `Edit, Write`). Any other character → **unanchored JavaScript RegExp** (`^Notebook`, `mcp__memory__.*`; use `^Edit$` for whole-string). `FileChanged` and `StopFailure` accept only `|` as separator.
- What each event matches on: tool events (`PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`, `PermissionDenied`) → tool name; `SessionStart` → `startup|resume|clear|compact|fork`; `Setup` → `init|maintenance`; `SessionEnd` → `clear|resume|logout|prompt_input_exit|other`; `Notification` → `permission_prompt|idle_prompt|auth_success|elicitation_dialog|elicitation_url_dialog|elicitation_complete|elicitation_response|agent_needs_input|agent_completed|quota_auto_resume_fired|quota_auto_resume_stale|quota_auto_resume_disabled`; `SubagentStart`/`SubagentStop` → agent type; `PreCompact`/`PostCompact` → `manual|auto`; `Pre/PostModelSwitch` → canonical model name; `ConfigChange` → `user_settings|project_settings|local_settings|policy_settings|skills`; `DirectoryAdded` → `slash_command|register_repo_root`; `FileChanged` → literal filenames (`.envrc|.env`); `StopFailure` → `rate_limit|overloaded|authentication_failed|oauth_org_not_allowed|account_on_hold|billing_error|invalid_request|model_not_found|server_error|max_output_tokens|cloud_credential_error|unknown`; `InstructionsLoaded` → `session_start|nested_traversal|path_glob_match|include|compact`; `UserPromptExpansion` → command name; `Elicitation`/`ElicitationResult` → MCP server name.
- **No matcher support** (matcher silently ignored): `UserPromptSubmit`, `PostToolBatch`, `Stop`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`, `WorktreeCreate`, `WorktreeRemove`, `MessageDisplay`, `CwdChanged`.
- MCP tools are named `mcp__<server>__<tool>`; matching a whole server needs `mcp__memory__.*` (bare `mcp__memory` is an exact string and matches nothing); plugin MCP tools are `mcp__plugin_<plugin-name>_<server-name>__<tool>` — [Hooks reference: Match MCP tools](https://code.claude.com/docs/en/hooks#match-mcp-tools)

**Handler fields** — [Hooks reference: Hook handler fields](https://code.claude.com/docs/en/hooks#hook-handler-fields)
- Common: `type` (required: `command|http|mcp_tool|prompt|agent`), `if` (one permission rule like `"Bash(git *)"`, `"Edit(*.ts)"`; only evaluated on tool events — on other events a hook with `if` never runs; best-effort, not a security boundary), `timeout` (seconds; defaults 600 command/http/mcp_tool, 30 prompt, 60 agent; lowered to 30 on UserPromptSubmit/PreModelSwitch/PostModelSwitch, 10 on MessageDisplay; SessionEnd hooks share 1.5 s budget, raisable to 60), `statusMessage`, `once` (skill frontmatter only).
- Command: `command` (required), `args` (exec form, no shell; recommended when using path placeholders), `async`, `asyncRewake` (background; wakes Claude on exit 2), `shell` (`bash` default, `powershell`), `onFailure` (`continue` default | `block`; v2.1.295+).
- Shell form runs via `sh -c` (macOS/Linux), Git Bash on Windows, or PowerShell if no Git Bash. Exec form on Windows needs a real `.exe` (use `node script.js` instead of `.cmd` shims) — [Hooks reference: Exec form and shell form](https://code.claude.com/docs/en/hooks#exec-form-and-shell-form)
- HTTP: `url`, `headers` (with `$VAR` interpolation), `allowedEnvVars`, `onFailure`; JSON input is POSTed; non-2xx/connection failure = non-blocking; to block return 2xx + JSON decision.
- MCP tool: `server` (plugin servers as `plugin:<plugin-name>:<server-name>`), `tool`, `input` (with `${tool_input.file_path}` substitution); not available on launch-time `SessionStart` or `Setup`.
- Prompt/agent: `prompt` (`$ARGUMENTS` = hook input JSON), `model`.
- Path placeholders: `${CLAUDE_PROJECT_DIR}` (project root where session started; stays put when Claude enters a worktree — read `cwd` from input instead), `${CLAUDE_PLUGIN_ROOT}`, `${CLAUDE_PLUGIN_DATA}`; all three also exported as env vars to the hook process. Plugin exec-form hooks substitute `${user_config.*}`; shell-form must use `$CLAUDE_PLUGIN_OPTION_<KEY>` — [Hooks reference: Reference scripts by path](https://code.claude.com/docs/en/hooks#reference-scripts-by-path)
- Hooks run without a controlling terminal (no `/dev/tty`); use `systemMessage` or `terminalSequence` (OSC 0/1/2/9/99/777, BEL) for user-visible output; `$CLAUDE_CODE_REMOTE` is `"true"` in remote web environments; no `$CLAUDE_MODEL` env var; `$CLAUDE_EFFORT` is set — [Hooks reference](https://code.claude.com/docs/en/hooks#hook-input-and-output)

**Common stdin fields** — [Hooks reference: Common input fields](https://code.claude.com/docs/en/hooks#common-input-fields)
`session_id`, `prompt_id`, `transcript_path` (written async, may lag), `cwd`, `scratchpad_dir` (v2.1.257+), `permission_mode` (`default|plan|acceptEdits|auto|dontAsk|bypassPermissions`; not on all events), `effort` (`{"level": ...}`), `hook_event_name`, plus `agent_id`/`agent_type` inside subagents or with `--agent`. Example PreToolUse input:
```json
{"session_id":"abc123","prompt_id":"550e8400-...","transcript_path":"/home/user/.claude/projects/.../transcript.jsonl","cwd":"/home/user/my-project","permission_mode":"default","hook_event_name":"PreToolUse","tool_name":"Bash","tool_input":{"command":"npm test","description":"Run test suite","timeout":120000,"run_in_background":false},"tool_use_id":"toolu_01ABC123..."}
```

**Exit-code contract** — [Hooks reference: Exit code output](https://code.claude.com/docs/en/hooks#exit-code-output)
| Stdout | Exit 0 | Exit 2 | Other |
|---|---|---|---|
| valid JSON object | success, fields apply | blocking; fields read but can't override block (even `allow`) | success; exit code ignored, fields decide (failure under `onFailure: block`) |
| unparseable/invalid JSON | non-blocking error | blocking; stderr is reason | non-blocking error |
| plain text / nothing | success | blocking; stderr is reason | non-blocking error (first stderr line shown) |
- "Without valid JSON on stdout, Claude Code treats exit code 1 as a non-blocking error ... If your hook is meant to enforce a policy, use `exit 2`." — [Hooks reference: Other exit codes](https://code.claude.com/docs/en/hooks#other-exit-codes)
- Stdout on exit 0 goes to debug log only, **except** `UserPromptSubmit`, `UserPromptExpansion`, `SessionStart`, `PostModelSwitch`, where plain-text stdout is added as context for Claude. Claude never sees stderr of an exit-0 hook — [Hooks reference: Exit code 0](https://code.claude.com/docs/en/hooks#exit-code-0)
- Stdout is parsed as JSON only when the whole output is one JSON object (shell-profile echo lines break it) — [Hooks reference: JSON output](https://code.claude.com/docs/en/hooks#json-output)
- A timed-out command/http/mcp_tool `PreToolUse` hook does **not** block (unless `onFailure: "block"`); timed-out `PreModelSwitch` blocks — [Hooks reference: Timeouts](https://code.claude.com/docs/en/hooks#timeouts)
- Exit 2 per event: blocks `PreToolUse`, `UserPromptSubmit` (prompt never reaches Claude), `UserPromptExpansion`, `Stop`/`SubagentStop`/`TeammateIdle` (keeps working), `TaskCreated` (rolls back), `TaskCompleted`, `ConfigChange` (except policy), `PostToolBatch` (stops loop), `PreCompact`, `PreModelSwitch`, `Elicitation`/`ElicitationResult` (decline), `WorktreeCreate`/`WorktreeRemove` (any non-zero fails). Not blocking: `PermissionRequest` (use JSON decision), `PostToolUse`/`PostToolUseFailure` (stderr shown to Claude), `StopFailure`, `PermissionDenied`, `Notification`, `Setup`, `InstructionsLoaded` (ignored), `SubagentStart`/`SessionStart`/`SessionEnd`/`CwdChanged`/`FileChanged`/`PostCompact`/`PostModelSwitch` (stderr to user only), `DirectoryAdded` (debug log), `MessageDisplay` — [Hooks reference: Exit code 2 behavior per event](https://code.claude.com/docs/en/hooks#exit-code-2-behavior-per-event)
- Blocked PreToolUse message seen by Claude: `PreToolUse:Bash hook error: [<command>]: <stderr>` — [Hooks reference: Exit code 2](https://code.claude.com/docs/en/hooks#exit-code-2)

**JSON output fields** — [Hooks reference: JSON output](https://code.claude.com/docs/en/hooks#json-output)
- Universal: `continue` (default `true`; `false` stops Claude entirely, overrides decisions), `stopReason`, `suppressOutput` (accepted, **no effect**), `systemMessage` (warning to user), `terminalSequence`.
- `additionalContext`, `systemMessage`, `initialUserMessage` and plain stdout are each capped at **10,000 characters** (over → saved to file, path + 2,000-char preview).
- `additionalContext` (inside `hookSpecificOutput` with `hookEventName`) is wrapped in a system reminder at the point the hook fired; write it as factual statements, not imperative "system" commands (can trigger prompt-injection defenses) — [Hooks reference: Add context for Claude](https://code.claude.com/docs/en/hooks#add-context-for-claude)
- Decision patterns: top-level `{"decision": "block", "reason": "..."}` for UserPromptSubmit, UserPromptExpansion, PostToolUse, PostToolUseFailure, PostToolBatch, Stop, SubagentStop, ConfigChange, PreCompact (only value is `"block"`); `hookSpecificOutput.permissionDecision` `allow|deny|ask|defer` + `permissionDecisionReason` (+ `updatedInput`, `additionalContext`) for PreToolUse; `hookSpecificOutput.decision.behavior` `allow|deny` (+ `updatedInput`) for PermissionRequest; `updatedToolOutput` for PostToolUse; `retry: true` for PermissionDenied; WorktreeCreate prints a path; SessionStart/SubagentStart/PostModelSwitch context only (SessionStart also `initialUserMessage`, `watchPaths`, `sessionTitle`, `reloadSkills`) — [Hooks reference: Decision control](https://code.claude.com/docs/en/hooks#decision-control)

Minimal examples — [Hooks reference](https://code.claude.com/docs/en/hooks#how-a-hook-resolves)
```json
{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[{"type":"command","if":"Bash(rm *)","command":"${CLAUDE_PROJECT_DIR}/.claude/hooks/block-rm.sh","args":[]}]}]}}
```
```bash
#!/bin/bash
# .claude/hooks/block-rm.sh  (chmod +x)
COMMAND=$(jq -r '.tool_input.command')
if echo "$COMMAND" | grep -q 'rm -rf'; then
  jq -n '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:"Destructive command blocked by hook"}}'
else
  exit 0
fi
```
Plugin `hooks/hooks.json`:
```json
{"description":"Automatic code formatting","hooks":{"PostToolUse":[{"matcher":"Write|Edit","hooks":[{"type":"command","command":"${CLAUDE_PLUGIN_ROOT}/scripts/format.sh","args":[],"timeout":30}]}]}}
```

**Per-event details (selected, kit-relevant)**
- `SessionStart` — only `command` and `mcp_tool` types; matcher `startup|resume|clear|compact|fork`; input adds `source`, optional `model`, `agent_type`, `session_title` (+ cache-cost fields on resume, v2.1.251+); output `hookSpecificOutput.additionalContext`, `initialUserMessage` (`-p` only), `sessionTitle`, `watchPaths` (absolute paths for FileChanged), `reloadSkills: true` (re-scan skill dirs after hooks; needed when a hook installs skills); plain-text stdout is added as context; `CLAUDE_ENV_FILE` lets it append `export` lines persisted into later Bash commands (also available in Setup, CwdChanged, FileChanged); interactive SessionStart hooks run in the background but Claude's first response waits for them — [Hooks reference: SessionStart](https://code.claude.com/docs/en/hooks#sessionstart)
- `Setup` — fires only for `claude --init-only`, `claude -p --init`, `claude -p --maintenance` (matchers `init`, `maintenance`); can't block, JSON discarded; `--init-only` runs Setup + SessionStart(startup) then exits; verify with `claude --debug-file <path> --init-only` — [Hooks reference: Setup](https://code.claude.com/docs/en/hooks#setup)
- `InstructionsLoaded` — input `file_path`, `memory_type` (`User|Project|Local|Managed`), `load_reason` (`session_start|nested_traversal|path_glob_match|include|compact`), `globs`, `trigger_file_path`, `parent_file_path`; observability only; doesn't fire for AGENTS.md read directly — [Hooks reference: InstructionsLoaded](https://code.claude.com/docs/en/hooks#instructionsloaded)
- `UserPromptSubmit` — input `prompt` (+`session_title`); default timeout 30 s; also fires for scheduled tasks, background-subagent reports, cross-session messages; plain stdout or `additionalContext` injected as a system reminder; block with `{"decision":"block","reason":"..."}` (reason shown to user, not Claude) or exit 2; `hookSpecificOutput.sessionTitle`, `suppressOriginalPrompt` — [Hooks reference: UserPromptSubmit](https://code.claude.com/docs/en/hooks#userpromptsubmit)
- `UserPromptExpansion` — fires when a user types `/skill` directly (which bypasses `PreToolUse` on the `Skill` tool); input `expansion_type` (`slash_command|mcp_prompt`), `command_name`, `command_args`, `command_source`, `prompt`; matcher on command name — [Hooks reference: UserPromptExpansion](https://code.claude.com/docs/en/hooks#userpromptexpansion)
- `PreToolUse` — input `tool_name`, `tool_input`, `tool_use_id` (+`mcp_server` {name, source} for MCP tools, v2.1.274+); file tool paths always absolute (backslashes on Windows); does NOT fire for `@`-referenced files (use `Read` deny rules) nor `EndConversation`. Output `hookSpecificOutput.permissionDecision`: `allow` (skips prompt, but deny/ask rules still evaluated), `deny`, `ask` (prompt labelled `[settings]`/`[plugin:<name>]`/`[skill]`; forces prompt even in auto mode), `defer` (only in `-p`; exits with `stop_reason: "tool_deferred"` and `deferred_tool_use`; resume with `claude -p --resume <id>`); `permissionDecisionReason`; `updatedInput` (replaces entire input); `additionalContext`. Multiple hooks: `deny` > `defer` > `ask` > `allow`. Top-level `decision`/`reason` deprecated for PreToolUse (`approve`/`block` map to allow/deny). `AskUserQuestion`/`ExitPlanMode` need `allow` + `updatedInput` (with `answers`) — [Hooks reference: PreToolUse](https://code.claude.com/docs/en/hooks#pretooluse)
- Tool input shapes: Bash `{command, description, timeout, run_in_background}`; PowerShell same; Write `{file_path, content}`; Edit `{file_path, old_string, new_string, replace_all}`; Read `{file_path, offset, limit}`; Glob `{pattern, path}`; Grep `{pattern, path, glob, output_mode, -i, multiline}`; WebFetch `{url, prompt, offset}`; WebSearch `{query, allowed_domains, blocked_domains}`; Agent `{prompt, description, subagent_type, model}`; ExitPlanMode gets injected `plan`, `planFilePath` — [Hooks reference: PreToolUse input](https://code.claude.com/docs/en/hooks#pretooluse-input)
- On Windows, match `Bash|PowerShell` — on Windows without Git Bash the Bash tool isn't registered at all, so a `Bash`-only hook never fires — [Hooks reference: PowerShell](https://code.claude.com/docs/en/hooks#powershell)
- `PermissionRequest` — only when a prompt would be shown (or auto-deny in non-promptable sessions); exit 2 not honoured; output `hookSpecificOutput.decision` `{behavior: "allow"|"deny", updatedInput, updatedPermissions, message, interrupt}`; permission update entries `addRules|replaceRules|removeRules|setMode|addDirectories|removeDirectories` with `destination` `session|localSettings|projectSettings|userSettings` — [Hooks reference: PermissionRequest](https://code.claude.com/docs/en/hooks#permissionrequest)
- `PostToolUse` — input adds `tool_response`, `duration_ms`; output `decision: "block"` + `reason` (adds reason next to result), `additionalContext`, `updatedToolOutput` (must match tool's output shape, e.g. Bash `{stdout, stderr, interrupted, isImage}`), `updatedMCPToolOutput`, `classifierContext` (v2.1.236+). Not fired when Bash or external processes rewrite a file (use `FileChanged`). Foreground `Agent` calls expose `tool_response.{status, agentId, content, resolvedModel, totalTokens, totalDurationMs, totalToolUseCount, usage}` — [Hooks reference: PostToolUse](https://code.claude.com/docs/en/hooks#posttooluse)
- `Notification` — input `message`, `title`, `notification_type`; can't block; `terminalSequence` still emitted — [Hooks reference: Notification](https://code.claude.com/docs/en/hooks#notification)
- `SubagentStart` — input `agent_id`, `agent_type`; can't block; `additionalContext` injected into the subagent — [Hooks reference: SubagentStart](https://code.claude.com/docs/en/hooks#subagentstart)
- `SubagentStop` — input `stop_hook_active`, `agent_id`, `agent_type`, `agent_transcript_path`, `last_assistant_message`, `background_tasks`, `session_crons`; same decision format as Stop (`decision: "block"` keeps subagent running with `reason` as next instruction); also fires for internal agents (empty `agent_type`) — [Hooks reference: SubagentStop](https://code.claude.com/docs/en/hooks#subagentstop)
- `Stop` — not on user interrupt (API errors fire `StopFailure`); input `stop_hook_active`, `last_assistant_message`, `background_tasks`, `session_crons`; `{"decision":"block","reason":"..."}` keeps Claude working (reason required), or `hookSpecificOutput.additionalContext` for non-error feedback; **8-consecutive-continuation cap** (`CLAUDE_CODE_STOP_HOOK_BLOCK_CAP`), reset when Claude calls a tool; check `stop_hook_active` to avoid loops; `/goal` is a built-in session-scoped prompt Stop hook — [Hooks reference: Stop](https://code.claude.com/docs/en/hooks#stop)
- `PreCompact` — matcher `manual|auto`; input `trigger`, `custom_instructions`; exit 2 or `decision: "block"` blocks compaction. `PostCompact` — input `trigger`, `compact_summary`; no decision — [Hooks reference: PreCompact](https://code.claude.com/docs/en/hooks#precompact)
- `SessionEnd` — `reason` `clear|resume|logout|prompt_input_exit|other` (`bypass_permissions_disabled` removed v2.1.234); no decision; **1.5 s default budget** (raise via per-hook `timeout` up to 60 s or `CLAUDE_CODE_SESSIONEND_HOOKS_TIMEOUT_MS`) — [Hooks reference: SessionEnd](https://code.claude.com/docs/en/hooks#sessionend)

**Hook types per event** — [Hooks reference: Prompt-based hooks](https://code.claude.com/docs/en/hooks#prompt-based-hooks)
- All five types: `PermissionDenied`, `PostToolBatch`, `PostToolUse`, `PostToolUseFailure`, `PreToolUse`, `Stop`, `SubagentStop`, `TaskCompleted`, `TaskCreated`, `TeammateIdle`, `UserPromptExpansion`, `UserPromptSubmit`. `PermissionRequest`: all except `agent`. Only command/http/mcp_tool: `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `Elicitation`, `ElicitationResult`, `FileChanged`, `InstructionsLoaded`, `MessageDisplay`, `Notification`, `PostCompact`, `PostModelSwitch`, `PreCompact`, `PreModelSwitch`, `SessionEnd`, `StopFailure`, `SubagentStart`, `WorktreeCreate`, `WorktreeRemove`. `SessionStart`/`Setup`: command and mcp_tool only.
- Prompt hook: `{"type":"prompt","prompt":"... $ARGUMENTS ...","model":?,"timeout":30,"continueOnBlock":false}`; model must answer `{"ok": true|false, "reason": "...", "impossible": true|false}`; on Stop/SubagentStop `ok:false` feeds reason back (unless `impossible`).
- Agent hook (**experimental**): same fields, 60 s default, up to 50 turns with Read/Grep/Glob etc., no `continueOnBlock` — [Hooks reference: Agent-based hooks](https://code.claude.com/docs/en/hooks#agent-based-hooks)
- Async: `"async": true` (command only) — can't block; `additionalContext`/`systemMessage` delivered next turn; killed at `-p` teardown; `asyncRewake` wakes Claude on exit 2 — [Hooks reference: Run hooks in the background](https://code.claude.com/docs/en/hooks#run-hooks-in-the-background)

**Security / trust** — [Hooks reference: Workspace trust](https://code.claude.com/docs/en/hooks#workspace-trust)
- Interactive: hooks from every settings file (even `~/.claude/settings.json`) are held back until the workspace trust dialog is accepted. `-p`/SDK: never shows the dialog and **treats the folder as trusted**, so a repo's `.claude/settings.json` hooks run. Mitigations: `--bare`, `--settings '{"disableAllHooks": true}'`.

**Windows** — [Hooks reference: Windows PowerShell tool](https://code.claude.com/docs/en/hooks#windows-powershell-tool)
- `"shell": "powershell"` (auto-detects `pwsh.exe`, falls back to `powershell.exe`); placeholders rewritten to `${env:NAME}`; never write bare `$CLAUDE_PROJECT_DIR` in PowerShell; example `"command": "& \"$env:CLAUDE_PROJECT_DIR\\.claude\\hooks\\check.ps1\""`.

**Debugging** — [Hooks reference: Debug hooks](https://code.claude.com/docs/en/hooks#debug-hooks)
- `claude --debug-file <path>` or `claude --debug` (log at `~/.claude/debug/<session-id>.txt`; doesn't print to terminal); v2.1.296+ logs `Hooks: PostToolUse:Write [<cmd>] finished with status 0 (31ms)`; `CLAUDE_CODE_DEBUG_LOG_LEVEL=verbose` for matcher details.


**Version history (changelog)** — [Changelog](https://code.claude.com/docs/en/changelog)
- Hooks released: v1.0.38 (Jun 30, 2025); Stop split into Stop/SubagentStop: v1.0.41 (Jul 3, 2025); SessionStart: v1.0.62 (Jul 28, 2025); HTTP hooks: v2.1.63 (Feb 28, 2026); PermissionDenied: v2.1.89 (Apr 1, 2026); `onFailure`: v2.1.295 (per hooks reference).

**Real-world example (official marketplace)** — `plugins/hookify/hooks/hooks.json` in anthropics/claude-plugins-official uses matcher-less groups — [hookify hooks.json](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/hookify/hooks/hooks.json):
```json
{"description": "Hookify plugin - User-configurable hooks from .local.md files",
 "hooks": {"PreToolUse": [{"hooks": [{"type": "command", "command": "python3 \"${CLAUDE_PLUGIN_ROOT}/hooks/pretooluse.py\"", "timeout": 10}]}],
           "PostToolUse": ["..."], "Stop": ["..."], "UserPromptSubmit": ["..."]}}
```

### Inferences
- For a kit's enforcement hooks: always `exit 2` (never `exit 1`) or exit 0 with a JSON deny, set `"onFailure": "block"` (v2.1.295+) so a broken script fails closed, prefer exec form with `${CLAUDE_PROJECT_DIR}`/`${CLAUDE_PLUGIN_ROOT}` in `args`, and keep stdout clean of shell-profile output.

- Plugin hooks merge with user/project hooks and inherit no special trust beyond the plugin's own install; project-skill hook trust is laxer than project-subagent hook trust, so a kit that must run hooks in untrusted `-p` CI should put them in a skill or in settings rather than in a project subagent's frontmatter.

### Gaps
- Input/decision schemas for the less common events (`PostToolUseFailure`, `PostToolBatch`, `PermissionDenied`, `TaskCreated`, `TaskCompleted`, `TeammateIdle`, `ConfigChange`, `CwdChanged`, `DirectoryAdded`, `FileChanged`, `WorktreeCreate`, `WorktreeRemove`, `Pre/PostModelSwitch`, `Elicitation`, `ElicitationResult`, `MessageDisplay`, `StopFailure`) were listed but not transcribed field by field; they are in the hooks reference at https://code.claude.com/docs/en/hooks#hook-events.

## Settings and permissions

### Takeaway
Settings are strict-JSON files (no comments/trailing commas) with precedence **managed > `--settings` (command line) > `.claude/settings.local.json` > `.claude/settings.json` > `~/.claude/settings.json`**; scalar keys take the highest value, list keys such as `permissions.allow` merge. Permission rules are `Tool` or `Tool(specifier)`, evaluated **deny → ask → allow** (first match wins, any scope's deny beats any allow). Several keys are ignored or delayed in a repository's `.claude/settings.json`: `permissions.allow`, `additionalDirectories`, `extraKnownMarketplaces` and most `env` wait for workspace trust; `defaultMode: "auto"`/`"bypassPermissions"` never take effect from project/local files. Validate with the published schema `https://json.schemastore.org/claude-code-settings.json`, `/status` and `claude doctor`.

### Cited Findings
**Files and precedence** — [Settings](https://code.claude.com/docs/en/settings#settings-precedence)
1. Managed (`managed-settings.json` + `managed-settings.d/*.json` in `/Library/Application Support/ClaudeCode/` (macOS), `/etc/claude-code/` (Linux/WSL), `C:\Program Files\ClaudeCode\` (Windows); MDM plist domain `com.anthropic.claudecode`; `HKLM\SOFTWARE\Policies\ClaudeCode` value `Settings`; server-managed from claude.ai console) — [Managed settings](https://code.claude.com/docs/en/managed-settings)
2. Command line `--settings <file-or-json>` (one session)
3. Project local `.claude/settings.local.json` (Claude Code adds `**/.claude/settings.local.json` to global git excludes when it first writes it; read/written at the git repo root since v2.1.211, main checkout root in worktrees)
4. Shared project `.claude/settings.json` (read from the session's primary working directory — no parent fallback)
5. User `~/.claude/settings.json` (`%USERPROFILE%\.claude` on Windows; relocatable with `CLAUDE_CONFIG_DIR`)
- `~/.claude.json` is Claude Code's own state file (sign-in, MCP server configs for user/local scope, per-project trust, global config keys) — [Settings](https://code.claude.com/docs/en/settings#find-or-create-your-settings-files)
- "Lists merge instead of overriding" (exceptions: `fallbackModel`, `modelPicker`, managed `availableModels`, `modelSettings`) — [Settings](https://code.claude.com/docs/en/settings#lists-merge-instead-of-overriding)
- Env vars are not a precedence level; each var/key pair decides (e.g. `ANTHROPIC_MODEL` beats `model`) — [Settings](https://code.claude.com/docs/en/settings#settings-precedence)
- Files are watched and most edits (incl. `permissions`, `hooks`) apply mid-session; `model`, `effortLevel` read once at start — [Settings: When edits take effect](https://code.claude.com/docs/en/settings#when-edits-take-effect)
- Broken file → interactive "Settings Error" dialog; bad individual entries → "Settings Warning" and skipped; `-p` silently skips (check `claude doctor`); `/status` "Setting sources" line lists loaded files — [Settings: Fix a broken settings file](https://code.claude.com/docs/en/settings#fix-a-broken-settings-file)
- A committed key may never reach teammates if its Scope is `User`, `User or managed`, `Managed`, or `Global config`; and `permissions.allow`, `permissions.additionalDirectories`, `extraKnownMarketplaces`, most `env` values apply only after each teammate trusts the folder (deny/ask apply immediately) — [Settings: A committed key doesn't reach teammates](https://code.claude.com/docs/en/settings#a-committed-key-doesn-t-reach-teammates)
- Minimal file with schema:
```json
{
  "$schema": "https://json.schemastore.org/claude-code-settings.json",
  "permissions": {
    "allow": ["Bash(npm run lint)", "Bash(npm run test *)"],
    "deny": ["Read(./.env)", "Read(./.env.*)"]
  }
}
```
(The schema "can lag behind the newest CLI releases") — [Settings: Edit a settings file](https://code.claude.com/docs/en/settings#edit-a-settings-file)

**Permission rules** — [Permissions](https://code.claude.com/docs/en/permissions#permission-rule-syntax)
- Arrays: `permissions.allow`, `permissions.ask`, `permissions.deny`; also `permissions.defaultMode`, `permissions.additionalDirectories`, `permissions.disableBypassPermissionsMode: "disable"`, `permissions.disableAutoMode: "disable"`, `permissions.blockReadsOutsideWorkingDirectories` — [Settings reference index](https://code.claude.com/docs/en/settings-reference#settings-index)
- Order: deny, then ask, then allow; "An allow rule can't carve an exception out of a deny rule"; a bare-tool deny (e.g. `Bash`) removes the tool from Claude's context — [Permissions: Manage permissions](https://code.claude.com/docs/en/permissions#manage-permissions)
- Syntax: `Bash` = `Bash(*)` (all); `Bash(npm run build)` exact; `Bash(npm run *)` prefix (space before `*` matters: `Bash(ls *)` doesn't match `lsof`; trailing ` *` also matches bare command); `Bash(ls:*)` legacy equivalent of trailing ` *`; put `*` after the subcommand (startup warning for `Bash(git * main)` style allow rules) — [Permissions: Wildcard patterns](https://code.claude.com/docs/en/permissions#wildcard-patterns)
- Compound commands split on `&&`, `||`, `;`, `|`, `|&`, `&`, newlines; each subcommand must match an allow rule; deny/ask match any subcommand incl. `$()`; wrappers `timeout`, `time`, `nice`, `nohup`, `stdbuf`, `command`, `builtin`, `noglob`, bare `xargs` stripped; `npx`, `docker exec`, `devbox run` etc. not stripped — [Permissions: Bash](https://code.claude.com/docs/en/permissions#bash)
- Bash deny rules are not a security boundary (`/usr/bin/curl`, `sh -c '...'`, `git -C . push` bypass them); use sandboxing or PreToolUse hooks — [Permissions: What a Bash rule doesn't match](https://code.claude.com/docs/en/permissions#bash-rule-limits)
- Parameter rules (deny/ask only) `Tool(param:value)`: `Agent(model:opus)`, `Agent(isolation:worktree)`, `Bash(run_in_background:true)`; not for primary fields like `command`/`file_path` — [Permissions: Match by input parameter](https://code.claude.com/docs/en/permissions#match-by-input-parameter)
- Tool-name globs: deny/ask accept `"*"`, `"mcp__*"`; allow globs only after a literal `mcp__<server>__` prefix (e.g. `mcp__github__get_*`) — [Permissions: Tool name wildcards](https://code.claude.com/docs/en/permissions#tool-name-wildcards)
- Read/Edit rules use gitignore syntax: `//path` absolute, `~/path` home, `/path` relative to the **settings source** (project settings → primary working dir; user settings → `~/.claude/`), `path`/`./path` relative to cwd; `Read(.env)` ≡ `Read(**/.env)`; single-segment `src/**` matches any depth only in deny/ask; `!` negation carves out within the same source; only `Edit(...)` and `Read(...)` path rules are consulted (`Write(...)` path rules are ignored with a warning, v2.1.210+); `.claudeignore` has no effect — [Permissions: Read and Edit](https://code.claude.com/docs/en/permissions#read-and-edit)
- Other forms: `WebFetch(domain:example.com)`, `WebFetch(domain:*.example.com)`; `mcp__puppeteer`, `mcp__puppeteer__*`, `mcp__puppeteer__puppeteer_navigate`; `Agent(Explore)`; `Skill(name)`/`Skill(name *)`; `Cd(~/code/**)` for `/cd` — [Permissions: Tool-specific permission rules](https://code.claude.com/docs/en/permissions#tool-specific-permission-rules)
- PreToolUse hook decisions don't bypass deny/ask rules; a hook exiting 2 blocks even when an allow rule matches — [Permissions: Extend permissions with hooks](https://code.claude.com/docs/en/permissions#extend-permissions-with-hooks)
- `--add-dir` grants file access and loads that dir's `.claude/skills/`, `.claude/commands/`, `.claude/agents/`, and only `enabledPlugins`/`extraKnownMarketplaces` from its settings; `permissions.additionalDirectories` grants file access only — [Permissions: Additional directories](https://code.claude.com/docs/en/permissions#additional-directories-grant-file-access-not-configuration)
- Workspace trust: interactive sessions show the trust dialog; `-p`/SDK never shows it — repo hooks, `env`, skill `allowed-tools` are **used**, but `.claude/settings.json` `permissions.allow` and `additionalDirectories` are **not used** (stderr warning `this workspace has not been trusted`), project-subagent frontmatter hooks, `@skills-dir` plugins, and repo `extraKnownMarketplaces` are not used, `.mcp.json` servers connect without asking. Manual trust: `projects["<path>"].hasTrustDialogAccepted: true` in `~/.claude.json` — [Permissions: What runs before you trust a folder](https://code.claude.com/docs/en/permissions#what-runs-before-you-trust-a-folder)

**Permission modes (`defaultMode` values)** — [Permission modes](https://code.claude.com/docs/en/permission-modes#available-modes), [Settings reference: permissions.defaultMode](https://code.claude.com/docs/en/settings-reference#permissions-defaultmode)
| Mode | Runs without asking |
|---|---|
| `default` (UI "Manual"; alias `manual`) | reads only |
| `acceptEdits` | reads, file edits, `mkdir`, `touch`, `rm`, `rmdir`, `mv`, `cp`, `sed` within working dirs |
| `plan` | reads (+ classifier-approved commands when auto mode available) |
| `auto` | everything, with background classifier checks |
| `dontAsk` | reads in working dirs + pre-approved tools; everything else denied (CI) |
| `bypassPermissions` | everything (isolated containers/VMs only) |
- Session start mode: `--permission-mode`/`--dangerously-skip-permissions` > `permissions.defaultMode` > built-in default (`auto` in terminal from v2.1.283; `default` for `claude -p` in sessions that fetch feature flags). `"auto"`/`"bypassPermissions"` in `.claude/settings.json` or `.claude/settings.local.json` don't take effect — [Permission modes: Which mode a session starts in](https://code.claude.com/docs/en/permission-modes#which-mode-a-session-starts-in)
- Deny rules block in every mode incl. bypass; never auto-approved in any mode: explicit ask rules, `AskUserQuestion`, MCP `requiresUserInteraction` tools, `rm`/`rmdir` of critical paths — [Permission modes](https://code.claude.com/docs/en/permission-modes#actions-no-mode-auto-approves)
- Protected paths (writes never auto-approved except bypass): `.git`, `.config/git`, `.vscode`, `.idea`, `.husky`, `.cargo`, `.devcontainer`, `.yarn`, `.mvn`, `.claude` (exceptions incl. `.claude/worktrees/`, plan files); `permissions.allow` such as `Edit(.claude/**)` does not pre-approve them — [Permission modes: Protected paths](https://code.claude.com/docs/en/permission-modes#protected-paths)
- `Shift+Tab` cycles modes (`default` → `acceptEdits` → `plan` → optional bypass/auto) — [Permission modes: Switch permission modes](https://code.claude.com/docs/en/permission-modes#switch-permission-modes)

**Sandbox** — [Settings reference: Sandbox settings](https://code.claude.com/docs/en/settings-reference#sandbox-enabled)
- `{"sandbox": {"enabled": true}}` sandboxes Bash (macOS, Linux, WSL2; Linux needs `bubblewrap` + `socat`); falls back to unsandboxed unless `sandbox.failIfUnavailable: true`. Sub-keys: `autoAllowBashIfSandboxed` (default true), `allowUnsandboxedCommands`, `excludedCommands`, `filesystem.{allowRead,allowWrite,denyRead,denyWrite}`, `network.{allowedDomains,deniedDomains,allowLocalBinding,allowUnixSockets,httpProxyPort,socksProxyPort,strictAllowlist}`, `credentials.{envVars,files}`, `enableWeakerNestedSandbox`, `ignoreViolations`. Permissions and sandbox paths/domains merge into the final sandbox config; `WebFetch(domain:...)` rules also feed the sandbox network list — [Permissions: How permissions interact with sandboxing](https://code.claude.com/docs/en/permissions#how-permissions-interact-with-sandboxing)

**Other kit-relevant keys** — [Settings reference](https://code.claude.com/docs/en/settings-reference#settings-index)
- `env`: `{"env": {"DISABLE_AUTO_COMPACT": "1"}}`; project/local `env` applies after trust (or at startup in `-p`); project/local can't set `CLAUDE_CONFIG_DIR`, `HOME`, `TMPDIR`, `XDG_*` etc. — [Settings reference: env](https://code.claude.com/docs/en/settings-reference#env)
- `statusLine`: `{"type": "command", "command": "...", "padding": 2, "refreshInterval": <s≥1>, "hideVimModeIndicator": bool}`; receives session JSON on stdin (e.g. `.model.display_name`, `.context_window.used_percentage`); `subagentStatusLine` similar — [Settings reference: statusLine](https://code.claude.com/docs/en/settings-reference#statusline)
- `outputStyle`: name of built-in (e.g. `"Explanatory"`, `"Learning"`) or custom style; mid-session change applies from next message (v2.1.251+) — [Settings reference: outputStyle](https://code.claude.com/docs/en/settings-reference#outputstyle)
- `agent` (start every session as a named subagent), `hooks`, `disableAllHooks`, `enabledPlugins`, `extraKnownMarketplaces`, `skillOverrides`, `disableSkillShellExecution`, `claudeMdExcludes`, `autoMemoryEnabled`, `autoMemoryDirectory`, `plansDirectory`, `includeGitInstructions`, `attribution.{commit,pr}` (replaces deprecated `includeCoAuthoredBy`), `language`, `model`, `effortLevel`, `cleanupPeriodDays`, `worktree.{baseRef,symlinkDirectories,sparsePaths}`; managed-only: `allowManagedHooksOnly`, `allowManagedPermissionRulesOnly`, `strictKnownMarketplaces`, `blockedMarketplaces`, `strictPluginOnlyCustomization.{skills,agents,hooks,mcp}` — [Settings reference index](https://code.claude.com/docs/en/settings-reference#settings-index)

**Output styles** — [Output styles](https://code.claude.com/docs/en/output-styles#create-a-custom-output-style)
- Markdown file in `~/.claude/output-styles/`, `.claude/output-styles/` (every one from cwd up to repo root; closest wins), managed dir `.claude/output-styles/`, or a plugin's `output-styles/`; file name = style name unless `name` set. Built-ins: `Proactive`, `Concise` (v2.1.237+), `Explanatory`, `Learning` (+ Default); `outputStyle` value is case-sensitive (mismatch → Default).
- Frontmatter (all optional, misspelled fields ignored): `name`, `description`, `keep-coding-instructions` (default `false` — without it the software-engineering part of the system prompt is dropped), `force-for-plugin` (plugin styles only; applies automatically, overrides user's `outputStyle`).
- Style files are read at startup (restart after editing); `/output-style <style>` switches (saves to `.claude/settings.local.json`); styles don't reach non-fork subagents.
```markdown
---
name: Diagrams first
description: Lead every explanation with a diagram
keep-coding-instructions: true
---
When explaining code, architecture, or data flow, start with a Mermaid diagram ...
```


**Status line stdin JSON (selected fields)** — [Status line: Available data](https://code.claude.com/docs/en/statusline#available-data)
- `model.id`, `model.display_name`, `cwd`, `workspace.current_dir`, `workspace.project_dir`, `workspace.added_dirs`, `workspace.git_worktree`, `cost.total_cost_usd`, `cost.total_duration_ms`, `cost.total_lines_added/removed`, `context_window.used_percentage`, `context_window.context_window_size`, `effort.level`, `thinking.enabled`, `rate_limits.five_hour.used_percentage`, `session_id`, `session_name`, `transcript_path`, `version`, `output_style.name`, `vim.mode`, `agent.name`, `pr.number`, `pr.url`, `worktree.name`, `worktree.path`.

**Version history (changelog)** — [Changelog](https://code.claude.com/docs/en/changelog)
- Customizable status line (`/statusline`): v1.0.71 (Aug 7, 2025); output styles incl. Explanatory/Learning: v1.0.81 (Aug 14, 2025); Bash sandbox mode (Linux & Mac): v2.0.24 (Oct 20, 2025).

### Inferences
- A method kit's committed `.claude/settings.json` should rely on **deny/ask** rules and hooks for guarantees (they apply before trust and in `-p`), treat `permissions.allow` as convenience that activates only after trust, and never ship `defaultMode: "auto"`/`"bypassPermissions"` there (ignored).
- For CI/headless verification of a kit, `--permission-mode dontAsk` plus explicit `--allowedTools` gives deterministic behaviour.

### Gaps
- The full settings index has ~200 keys (https://code.claude.com/docs/en/settings-reference#settings-index); only kit-relevant keys were transcribed. The sandbox sub-key value formats (path/domain pattern syntax) were not transcribed (see https://code.claude.com/docs/en/sandboxing).

## Plugins and marketplaces

### Takeaway
A plugin is a directory whose optional manifest lives at `.claude-plugin/plugin.json` (only `name` required) and whose components sit at the plugin root in default folders (`skills/`, `commands/`, `agents/`, `hooks/hooks.json`, `.mcp.json`, `.lsp.json`, `output-styles/`, `workflows/`, `themes/`, `monitors/monitors.json`, `bin/`, `settings.json`). All components are namespaced by plugin name (`/plugin-name:skill`, `plugin-name:agent`). Plugins are distributed through marketplaces (`.claude-plugin/marketplace.json`), installed with `/plugin marketplace add owner/repo` + `/plugin install name@marketplace`, enabled per scope via `enabledPlugins`, and checked with `claude plugin validate [--strict]`. Local testing: `claude --plugin-dir ./my-plugin`.

### Cited Findings
**`plugin.json` fields** — [Plugin manifest reference: Fields](https://code.claude.com/docs/en/plugins/manifest-reference#fields)
| Field | Type / notes |
|---|---|
| `$schema` | string, ignored at load |
| `name` | **required**; kebab-case; no spaces, `@`, `:`, path separators; names starting `claude-`, `anthropic-`, `anthropics-`, `cc-plugin-` or equal to `claude`, `anthropic`, `claude-code`... are validation errors |
| `displayName` | UI name |
| `version` | string (not semver-checked); **setting it pins users to that version until you change it** |
| `description` | string |
| `author` | object `{name (required), email, url}` |
| `homepage` | URL (must parse or plugin fails to load) |
| `repository` | string |
| `license` | SPDX id |
| `keywords` | string[] |
| `metadata` | free-form object (v2.1.222+), not read |
| `icon`, `documentationUrl`, `supportUrl`, `privacyPolicyUrl`, `termsOfServiceUrl` | for Anthropic's directory listing only |
| `defaultEnabled` | bool, default `true` |
| `dependencies` | `"name"`, `"name@marketplace"`, or `{name, marketplace, version}` |
| `settings` | object; only `agent` and `subagentStatusLine` take effect (root `settings.json` wins) |
| `userConfig` | prompted values (see below) |
| `types` | `.d.ts` for mods |
| `channels` | array of `{server, displayName, userConfig}` |
| `skills` | path or paths; **adds to** default `skills/` (`"."`/`"./"` = plugin root) |
| `commands` | path(s) or object map `{name: {source|content, description, argumentHint, model, allowedTools}}`; **replaces** default `commands/` |
| `agents` | `.md` file path(s) (no directories); **replaces** default `agents/` |
| `hooks` | `.json` path, inline object, or array; **merges** with `hooks/hooks.json` (a hooks file must wrap events in a top-level `"hooks"` key; inline object has no wrapper) |
| `mcpServers` | `.json` path, `.mcpb`/`.dxt` bundle path or https URL, inline map, or array; merges with `.mcp.json` |
| `lspServers` | path/inline/array; merges with `.lsp.json`; strict object fields `command`, `extensionToLanguage` (required), `args`, `transport`, `env`, `initializationOptions`, `settings`, `workspaceFolder`, `startupTimeout`, `shutdownTimeout`, `requestTimeout`, `restartOnCrash`, `maxRestarts`, `diagnostics` |
| `outputStyles`, `workflows` | path(s); replace defaults |
| `experimental` | `{themes, monitors, evals}` — shape may still change |
- Unknown top-level keys are stripped (validate warns); unknown keys inside `userConfig` options, `channels`, `lspServers`, `monitors` are errors and the plugin doesn't load — [Manifest reference: Unrecognized fields](https://code.claude.com/docs/en/plugins/manifest-reference#unrecognized-fields)
- Every component path must start with `./`, resolve inside the plugin root and exist (`..` → error) — [Manifest reference: Path rules](https://code.claude.com/docs/en/plugins/manifest-reference#path-rules)
- The manifest is optional: without it the standard layout loads and the name comes from the marketplace entry or the directory name (`--plugin-dir`) — [Manifest reference: Manifest file](https://code.claude.com/docs/en/plugins/manifest-reference#manifest-file)
- A `CLAUDE.md` at the plugin root is **not loaded** as context (validate warns) — put instructions in a skill — [Manifest reference: Standard layout](https://code.claude.com/docs/en/plugins/manifest-reference#standard-layout)
- `bin/` executables are put on the Bash tool's `PATH` while enabled (claude.ai/Cowork won't install plugins with `bin/`) — [Manifest reference: Standard layout](https://code.claude.com/docs/en/plugins/manifest-reference#standard-layout)
- `userConfig` option fields: `type` (`string|number|boolean|directory|file`), `title`, `description` (required), `required`, `default`, `options` (v2.1.271+), `multiple`, `sensitive` (secure storage), `min`/`max`; values stored in `pluginConfigs` in user settings; referenced as `${user_config.KEY}` (MCP/LSP config, exec-form hook args, skill/agent content) or env `CLAUDE_PLUGIN_OPTION_<KEY>` in hooks — [Manifest reference: User configuration](https://code.claude.com/docs/en/plugins/manifest-reference#user-configuration)
- Path variables: `${CLAUDE_PLUGIN_ROOT}` (installed version dir; changes on update — don't write state), `${CLAUDE_PLUGIN_DATA}` (`~/.claude/plugins/data/<id>/`, survives updates, deleted on last uninstall unless `--keep-data`), `${CLAUDE_PROJECT_DIR}`; not present in the env of Bash-tool commands — [Manifest reference: Environment variables](https://code.claude.com/docs/en/plugins/manifest-reference#environment-variables)
- Marketplace entry vs manifest: entry `strict` (default `true`); no plugin.json → entry is the manifest; with plugin.json and strict → entry components appended; `strict: false` + entry components → `conflicting manifests` error; manifest `version` beats entry version; entry `defaultEnabled`/display fields beat manifest — [Manifest reference: Marketplace entries and the manifest](https://code.claude.com/docs/en/plugins/manifest-reference#marketplace-entries-and-the-manifest)

Minimal plugin (validates):
```text
my-kit/
├── .claude-plugin/plugin.json      {"name": "my-kit", "version": "0.1.0", "description": "...", "author": {"name": "..."}}
├── skills/review/SKILL.md          -> /my-kit:review
├── agents/checker.md               -> my-kit:checker
└── hooks/hooks.json                {"hooks": {"PostToolUse": [...]}}
```

**`marketplace.json`** — [Marketplace reference](https://code.claude.com/docs/en/plugins/marketplace-reference#top-level-fields)
- Location `.claude-plugin/marketplace.json` in the marketplace root (relative plugin sources resolve from the root, not from `.claude-plugin/`). Unknown keys ignored (validate warns). Required: `name` (letters, digits, `.`, `_`, `-`; many reserved names e.g. `claude-plugins-official`, `inline`, `builtin`, `skills-dir`, `synced`, `npm`, `github`, names starting `claudeai-`), `owner` (`{name, email?, url?}`), `plugins` (array; each entry validated separately). Optional: `$schema`, `description`, `version`, `metadata.{description,version,pluginRoot}` (`pluginRoot` v2.1.239+), `forceRemoveDeletedPlugins`, `allowCrossMarketplaceDependenciesOn`, `renames`.
- Plugin entry: required `name`, `source`; plus `description`, `version` (plugin.json's version wins), `category`, `tags`, `strict` (default true), `relevance`, `dependencies`, `defaultEnabled`, `displayName`, `metadata`, `headers`, `headersHelper`, and any plugin.json field (component fields subject to strict mode; entry `hooks` only as inline object) — [Marketplace reference: Plugin entries](https://code.claude.com/docs/en/plugins/marketplace-reference#plugin-entries)
- Plugin source types — [Marketplace reference: Plugin sources](https://code.claude.com/docs/en/plugins/marketplace-reference#plugin-sources)
| Type | Shape |
|---|---|
| relative path | `"./plugins/formatter"` (must start `./`, no `..`, forward slashes; `"."` = marketplace root; bare names allowed with `metadata.pluginRoot`) |
| `github` | `{"source":"github","repo":"owner/repo","ref":"v2.0.0","sha":"<40-hex>"}` |
| `url` | `{"source":"url","url":"https://gitlab.example.com/g/formatter.git","ref":"main"}` (any git URL) |
| `git-subdir` | `{"source":"git-subdir","url":"https://github.com/org/monorepo.git","path":"tools/formatter"}` |
| `npm` | `{"source":"npm","package":"@org/formatter","version":"^2.0.0","registry":"https://..."}` (install scripts never run) |
| `archive` | `{"source":"archive","url":"https://.../x.zip","sha256":"<64-hex>"}` (v2.1.224+) |
| `command` | `{"source":"command","command":"my-tool claude-plugin-path","timeout":120,"mode":"copy|link"}` (v2.1.229+) |
- Relative-path plugins only work when the marketplace itself was fetched as `github`, `git`, `file` or `directory` (not `url`) — [Marketplace reference: Relative path plugin source](https://code.claude.com/docs/en/plugins/marketplace-reference#relative-path-plugin-source)
- Marketplace source types (for `marketplace add` / `extraKnownMarketplaces`): `github` `{repo, ref, path, sparsePaths}`, `git` `{url, ref, path, sparsePaths}`, `url` (direct link to marketplace.json; `headers`, `headersHelper`), `file` `{path}`, `directory` `{path}`, `settings` (inline `{name, plugins, owner}`); `npm` marketplace source "not yet implemented"; `hostPattern`, `pathPattern`, `skills-dir`, `owner/*` only in `strictKnownMarketplaces`/`blockedMarketplaces` — [Marketplace reference: Marketplace sources](https://code.claude.com/docs/en/plugins/marketplace-reference#marketplace-sources)

Minimal marketplace — [Create a marketplace](https://code.claude.com/docs/en/plugins/create-marketplace#create-a-marketplace)
```json
{
  "name": "my-marketplace",
  "description": "Plugins for my team",
  "owner": { "name": "Your Name" },
  "plugins": [
    { "name": "my-first-plugin", "source": "./plugins/my-first-plugin", "description": "A greeting plugin to learn the basics" }
  ]
}
```

**Install / manage commands** — [Plugin commands reference](https://code.claude.com/docs/en/plugins/cli-reference)
- Shell: `claude plugin marketplace add <source> [--scope user|project|local] [--sparse <paths...>]` where `<source>` is `owner/repo[@ref|#ref]` (github), `user@host:path` / `https://...git` (git), other `https://` URL (url → marketplace.json), `./path` (directory) or `./x.json` (file); `claude plugin install <name>@<marketplace> [-s user|project|local] [--config key=value] [--json] [--marketplace <source>]` (default scope `user`); `claude plugin enable|disable|uninstall|update <plugin> [-s ...]`; `claude plugin list [--json] [--available]`; `claude plugin details`; `claude plugin configure`; `claude plugin init <name> [--with skills hooks ...]` (scaffolds at `~/.claude/skills/<name>/`, loads as `<name>@skills-dir`); `claude plugin tag`; `claude plugin eval`; `claude plugin validate <path> [--strict] [--json]`. Alias `claude plugins`. Exit codes 0/1 (validate adds 2 = unexpected error).
- In session: `/plugin` (Discover/Installed/Marketplaces/Errors/Stats tabs), `/plugin marketplace add owner/repo`, `/plugin install name@marketplace` (opens details to install), `/plugin enable|disable|uninstall|configure|validate`, `/reload-plugins [--force]` (prints `Reloaded: N plugins · N skills · N agents · N hooks · N plugin MCP servers · N plugin LSP servers`; also works in `-p` from v2.1.260 but doesn't (dis)connect MCP there). `/plugin` is not available in `-p`.
- `claude plugin validate <dir>`: validates `.claude-plugin/marketplace.json` if present, else `.claude-plugin/plugin.json`, else component files (`skills`/`agents`/`commands` dirs, or a `.claude` dir) (v2.1.233+); doesn't follow symlinks; verdicts `Validation passed`, `Validation passed with warnings`, `Validation failed` — [Plugin commands reference: plugin validate](https://code.claude.com/docs/en/plugins/cli-reference#plugin-validate)
- Session-only loading: `claude --plugin-dir ./my-plugin` (dir or `.zip`, repeatable; a folder of plugins loads each child with `.claude-plugin/plugin.json`) and `--plugin-url <zip-url>`; appears as `<name>@inline`, overrides an installed plugin of the same name; check with `claude --plugin-dir ./my-plugin plugin list` — [Plugin commands reference: Flags that load a plugin for one session](https://code.claude.com/docs/en/plugins/cli-reference#flags-that-load-a-plugin-for-one-session)

**Project-level enablement** — [Manage plugins for your organization: Require plugins per repository](https://code.claude.com/docs/en/plugins/org#require-plugins-per-repository)
```json
{
  "extraKnownMarketplaces": {
    "acme-tools": { "source": { "source": "github", "repo": "acme-corp/claude-plugins" } }
  },
  "enabledPlugins": { "code-formatter@acme-tools": true }
}
```
- Repo `extraKnownMarketplaces` apply only after the contributor trusts the folder (in `-p`, only if already trusted or `hasTrustDialogAccepted` set). Relative-path plugins then load from the marketplace copy; plugins with an external source don't auto-install from project settings — each user must run `claude plugin install <name>@<marketplace> --scope project` ("enabled in project settings but isn't installed here") — [Plugin loading: Enabled in project settings but not installed](https://code.claude.com/docs/en/plugins/loading#enabled-in-project-settings-but-not-installed)
- `enabledPlugins` maps `plugin@marketplace` → bool; project beats user (opt out via `.claude/settings.local.json` `false`); managed `false` blocks install — [Settings reference: enabledPlugins](https://code.claude.com/docs/en/settings-reference#enabledplugins)
- Claude Code doesn't scan a project's `.claude/plugins/`; repo sharing = `enabledPlugins` in `.claude/settings.json` or a plugin folder under `.claude/skills/` (`<name>@skills-dir`, only from the primary working dir, needs trust) — [Plugin loading: Plugins shared through a repository](https://code.claude.com/docs/en/plugins/loading#plugins-shared-through-a-repository)
- In `-p`/CI plugins install in the background (may be missing on turn 1); `CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1` waits; `--output-format stream-json --verbose` `init` event lists loaded `plugins`; containers can pre-seed via `CLAUDE_CODE_PLUGIN_SEED_DIR` — [Manage plugins for your organization](https://code.claude.com/docs/en/plugins/org#when-each-surface-applies-the-plugin-keys)

**Versioning, caching, updates** — [Plugin loading reference: Versions and updates](https://code.claude.com/docs/en/plugins/loading#versions-and-updates)
- Version resolution: plugin.json `version` > marketplace entry `version` > source-derived (12-char commit SHA for github/url/git-subdir; sha256 for archive; `unknown` for npm/local non-git). Pinning `version` keeps users on the cached copy until the string changes; omit it to track commits.
- Cache at `~/.claude/plugins/cache/<marketplace>/<plugin>/<version>/` (= `${CLAUDE_PLUGIN_ROOT}`), data at `~/.claude/plugins/data/<plugin-id>/`, records `installed_plugins.json`, `known_marketplaces.json` (root relocatable via `CLAUDE_CODE_PLUGIN_CACHE_DIR`) — [Plugin loading: Find plugins on disk](https://code.claude.com/docs/en/plugins/loading#find-plugins-on-disk)
- Auto-update: interactive sessions refresh auto-update marketplaces after a random delay ≤10 min post first message; default on for official Anthropic marketplaces, off for third-party unless `autoUpdate: true` in `extraKnownMarketplaces`; new versions load next launch or after `/reload-plugins` — [Plugin loading: When auto-update runs](https://code.claude.com/docs/en/plugins/loading#when-auto-update-runs)
- Official marketplace install path: `/plugin marketplace add anthropics/claude-plugins-official`, then `/plugin install skill-creator@claude-plugins-official` — [Skills](https://code.claude.com/docs/en/skills#run-evals-with-skill-creator)


**Real-world examples (anthropics/claude-plugins-official, fetched 2026-10-14)** — [marketplace.json](https://github.com/anthropics/claude-plugins-official/blob/main/.claude-plugin/marketplace.json)
- Top-level keys: `$schema` (`https://anthropic.com/claude-code/marketplace.schema.json`), `name` (`claude-plugins-official`), `description`, `owner` (`{"name": "Anthropic", "email": "support@anthropic.com"}`), `renames`, `plugins` (315 entries: 164 `url`, 98 `git-subdir`, 53 relative-path sources).
- Relative-path entry: `{"name": "skill-creator", "description": "...", "author": {"name": "Anthropic", "email": "support@anthropic.com"}, "source": "./plugins/skill-creator", "category": "development", "homepage": "..."}`; `git-subdir` entry: `{"source": {"source": "git-subdir", "url": "https://github.com/adobe/skills.git", "path": "plugins/creative-cloud/adobe-for-creativity", "ref": "main", "sha": "acb6d7..."}}`.
- Minimal real `plugin.json` (skill-creator): only `name`, `description`, `author` — [skill-creator plugin.json](https://github.com/anthropics/claude-plugins-official/blob/main/plugins/skill-creator/.claude-plugin/plugin.json)

**Version history (changelog)** — [Changelog](https://code.claude.com/docs/en/changelog)
- Plugin system and marketplaces released, with `/plugin validate`: v2.0.12 (Oct 9, 2025); `claude plugin eval`: v2.1.269 (Sep 11, 2026).

### Inferences
- For a kit published as a public GitHub repo, the lowest-friction layout is a repo that is both a marketplace (`.claude-plugin/marketplace.json` with `"source": "./plugins/<kit>"` or `"."`) and contains the plugin, so project `extraKnownMarketplaces` + `enabledPlugins` load it without per-user install (relative-path source).
- Omit `version` during rapid iteration (users track commits); set it when you want controlled releases.
- Plugins cannot carry CLAUDE.md; always-on guidance must come via a skill (model-invoked), a SessionStart hook's `additionalContext`, or an output style with `force-for-plugin`.

### Gaps
- Exact list of components loaded from plugins in cloud sessions and Cowork is on claude.com, not fetched here.

## MCP (.mcp.json, scopes, approval)

### Takeaway
Project MCP servers are declared in `.mcp.json` at the project root as `{"mcpServers": {"<name>": {...}}}`; stdio entries use `command`/`args`/`env` (optional `"type": "stdio"`), remote entries **must** set `"type": "http"` (alias `streamable-http`), `"sse"` or `"ws"` with `url`/`headers`. Local and user scopes live in `~/.claude.json`. Interactive sessions ask for approval before connecting `.mcp.json` servers (a repo can't approve its own servers); `-p`, SDK and cloud sessions connect them without asking. `${VAR}` and `${VAR:-default}` expand in `command`, `args`, `env`, `url`, `headers`.

### Cited Findings
- Scopes — [MCP: installation scopes](https://code.claude.com/docs/en/mcp#mcp-installation-scopes)
| Scope | Loads in | Stored in |
|---|---|---|
| Local (default for `claude mcp add`) | current project, private | `~/.claude.json` under `projects["/path"].mcpServers` |
| Project | current project, shared | `.mcp.json` in project root |
| User | all your projects | `~/.claude.json` (top-level `mcpServers`) |
- Precedence when the same server is defined twice (whole entry, no field merge): local > project > user > plugin-provided > claude.ai connectors; managed `managedMcpServers` ranks above all (v2.1.259+) — [MCP: Scope hierarchy and precedence](https://code.claude.com/docs/en/mcp#scope-hierarchy-and-precedence)
- `.mcp.json` format:
```json
{
  "mcpServers": {
    "shared-server": { "type": "http", "url": "https://example.com/mcp" },
    "local-tool": { "type": "stdio", "command": "npx", "args": ["-y", "@example/mcp-server"], "env": { "CACHE_DIR": "/tmp" } },
    "api-server": { "type": "http", "url": "${API_BASE_URL:-https://api.example.com}/mcp", "headers": { "Authorization": "Bearer ${API_KEY}" } }
  }
}
```
— [MCP: Project scope](https://code.claude.com/docs/en/mcp#project-scope), [MCP: Environment variable expansion](https://code.claude.com/docs/en/mcp#environment-variable-expansion-in-mcp-json), [MCP: Add MCP servers from JSON configuration](https://code.claude.com/docs/en/mcp#add-mcp-servers-from-json-configuration)
- An entry with `url` but no `type` is read as stdio and skipped with an error; `"type": "sdk"` only for SDK hosts; `ws` accepts `url`, `headers`, `headersHelper`, `timeout`, `alwaysLoad` — [MCP: Installing MCP servers](https://code.claude.com/docs/en/mcp#installing-mcp-servers)
- Stdio servers get `CLAUDE_PROJECT_DIR` in their environment; to reference it in a project `.mcp.json` `command`/`args` use `${CLAUDE_PROJECT_DIR:-.}` (plugin MCP configs substitute it directly); servers can use MCP `roots/list` — [MCP: Option 3](https://code.claude.com/docs/en/mcp#option-3-add-a-local-stdio-server)
- Unset `${VAR}` without default → server still loads with literal text plus a warning; credential variables (`ANTHROPIC_API_KEY`, `ANTHROPIC_AUTH_TOKEN`, `AWS_BEARER_TOKEN_BEDROCK`, `HTTPS_PROXY`, `NPM_TOKEN`...) always read as empty in remote `url`/`headers` — [MCP: Credential variables that read as empty](https://code.claude.com/docs/en/mcp#credential-variables-that-read-as-empty)
- Approval: interactive sessions prompt before using `.mcp.json` servers (`claude mcp reset-project-choices` resets); `-p`, SDK and cloud sessions load them without asking; keep one out with `disabledMcpjsonServers`, `--setting-sources` without project, or `--strict-mcp-config` + `--mcp-config` — [MCP: Project scope](https://code.claude.com/docs/en/mcp#project-scope)
- `enableAllProjectMcpServers` / `enabledMcpjsonServers` committed in the project's `.claude/settings.json` are ignored in an untrusted folder ("A cloned repository can't approve its own servers"); approvals from user settings, managed settings, `--settings`, or an untracked `.claude/settings.local.json` (after trust) apply — [MCP: Project server approvals and workspace trust](https://code.claude.com/docs/en/mcp#project-server-approvals-and-workspace-trust)
- CLI: `claude mcp add --transport http <name> <url> [--header ...] [--scope local|project|user]`, `claude mcp add [--env K=V] --transport stdio <name> -- <command> [args...]`, `claude mcp add-json <name> '<json>'`, `claude mcp list`, `claude mcp get <name>`, `claude mcp remove <name>`; in session `/mcp` — [MCP](https://code.claude.com/docs/en/mcp#managing-your-servers)
- Plugin MCP servers: `.mcp.json` at plugin root or inline in `plugin.json`; start automatically when the plugin is enabled; tool names `mcp__plugin_<plugin>_<server>__<tool>` — [MCP: Plugin-provided MCP servers](https://code.claude.com/docs/en/mcp#plugin-provided-mcp-servers)
- Tool permission names: `mcp__<server>__<tool>`; a server can force a prompt on every call with `_meta["anthropic/requiresUserInteraction"]: true` — [MCP: Require approval for a specific tool](https://code.claude.com/docs/en/mcp#require-approval-for-a-specific-tool)
- Subagents can scope servers via `mcpServers` frontmatter (inline servers connect only in the subagent, keeping tool descriptions out of the main context) — [Subagents: Scope MCP servers](https://code.claude.com/docs/en/sub-agents#scope-mcp-servers-to-a-subagent)


**Version history (changelog)** — [Changelog](https://code.claude.com/docs/en/changelog)
- MCP "project" scope writing `.mcp.json`: v0.2.50 (Apr 2, 2025).

### Inferences
- A kit that needs an MCP server for interactive users should still expect a one-time approval prompt; it cannot pre-approve via committed settings. In CI (`-p`) the server connects automatically, so test with `--strict-mcp-config --mcp-config` for determinism.

### Gaps
- Exact JSON schema for every `.mcp.json` server field (e.g. `timeout`, `alwaysLoad`, `oauth`, `headersHelper`) was only partially extracted.

## Headless and automation (claude -p, verifying a kit loads)

### Takeaway
`claude -p "<prompt>"` runs non-interactively with the same discovery as an interactive session (CLAUDE.md, skills, agents, hooks, plugins, `.mcp.json`), but with **no workspace-trust dialog**: repo hooks/env/skill `allowed-tools` run, `.mcp.json` servers connect, while repo `permissions.allow`, `additionalDirectories`, `extraKnownMarketplaces` and project-subagent frontmatter hooks are not used. The machine-readable way to verify what loaded is `--output-format stream-json --verbose`, whose first `system/init` event lists `tools`, `mcp_servers`, `slash_commands`, `skills`, `agents`, `plugins`, `plugin_errors`, `mcp_server_errors`, `output_style`, `permissionMode`, `claude_code_version`. For hermetic tests use `--bare` (skips all discovery) plus explicit `--settings`, `--plugin-dir`, `--agents`, `--mcp-config`, `--append-system-prompt-file`; or `--setting-sources` to choose `user,project,local`.

### Cited Findings
- `claude -p` exits 0 on success, non-zero on failure; invalid flags error on stderr; `--bg` can't combine with `-p` — [Headless](https://code.claude.com/docs/en/headless#basic-usage)
- `--output-format text|json|stream-json`; `json` returns `result`, `session_id`, `total_cost_usd` etc.; `--json-schema '<schema>'` puts validated output in `structured_output`; `stream-json` needs `--verbose` (and `--include-partial-messages` for token deltas); last line is a `result` message — [Headless: Get structured output](https://code.claude.com/docs/en/headless#get-structured-output)
- `system/init` event fields (TypeScript `SDKSystemMessage`): `type: "system"`, `subtype: "init"`, `session_id`, `agents?: string[]`, `apiKeySource`, `claude_code_version`, `cwd`, `tools: string[]`, `mcp_servers: {name, status, source?}[]`, `model`, `permissionMode`, `slash_commands: string[]`, `output_style`, `skills: string[]`, `plugins: {name, path}[]`, `plugin_errors?`, `capabilities?` — [Agent SDK TypeScript reference: SDKSystemMessage](https://code.claude.com/docs/en/agent-sdk/typescript#sdksystemmessage)
- CI gates: fail on non-empty `plugin_errors` (plugin load errors incl. `--plugin-dir` failures with `path`, v2.1.283+) or `mcp_server_errors` (skipped `--mcp-config` entries, v2.1.219+); `hook_started`/`hook_progress`/`hook_response` events stream while SessionStart/Setup hooks run — [Headless: Fail CI when a plugin or MCP server doesn't load](https://code.claude.com/docs/en/headless#fail-ci-when-a-plugin-or-mcp-server-doesn-t-load)
- `--bare`: skips auto-discovery of hooks, skills, custom commands, subagents, installed plugins, MCP servers, auto memory and CLAUDE.md; needs `ANTHROPIC_API_KEY` (no OAuth/keychain); re-add context with `--append-system-prompt[-file]`, `--settings`, `--mcp-config`, `--agents`, `--plugin-dir`/`--plugin-url`; no system reminders (incl. no skill listing) and no background tasks (v2.1.286+); "will become the default for `-p` in a future release" — [Headless: Start faster with bare mode](https://code.claude.com/docs/en/headless#start-faster-with-bare-mode)
- Permission control in `-p`: `--allowedTools "Bash(git diff *),Read,Edit"` (permission-rule syntax), `--disallowedTools`, `--tools "Bash,Edit,Read"` (restricts the built-in set; `""` none, `"default"`), `--permission-mode default|acceptEdits|plan|auto|dontAsk|bypassPermissions|manual`, `--permission-prompts none` (v2.1.259+; deny anything that would prompt), `--permission-prompt-tool <mcp tool>`; the built-in start mode can be `auto`, so pass one explicitly — [Headless: Auto-approve tools](https://code.claude.com/docs/en/headless#auto-approve-tools), [CLI reference](https://code.claude.com/docs/en/cli-reference)
- Skills in `-p`: user-invocable skills/commands work by putting `/skill-name args` in the prompt string; terminal-only built-ins (e.g. `/login`, `/plugin`) are unavailable; `/reload-plugins` works in `-p` (v2.1.260+) — [Headless: Create a commit](https://code.claude.com/docs/en/headless#create-a-commit)
- Other flags: `--settings <file-or-json>` (≤2 MiB; above project/user, below managed), `--setting-sources user,project,local`, `--plugin-dir <path>` (repeatable), `--agents '<json>'|<file>`, `--agent <name>`, `--append-system-prompt`, `--append-system-prompt-file`, `--system-prompt[-file]` (replace), `--mcp-config` + `--strict-mcp-config`, `--max-turns`, `--max-budget-usd`, `--model`, `--add-dir`, `--continue`/`--resume <id>`/`--fork-session`, `--no-session-persistence`, `--debug[=categories]`, `--debug-file <path>`, `--verbose`, `--init`/`--init-only`/`--maintenance` (Setup hooks), `--disable-slash-commands`, `--safe-mode` (all customizations off), `--restricted`, `--worktree/-w <name>` — [CLI reference: CLI flags](https://code.claude.com/docs/en/cli-reference)
- `--forward-subagent-text` (v2.1.211+) forwards subagent text/thinking into the stream; subagent messages carry `parent_tool_use_id` — [Headless: Follow subagent messages](https://code.claude.com/docs/en/headless#follow-subagent-messages)
- Async hooks are killed at `-p` teardown; `-p` waits up to 10 min (`CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS`) for background work; SIGTERM exits 143 after running SessionEnd hooks — [Headless](https://code.claude.com/docs/en/headless#background-tasks-at-exit)
- Plugins install in the background in `-p` (may miss turn 1); `CLAUDE_CODE_SYNC_PLUGIN_INSTALL=1` waits and emits `system/plugin_install` events — [Headless: Track plugin installs](https://code.claude.com/docs/en/headless#track-plugin-installs)
- Interactive verification commands: `/context` (memory files, skills, custom subagents with source, MCP tools), `/memory`, `/skills`, `/hooks` (read-only list by source), `/mcp`, `/permissions`, `/status` (Setting sources), `/doctor`, `/debug`; shell `claude doctor` prints read-only settings diagnostics; `claude --safe-mode` for a clean baseline — [Debug your configuration](https://code.claude.com/docs/en/debug-your-config)
- Static validation: `claude plugin validate <dir> [--strict] [--json]` for plugins, marketplaces, or `.claude/skills|agents|commands` — [Plugin commands reference](https://code.claude.com/docs/en/plugins/cli-reference#plugin-validate)
- Behavioural evaluation: `claude plugin eval .` (v2.1.269+; docs list an "early access" troubleshooting state) runs each case under `evals/<case>/prompt.md` (frontmatter `max_turns`, `allowed_tools`, `timeout_seconds`, `model`, `tags`) 3x with and 3x without the plugin; graders in `graders/*.md` with `type: llm|baseline|regex|tool_used|tool_order|file_exists`; e.g. `type: tool_used`, `tool: Skill`, `input_match: '"skill"\s*:\s*"(?:[\w-]+:)?your-skill-name"'` checks the skill fired; scaffold with `claude plugin eval init` — [Test plugins with evals](https://code.claude.com/docs/en/plugin-evals#create-your-first-eval-suite)

Minimal load-check recipe (derived from the above):
```bash
claude -p "/my-kit:hello" --plugin-dir ./my-kit --permission-mode dontAsk \
  --output-format stream-json --verbose \
  | jq -c 'select(.type=="system" and .subtype=="init") | {skills, agents, slash_commands, plugins, plugin_errors, mcp_servers}'
```


**Version history (changelog)** — [Changelog](https://code.claude.com/docs/en/changelog)
- `--bare` flag for scripted `-p` calls: v2.1.81 (Mar 20, 2026).

### Inferences
- `--bare` hides the skill listing from Claude, so a test of model-invoked skill discovery must not use `--bare`; use `--setting-sources` plus `--plugin-dir` instead, or `claude plugin eval`.
- Because `-p` treats folders as trusted for hooks but not for `permissions.allow`, a kit's CI test should pass its needed allow rules via `--allowedTools` or `--settings`.

### Gaps
- Whether `system/init.skills` lists model-invocable skills only or also `disable-model-invocation` skills is not stated.

## Plan mode, checkpoints/rewind, worktrees, parallel sessions, background tasks

### Takeaway
Plan mode (`--permission-mode plan`, `Shift+Tab`, `/plan` prefix, or `"defaultMode": "plan"` in `.claude/settings.json`) lets Claude read and run read-only/classifier-approved commands and write a plan file, then present it via the `ExitPlanMode` tool for approval. Checkpoints are automatic per user prompt (100 most recent), restored with `/rewind` or `Esc Esc`, but do not track Bash-made changes, background-subagent edits, or symlinked files. `claude --worktree <name>` (or subagent `isolation: worktree`) gives isolated checkouts under `.claude/worktrees/<name>/` on branch `worktree-<name>`, with `.worktreeinclude` copying gitignored files. Parallelism options: subagents, agent view (`claude agents`, research preview), agent teams (experimental, `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`), dynamic workflows (`.claude/workflows/*.js`), and `/batch`.

### Cited Findings
**Plan mode** — [Permission modes: plan mode](https://code.claude.com/docs/en/permission-modes#analyze-before-you-edit-with-plan-mode)
- Claude "reads files, runs shell commands to explore, and writes a plan, but does not edit your source"; with auto mode available and `useAutoModeDuringPlan` on (default) the classifier reviews non-read-only commands, otherwise they prompt.
- Enter with `Shift+Tab`, a `/plan` prompt prefix, or `claude --permission-mode plan`; project default via `{"permissions": {"defaultMode": "plan"}}` in `.claude/settings.json` (VS Code uses `claudeCode.initialPermissionMode`).
- Approval options: "Yes, and use auto mode" (or "Yes, auto-accept edits"), "Yes, manually approve edits", "No, keep planning"; `Ctrl+G` edits the plan in your editor; `showClearContextOnPlanAccept` adds an approve-and-clear option.
- The Plan built-in subagent does research during plan mode; plan files live in `~/.claude/plans/` or `plansDirectory` — [Subagents](https://code.claude.com/docs/en/sub-agents#built-in-subagents), [Permission modes: Protected paths](https://code.claude.com/docs/en/permission-modes#protected-paths)
- Hooks can observe the plan: `ExitPlanMode` PreToolUse input gets injected `plan` and `planFilePath`; PostToolUse `tool_response.plan` — [Hooks reference: ExitPlanMode](https://code.claude.com/docs/en/hooks#exitplanmode)

**Checkpoints / rewind** — [Checkpointing](https://code.claude.com/docs/en/checkpointing)
- A checkpoint is captured before each prompt that starts a turn; snapshots kept for the 100 most recent checkpoints; persisted with the session (rewind works after resume); deleted by the retention sweep (~30 days, `cleanupPeriodDays`).
- `/rewind` or `Esc` twice: Restore code and conversation / Restore conversation / Restore code / Summarize from here / Summarize up to here.
- Not tracked: Bash command file changes (`rm`, `mv`, `cp`), subagent edits (except foreground forked skills), external/concurrent-session edits, symlinked/hard-linked files. "Not a replacement for version control".
- Alternatives: `/branch` or `claude --continue --fork-session` to branch a session.

**Worktrees** — [Worktrees](https://code.claude.com/docs/en/worktrees)
- `claude --worktree feature-auth` / `-w` → `.claude/worktrees/feature-auth/` on new branch `worktree-feature-auth`; add `.claude/worktrees/` to `.gitignore`; interactive runs require workspace trust, `-p` skips it; Claude can create/switch with `EnterWorktree`/`ExitWorktree` tools.
- Cleanup on exit: clean unnamed worktree auto-removed; dirty worktree → keep/remove prompt; `-p` never cleans up (use `git worktree remove`/`unlock`).
- `worktree.baseRef`: `"fresh"` (default, remote default branch) or `"head"` (current local HEAD); `.worktreeinclude` (gitignore syntax) copies gitignored files such as `.env`; `WorktreeCreate`/`WorktreeRemove` hooks replace git logic (non-git VCS).
- Subagent `isolation: worktree` → temporary worktree, auto-removed if unchanged; such a subagent takes its instruction files from the main conversation, not from the worktree.
- Shared with main checkout: `.git`, project-scope plugins (v2.1.200+), "don't ask again" approvals (saved to main checkout's `.claude/settings.local.json`), and — if the worktree has no `.claude/skills|agents|commands` — the main checkout's project skills/agents/commands (skills v2.1.277+). `${CLAUDE_PROJECT_DIR}` in hooks stays at the original project root; use the hook input `cwd`.

**Parallel sessions and background work** — [Run agents in parallel](https://code.claude.com/docs/en/agents)
| Approach | Status / entry point |
|---|---|
| Subagents | in-session; `/tasks` to inspect |
| Agent view | `claude agents`, `claude --bg` (background sessions); **research preview**; `disableAgentView` setting — [Agent view](https://code.claude.com/docs/en/agent-view) |
| Agent teams | **experimental, disabled by default**; enable `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` — [Agent teams](https://code.claude.com/docs/en/agent-teams) |
| Dynamic workflows | JS scripts orchestrating subagents; saved to `.claude/workflows/` or `~/.claude/workflows/`; plugins can ship `workflows/`; up to 16 concurrent agents; `CLAUDE_CODE_DISABLE_WORKFLOWS=1` — [Workflows](https://code.claude.com/docs/en/workflows) |
| `/batch` | bundled skill splitting a change into 5-30 worktree-isolated subagents |
| Cross-session messaging | `SendMessage`/`ListAgents` between sessions — [Cross-session messaging](https://code.claude.com/docs/en/cross-session-messaging) |
- Background Bash commands (`run_in_background`, `Ctrl+B`), Monitor watches, and background subagents are listed in `/tasks`; `CLAUDE_CODE_DISABLE_BACKGROUND_TASKS=1` turns all background task features off — [Run agents in parallel](https://code.claude.com/docs/en/agents#check-on-running-work), [Subagents](https://code.claude.com/docs/en/sub-agents#run-subagents-in-foreground-or-background)


**Version history (changelog)** — [Changelog](https://code.claude.com/docs/en/changelog)
- `/rewind` to undo code changes: v2.0.0 (Sep 29, 2025); `--worktree`/`-w`: v2.1.49 (Feb 19, 2026); agent teams research preview (`CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1`): v2.1.32 (Feb 5, 2026); `claude agents` command: v2.1.50 (Feb 20, 2026).

### Inferences
- A method kit that relies on rewind for safety must keep edits in the main conversation's file tools (not Bash `sed`/`mv`, not background subagents); otherwise rely on git commits as checkpoints.
- For multi-agent kit workflows, subagents with `isolation: worktree` plus `.worktreeinclude` is the documented, non-experimental route; agent teams remain experimental and agent view is a research preview.

### Gaps
- Exact on-disk format of `.claude/workflows/*.js` `meta` block not extracted (see https://code.claude.com/docs/en/workflows#what-the-saved-script-looks-like).
