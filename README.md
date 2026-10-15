# PAACM: the Verified Single-Writer Loop

PAACM (Portable Adaptive Agentic Coding Method) is a method and a kit for agentic coding in **Claude Code** and **Cursor**. You give the agent a request, plus any supporting data: a reference repository, documents, screenshots, logs. You get back a committed change whose acceptance criteria are each marked passed, failed or untested with executed evidence. Or you get a precise `BLOCKED:` report that says what the agent needs from you.

The method is derived from a [study](docs/research/README.md) of current agentic-coding research, vendor guidance and tooling, and specified in [ALGORITHM.md](docs/method/ALGORITHM.md).

## How it works

```text
request + supporting data
  → 0 orient → 1 intake and triage (route FAST | STANDARD | DEEP, autonomy L0–L3)
  → 2 specify → 3 explore → 4 plan → 5 tests first → 6 implement
  → 7 verify (the gate) → 8 independent review → 9 report
```

- **One agent writes.** A read-only explorer and a read-only reviewer work in fresh contexts. No swarms, and no two agents in one working tree.
- **Process scales with risk.** A FAST fix skips the specification, plan and review. DEEP work gets all of them, and high-stakes work also gets held-out tests.
- **Done means executed evidence.** The stop gate keeps the agent from finishing while the checks in `.agent/checks.conf` fail. After three failures in a row it must stop and ask. A missing check never counts as a pass.
- **Approved tests are frozen.** After you approve the tests, hooks refuse edits to them and hold edits to executable configuration for your approval, and an audit of the diff catches changes made any other way.
- **Seven escalation triggers** make the agent stop instead of guessing: materially different approaches, missing access, behaviour-changing ambiguity, a spec–test conflict, a failing retry cap, an edit outside the plan, and anything consequential.
- **State lives on disk.** Each task has a folder with its specification, plan, progress log and report, and each completed plan task is a commit, so work survives the end of a session.

## Quick start

You need git and Node.js 20 or later.

**Claude Code plugin:**

```text
/plugin marketplace add Hyper-AI-Lab/hyper-agents
/plugin install paacm@hyper-agents
```

**Cursor plugin** (local; a Teams or Enterprise admin can add this repository as a team marketplace instead):

```bash
npx github:Hyper-AI-Lab/hyper-agents init --cursor-user
```

**Project install**, committed with your code and used by both IDEs (`--layer power` adds the subagents, hooks and permission profiles):

```bash
npx github:Hyper-AI-Lab/hyper-agents init --layer power --dry-run
```

Then tell PAACM how to check your project. `detect` proposes commands from your `package.json`, Makefile, `pyproject.toml`, Cargo or Go files; review them, then keep the ones you trust in `.agent/checks.conf`:

```bash
npx github:Hyper-AI-Lab/hyper-agents detect
```

And make a request: `/paacm <request>` in a project install (either IDE), `/paacm:paacm <request>` with the Claude Code plugin, or the `paacm` skill in Cursor's Agent with the Cursor plugin.

```text
/paacm Idle sessions never expire. Expire a session after 30 minutes without requests and return 401 after that; add a regression test.
```

The [user guide](docs/guide/README.md) covers setup, writing requests, supporting data, autonomy levels, reading the report, worked examples and troubleshooting.

## Repository

| Path | Content |
|---|---|
| [docs/guide/](docs/guide/README.md) | The user guide |
| [docs/method/](docs/method/ALGORITHM.md) | The specification, with [decision records](docs/method/adr/README.md) |
| [docs/research/](docs/research/README.md) | The study behind it |
| [docs/project/requirements.md](docs/project/requirements.md) | Requirements and their evidence |
| `src/content/` | Everything the kit installs: instructions, skills, subagents, hooks, permission profiles |
| `src/runtime/` | The runtime the agent and the hooks use: task state, the check runner, the audit, the gate |
| `src/cli/` | The `paacm` command-line tool: `init`, `upgrade`, `uninstall`, `doctor`, `detect`, `check`, `eval` |
| `plugins/paacm/` | The plugin for both IDEs, generated from `src/content/` and `src/runtime/` |

## Status and limits

PAACM 3.0.0 is a complete implementation of the specification for Claude Code and Cursor. Markdown instructions are guidance; the enforcement comes from the hooks, the IDE's permissions and its sandbox. Use the power layer or a plugin when enforcement matters. The method's evidence comes from published studies and vendor guidance, not from your code: [evaluate it](docs/guide/evaluation.md) on tasks from your own history before relying on a claim that it helps.

Upgrading from PAACM 2.0.0: see [upgrading-from-2.md](docs/guide/upgrading-from-2.md).

## Contributing and licence

See [CONTRIBUTING.md](CONTRIBUTING.md). Apache-2.0; see [LICENSE](LICENSE).
