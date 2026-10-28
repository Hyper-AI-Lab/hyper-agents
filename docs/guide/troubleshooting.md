# Troubleshooting and FAQ

Start with `npx github:Hyper-AI-Lab/hyper-agents doctor` in the repository; most problems show up there.

## Troubleshooting

### `/paacm` is not offered

- **Plugin in Claude Code:** plugin skills are namespaced; use `/paacm:paacm`. Check that `/plugin` lists `paacm` as enabled.
- **Project install:** `.claude/skills/paacm/SKILL.md` must exist. Run `doctor`, then restart the session.
- **Cursor:** after installing or upgrading the local plugin, restart Cursor or run **Developer: Reload Window**.

### The gate says a tier has no checks (exit code 3)

```text
UNCONFIGURED: tier(s) quick have no checks in .agent/checks.conf.
```

The task needs a check tier that `.agent/checks.conf` does not define. PAACM fails closed: a missing check never counts as a pass. Add commands for that tier ([configure the checks](setup.md#configure-the-checks)); `detect` proposes some. DEEP tasks need the `full` tier.

### The whitespace check fails with "ambiguous argument 'HEAD'"

The repository has no commits yet. Make a first commit. Tests also cannot be approved before then.

### The agent stopped with `BLOCKED: trigger 5`

The same check failed three times in a row, and the agent stopped instead of guessing a fourth time. The report quotes the failing output. Often the cause is the environment (a service that is not running, a missing tool or credential) rather than the code. Fix it and say "continue", or tell the agent how to proceed.

### "PAACM: … is a test file, and the tests were approved at …"

Test files are read-only once you approve the tests, so the agent cannot change the target to pass it. If a test really is wrong, the agent should stop with `BLOCKED: trigger 4` and show the conflict. Approve the specific change in the conversation. The agent then runs `paacm task reopen-tests --reason "<the change you approved>"`, which the IDE asks you to confirm, makes only that change, commits it and runs `paacm task approve-tests` again. `approve-tests` alone refuses to take a new baseline over a changed test, so a test edited some other way (through the shell, or brought in by a merge) also goes through this confirmation.

### Edits to settings, hooks, CI or `.agent/checks.conf` are refused or need approval

These files make other programs run commands, so PAACM protects them. Claude Code asks you to approve each such edit. Cursor refuses them: make the change yourself, or remove its pattern from `protect.config` in `.agent/paacm.json` for the duration of the change. The defaults are listed in [src/runtime/lib/config.mjs](../../src/runtime/lib/config.mjs).

### "PAACM shell guard: blocked because this command …"

The shell guard denies the most damaging command patterns (disabling permission checks, piping a download into a shell, deleting the root, home or whole working tree, formatting disks, writing into `.git/hooks`, rewriting agent configuration through the shell). It asks before consequential ones (skipping the repository's git hooks with `--no-verify`, `core.hooksPath` or `HUSKY=0`, pushing, discarding work or rewriting history, recursive deletion, deploying, dropping database objects, broad permission changes). Run a denied command yourself if you are sure it is right.

### "N file(s) changed in this session and no PAACM task is active"

The agent edited files without starting a task, so nothing verified the edits. If it was a coding request, the agent should start a task and run the gate; if you asked for a quick edit outside PAACM, it says so and finishes. Files that were already uncommitted when the session started count only if they changed during the session. If the message says the files "have uncommitted changes" instead, PAACM has no record of the session's start (for example, it was installed during the session), so every uncommitted file is listed.

### `paacm task done` refuses to close the task

It closes only a finished task, and the message says what is missing:

- **The phase.** STANDARD and DEEP tasks close after the review (`paacm task phase reviewing`), FAST tasks after verification (`paacm task phase verifying`).
- **Approved tests.** `paacm task approve-tests` was never run, so the audit had nothing to protect.
- **The gate.** It must have passed at the current commit with nothing uncommitted, at the route's tier or higher (`full` for DEEP by default). A `paacm gate --tier quick` does not close a DEEP task.
- **The report.** `REPORT.md` in the task folder must begin with `OUTCOME: done`. A blocked task is closed with `paacm task block` instead.

### "The gate is green, but task … is still …"

The stop hook nudges once when the agent tries to stop with an open task whose gate passes, and once when a STANDARD or DEEP task changed files without recording its phases. If the agent is waiting for your answer, it says so and stops again; the second stop is always let through. Claude Code shows a nudge as stop hook feedback, not as a hook error; only a failing gate is reported as a blocking error.

### A check fails with exit code 127

The check could not find a command (on Windows, exit code 9009): the tool is not installed where the agent runs, or not on the `PATH` of the IDE. The gate prints a hint, and the agent stops with `BLOCKED: trigger 2` instead of changing code. Install the tool and say "continue", or take the check out of the tier the task needs. `doctor` lists the check programs it cannot find.

### "PAACM could not record the session baseline"

The session start could not write to `paacm-sessions/` in the worktree's git directory, for example because the clone belongs to another account. The session works normally; only the stop hook's list of files changed without a task falls back to every uncommitted file. Give each person their own clone ([shared machines](setup.md#shared-machines)).

### Edits in a worktree are judged by that worktree

Each linked worktree, next to the project or nested in it (for example under `.claude/worktrees/`), has its own `.agent/tasks/` and its own current task. The protect hook checks an edit against the worktree the file is in. An approved test in a worktree is read-only even when the agent's session started in the main checkout, and an ordinary file in a nested worktree is no longer treated as agent configuration. Moving into a worktree does not release the session's own task: the stop hook still checks it. If you open a folder that holds several checkouts (not itself a git repository), each checkout below it is protected by its own rules.

### `init` lists conflicts and writes nothing

- **"a different file already exists here":** a file at a path PAACM installs. Rename or merge it, then run `init` again.
- **"the file contains comments, which rewriting would remove":** a JSON settings file with comments. Remove the comments, or add PAACM's entries by hand.
- **"refusing to write through symbolic link":** PAACM never writes through symbolic links. Replace the link with a real folder, or install by hand.

[INSTALL_PROMPT.md](../../INSTALL_PROMPT.md) is a prompt that lets your agent resolve the conflicts with you.

### Shell commands are refused at autonomy L2 or L3

Those levels require the Claude Code sandbox and refuse to run without it. On Linux and WSL2, install `bubblewrap` and `socat`. Native Windows has no Claude Code sandbox: use WSL2, or `upgrade --autonomy L1`.

### Every edit is blocked after installing the power layer

The protect hook and the shell guard fail closed: if they cannot run, the edit or command is refused. They need `node` (version 20 or later) on the `PATH` of the IDE. Check with `doctor`, and restart the IDE after installing Node.js.

### Cursor runs PAACM's hooks twice

With both IDEs installed, Cursor also imports the Claude Code hooks from `.claude/settings.json`. PAACM recognizes the duplicate stop calls and runs the checks once. You can also turn off Cursor's import of third-party hooks in its settings.

## FAQ

**Which setup should I start with?**
The plugin for your IDE, if only you or only one IDE is involved. A project install (`--layer power`) if the team should share the same configuration through git.

**Do I need the power layer?**
The core layer gives the agent the method; the power layer enforces it. Without it, protected tests and the gate depend on the agent following instructions. Both plugins include the hooks.

**Does PAACM send my code anywhere?**
No. The runtime and the hooks run locally and make no network requests. Your IDE talks to its model as it always does, and PAACM tells the agent not to send repository data to outside services without your approval.

**Does it work with other agents or IDEs?**
PAACM supports Claude Code and Cursor. Other tools that read `AGENTS.md` see the core rules, but skills, subagents and hooks are not guaranteed to work there.

**Can several agents work at once?**
Only on independent work, each in its own git worktree. Two agents never share a working tree.

**Why does a one-line fix create a task folder?**
The task records the starting commit, which the protected-path audit and the review diff need. For FAST tasks that is almost all the overhead.

**Can we commit specifications and plans?**
Task folders are ignored by git by default. Commit a `SPEC.md` or `PLAN.md` with `git add -f` if your team wants them in history.

**How do I change what counts as a test file?**
Edit `protect.tests` in `.agent/paacm.json`. A project install writes the defaults there; with a plugin, create the file with only the keys you want to change.

**Is PAACM worth it on our code?**
Measure it: [evaluation](evaluation.md) compares PAACM, a plain prompt and PAACM without single components on tasks from your own history.
