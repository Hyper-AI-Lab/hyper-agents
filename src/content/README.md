# Kit content: the single source of truth

Everything PAACM installs into a project or ships as a plugin is authored here once. The generator (`node bin/paacm.mjs build`) renders it into the plugin for both IDEs and the two marketplace manifests, and `paacm init` renders the same content into a project. Never edit `plugins/paacm/`, `.claude-plugin/marketplace.json` or `.cursor-plugin/marketplace.json` by hand; CI fails when they differ from the generator's output.

## Layout

| Path | Content | Rendered to (project install) | Rendered to (plugin) |
|---|---|---|---|
| `kit.json` | Name, version, description, author, licence, keywords and marketplace owner | `.agent/paacm.lock.json` version | Both `plugin.json` manifests and both marketplace manifests |
| `instructions/AGENTS.md` | The always-on core instructions | A marked block in `AGENTS.md`, which both IDEs read | `rules/paacm-core.mdc`, an always-applied Cursor rule generated from it (Cursor cloud agents do not run session-start hooks), and `skills/paacm/scripts/core-rules.md`, which the session-start hook injects for Claude Code because a plugin cannot ship `AGENTS.md` or `CLAUDE.md` |
| `instructions/CLAUDE.md` | The Claude Code adapter (imports `AGENTS.md`) | A marked block in `CLAUDE.md` (Claude Code only) | Not used |
| `skills/<name>/` | Agent Skills: `SKILL.md` plus `references/` | `.claude/skills/<name>/` (read by both IDEs) | `skills/<name>/` |
| `agents/<name>.md` | Subagents with both IDEs' fields (Claude Code's `tools` and model alias, Cursor's `readonly`) | `.claude/agents/<name>.md` (power layer; read by both IDEs). For agents whose `model` is a Claude Code alias (`haiku`, `sonnet`, `opus`, `fable`), the generator also writes `.cursor/agents/<name>.md` with `model: inherit`, which Cursor prefers over `.claude/agents/` | `agents/<name>.md` with `model: inherit` when the model is a Claude Code alias, because both IDEs read the plugin's agents and Cursor accepts only `inherit` or a full model ID |
| `hooks/claude.json` | Claude Code hooks, with `{{SCRIPTS}}` for the runtime location | Merged into `.claude/settings.json` (power layer) | `hooks/hooks.json` |
| `hooks/cursor.json` | Cursor hooks, with `{{SCRIPTS}}` for the runtime location | Merged into `.cursor/hooks.json` (power layer) | `hooks/cursor-hooks.json` |
| `profiles/claude/L0.json` … `L3.json` | Permission and sandbox settings per autonomy level | Merged into `.claude/settings.json` (power layer) | Not used |
| `profiles/cursor/L0.json` … `L3.json` | Terminal and MCP allowlists per autonomy level | Merged into `.cursor/permissions.json` (power layer) | Not used |
| `project/checks.conf` | Default check manifest | `.agent/checks.conf` | Not used |
| `project/gitignore` | Ignore rules for task state and evaluation runs | `.agent/.gitignore` | Not used |

The project configuration's defaults (autonomy, gate tiers, retry cap, check timeout, protected paths) are defined once in `src/runtime/lib/config.mjs`: a project install writes them to `.agent/paacm.json`, and the runtime applies them wherever that file is missing or leaves a key out, as in a plugin install.

The runtime in `src/runtime/` (the check runner, the protected-path audit, task state and the hook scripts) is copied into `skills/paacm/scripts/` for both targets, so hooks, the agent and the CLI run the same code. The generator also places a copy of `instructions/AGENTS.md` there as `core-rules.md`; the session-start hook injects it when the project's `AGENTS.md` has no PAACM block, which is the case for plugin installs.

## Rules for authors

- Frontmatter uses only `key: value` scalars, inline lists and `- item` lists; the validator rejects other YAML.
- A skill's `name` equals its folder name; a subagent's `name` equals its file name.
- `SKILL.md` stays under 500 lines; detail goes to `references/`.
- `{{SCRIPTS}}` is the only template token. It expands to the runtime folder: `${CLAUDE_PROJECT_DIR}/.claude/skills/paacm/scripts` or `.claude/skills/paacm/scripts` in a project, and `${CLAUDE_PLUGIN_ROOT}/skills/paacm/scripts` or `${CURSOR_PLUGIN_ROOT}/skills/paacm/scripts` in the plugin.
- Run `node bin/paacm.mjs validate` and `node bin/paacm.mjs build` after every change, then commit the regenerated output with the change.
