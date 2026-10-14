# Kit content: the single source of truth

Everything PAACM installs into a project or ships as a plugin is authored here once. The generator (`node bin/paacm.mjs build`) renders it into the plugin for both IDEs and the two marketplace manifests, and `paacm init` renders the same content into a project. Never edit `plugins/paacm/`, `.claude-plugin/marketplace.json` or `.cursor-plugin/marketplace.json` by hand; CI fails when they differ from the generator's output.

## Layout

| Path | Content | Rendered to (project install) | Rendered to (plugin) |
|---|---|---|---|
| `kit.json` | Name, version, description, author, licence, keywords and marketplace owner | `.agent/paacm.json` version | Both `plugin.json` manifests and both marketplace manifests |
| `instructions/AGENTS.md` | The always-on core instructions | A marked block in `AGENTS.md` | Delivered by the session-start hook, because plugins cannot ship `AGENTS.md` |
| `instructions/CLAUDE.md` | The Claude Code adapter (imports `AGENTS.md`) | A marked block in `CLAUDE.md` (Claude Code only) | Not used |
| `skills/<name>/` | Agent Skills: `SKILL.md` plus `references/` | `.claude/skills/<name>/` (read by both IDEs) | `skills/<name>/` |
| `agents/<name>.md` | Subagents with both IDEs' fields | `.claude/agents/<name>.md` (power layer; read by both IDEs) | `agents/<name>.md` |
| `cursor/agents/<name>.md` | Cursor-only overrides of a subagent of the same name | `.cursor/agents/<name>.md` (power layer, Cursor) | Not used |
| `cursor/rules/plugin/<name>.mdc` | Cursor rules for the plugin | Not used | `rules/<name>.mdc` |
| `cursor/rules/project/<name>.mdc` | Cursor rules for project installs | `.cursor/rules/<name>.mdc` (power layer, Cursor) | Not used |
| `hooks/claude.json` | Claude Code hooks, with `{{SCRIPTS}}` for the runtime location | Merged into `.claude/settings.json` (power layer) | `hooks/hooks.json` |
| `hooks/cursor.json` | Cursor hooks, with `{{SCRIPTS}}` for the runtime location | Merged into `.cursor/hooks.json` (power layer) | `hooks/cursor-hooks.json` |
| `profiles/claude/L0.json` … `L3.json` | Permission and sandbox settings per autonomy level | Merged into `.claude/settings.json` (power layer) | Not used |
| `profiles/cursor/L0.json` … `L3.json` | Terminal and MCP allowlists per autonomy level | Merged into `.cursor/permissions.json` (power layer) | Not used |
| `project/paacm.json` | Default project configuration | `.agent/paacm.json` | Not used |
| `project/checks.conf` | Default check manifest | `.agent/checks.conf` | Not used |
| `project/gitignore` | Ignore rules for task state and evaluation runs | `.agent/.gitignore` | Not used |

The runtime in `src/runtime/` (the check runner, the protected-path audit, task state and the hook scripts) is copied into `skills/paacm/scripts/` for both targets, so hooks, the agent and the CLI run the same code.

## Rules for authors

- Frontmatter uses only `key: value` scalars, inline lists and `- item` lists; the validator rejects other YAML.
- A skill's `name` equals its folder name; a subagent's `name` equals its file name.
- `SKILL.md` stays under 500 lines; detail goes to `references/`.
- `{{SCRIPTS}}` is the only template token. It expands to the runtime folder: `${CLAUDE_PROJECT_DIR}/.claude/skills/paacm/scripts` or `.claude/skills/paacm/scripts` in a project, and `${CLAUDE_PLUGIN_ROOT}/skills/paacm/scripts` or `${CURSOR_PLUGIN_ROOT}/skills/paacm/scripts` in the plugin.
- Run `node bin/paacm.mjs validate` and `node bin/paacm.mjs build` after every change, then commit the regenerated output with the change.
