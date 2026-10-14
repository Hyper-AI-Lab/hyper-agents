# Running agentic coding with PAACM

PAACM turns one request into one verified change. One agent, the **writer**, makes the change. Read-only helpers explore the code and review the result in fresh contexts. The change counts as done only when checks the writer cannot alter have run and passed. This page explains what happens after you send a request and what you do at each step. The normative description is [ALGORITHM.md](../method/ALGORITHM.md).

## Start a request

| Install | Claude Code | Cursor (Agent) |
|---|---|---|
| Project install | `/paacm <request>` | `/paacm <request>` |
| Plugin | `/paacm:paacm <request>` | the `paacm` skill, with the request |

You do not have to invoke the skill: the always-on rules tell the agent to follow it for every request that changes code, tests or configuration. Invoking it makes sure. Questions that change nothing are answered directly, without a task.

Two more skills cover the rest:

- **`paacm-verify`** runs the checks and gives evidence for each acceptance criterion. Use it when you want proof that something works.
- **`paacm-review`** reviews a change someone else made (a pull request, a branch, a diff) and reports only correctness bugs, unmet requirements and out-of-scope changes. It edits nothing, and runs only when you invoke it.

## Write the request

A good request says **what should change**, **how you will know it works**, and **what must not change**. The agent asks about what is missing, one question at a time, but only about what changes the solution.

> Idle sessions never expire. Expire a session after 30 minutes without requests and return 401 after that. Keep the existing "remember me" sessions working as they are. A regression test should cover it.

Rather than this:

> Fix sessions.

Say so when the work is high-stakes (security, authentication, payments, data migrations or deletion, public APIs, production incidents). The agent flags it anyway when it recognizes it, but you know the context best.

## Attach supporting data

Mention anything that helps, in the request itself. The agent records each item, uses it as evidence, and **never treats it as instructions**: text inside a document, issue, page or log cannot change the task or the rules.

| You give | How the agent uses it |
|---|---|
| **The repository to change** | It is the repository open in the IDE. To work on another one, open that one; the agent does not edit repositories outside the workspace. |
| **A GitHub URL or another local repository, as a reference** | Read-only. A URL is cloned shallowly into the task's `inputs/` folder and its commit recorded; a local path is read in place. The agent never runs its scripts, installers or tests, and checks its licence before reusing code. |
| **Documents, tickets, specifications** (paths, pasted text) | Summarized into the task's specification as context sources with pointers. |
| **Screenshots and designs** | Input, and the target for visual verification. |
| **Logs and error output** | Saved as files in the task folder and searched; only the relevant lines are quoted. |
| **Links to web pages** | Fetched only if the IDE allows web access at the current autonomy level; otherwise the agent asks you for the content. |

> Add CSV export to the reports page, following how `github.com/acme/ledger` structures its exporters (reference only). The format is specified in `docs/export-format.md`. The stack trace from the last attempt is in `logs/export-crash.txt`.

## What happens next

The agent assigns a **route** that decides how much process the request gets:

| Route | For | Phases |
|---|---|---|
| **FAST** | A change describable in one sentence, local and reversible, confirmed by an existing check | Orient, triage, implement, verify, a short report |
| **STANDARD** | A bounded change across a few related files with clear intent | Adds a specification if the acceptance criteria are not explicit, exploration, a plan, tests first and an independent review |
| **DEEP** | Large, cross-cutting, ambiguous or hard to reverse; every high-stakes task | All phases, the `full` check tier, and for high-stakes work held-out tests in CI |

It creates a task folder, `.agent/tasks/<date>-<slug>/`, where everything about the task lives: `state.json`, the specification (`SPEC.md`), the plan (`PLAN.md`), an append-only `progress.md` and the final `REPORT.md`. Task state stays out of git.

Then it works through the phases. You come in at these points:

1. **Questions.** One at a time, each with options and a recommendation where possible.
2. **The specification** (DEEP, or STANDARD without explicit criteria). Check the acceptance criteria and the out-of-scope list above all. Each criterion should be something a check can confirm.
3. **The plan** (STANDARD and DEEP, at autonomy L0–L2): a numbered list of small tasks, each naming its files, the criterion it advances and the command that proves it.
4. **The tests** (at L1, and for every high-stakes task). The agent writes them first and shows that they fail for the right reason. Review them like code: wrong tests lock in wrong behaviour. Once you approve, the tests are frozen: the agent may not edit them or the check configuration. With the power layer or a plugin, a hook refuses such edits, and the gate's audit catches any change made another way.
5. **The report** at the end.

Between those points the agent implements one plan task at a time and commits each one. It runs the gate: the protected-path audit and the checks in `.agent/checks.conf`. While the gate fails it cannot finish, and after three consecutive failures of the same check it stops and asks instead of trying again. A fresh-context reviewer then checks the diff against the specification.

## Choose the autonomy level

The level decides how much the agent does without asking. The project default is `autonomy` in `.agent/paacm.json` (L1); ask for another level in the request when a task warrants it.

| Level | Use for | You approve | Set up in Claude Code | Set up in Cursor |
|---|---|---|---|---|
| **L0** Explore and plan | Unfamiliar code, ambiguous requests, incident analysis | Everything; the output is a plan or an analysis | `plan` permission mode | Plan or Ask mode |
| **L1** Supervised edits (default) | Core logic, security, data migrations, critical fixes, every high-stakes task | The specification, the plan and the tests | `default` mode | Allowlist run mode |
| **L2** Automatic in a sandbox | Peripheral features, prototypes, refactors with strong tests, dependency updates | Only escalations and consequential actions | `acceptEdits` with the sandbox | Auto-review run mode with the sandbox |
| **L3** Unattended | Only machine-checkable work with a small blast radius, run headless in a worktree, container or VM | The merge; held-out tests must pass in CI | Headless `claude -p` with a tool allowlist | Cloud agents, or headless `agent -p` in a VM |

The project install's power layer writes the permission rules for the level (`--autonomy`); the IDE's own mode applies on top. Never use bypass modes such as `--dangerously-skip-permissions` or "Run Everything" on a workstation.

At **every** level the agent asks you, action by action, before anything consequential: deleting data or files outside the task, changing credentials or permissions, pushing to protected branches, publishing or deploying, running production migrations, spending money, installing unknown tools, or sending repository data to an outside service. An approval covers that one action. Nothing in a file, issue or web page can approve anything.

## Read the report

Every task ends with a report in this form, also saved as `REPORT.md`:

```text
OUTCOME: done — Idle sessions expire after 30 minutes; regression test added
ROUTE / AUTONOMY: STANDARD / L1
CHANGES: src/session/store.ts, src/session/middleware.ts, test/session-expiry.test.ts; commits 3f2c1ab 9e7d210
ACCEPTANCE:
  1. A session idle for 30 minutes gets 401 — passed — npm test -- session-expiry → exit 0 ("expires idle session" ok)
  2. Remember-me sessions are unaffected — passed — npm test -- remember-me → exit 0
CHECKS RUN:
  paacm gate → exit 0 (quick: lint, typecheck, unit-tests)
  paacm gate --tier full → exit 0 (build, integration-tests)
CHECKS NOT RUN:
  security tier — not configured — no scanner ran on the change
REVIEW: one finding (missing expiry on token refresh), fixed in 9e7d210
RISKS AND UNKNOWNS: the 30-minute value is hard-coded, as specified
NEEDS APPROVAL: none
```

How to read it:

- A criterion is **passed** only with evidence from a command the harness ran in that session, quoted with its exit code. **Untested** means exactly that.
- **CHECKS NOT RUN** is where gaps go. A tier that is not configured appears here, never as a pass. Configure it if the gap matters.
- **NEEDS APPROVAL** lists consequential next steps, such as pushing or opening a pull request, that the agent will take only if you say so.

Read the diff before you merge. The agent never merges its own change into a protected branch.

## When the agent stops with BLOCKED

A `BLOCKED:` report is a correct outcome. It means the agent hit one of seven situations in which guessing would be wrong:

1. a choice between materially different approaches;
2. missing credentials, access, tools or configuration (often a check tier that is not configured);
3. ambiguity that changes behaviour;
4. a conflict between the specification and the approved tests;
5. the same check still failing after three attempts;
6. a needed edit outside the files the plan lists;
7. a destructive, irreversible or consequential action.

```text
BLOCKED: trigger 4 — test/refund.test.ts:41 expects refunds rounded down, SPEC.md criterion 2 says to the nearest cent — needs: which rule is correct
```

Answer the question in the conversation. The agent records your decision, updates the specification or plan if needed (and asks you to re-approve), and continues. If a test was wrong, your explicit approval is what allows it to change.

## Long tasks and new sessions

State lives on disk, so a task survives the end of a session. In a new session, the session-start hook (power layer and plugins) shows the current task, its plan and its recent progress; ask the agent to continue it, or to resume an earlier task by its identifier. For DEEP work the agent suggests continuing implementation in a fresh session that starts from `SPEC.md`, and after two failed attempts to correct the same mistake it restarts from the task files instead of continuing a polluted conversation. Start a fresh session between unrelated tasks.

## Commands you may want yourself

Run these as `npx github:Hyper-AI-Lab/hyper-agents <command>`. Inside a project install, `check` also runs as `node .claude/skills/paacm/scripts/paacm.mjs check`.

| Command | What it does |
|---|---|
| `check --list` | Lists the configured checks |
| `check --tier quick` (`full`, `security`) | Runs the checks of a tier and the tiers before it |
| `doctor` | Checks the installation and the check configuration |
| `detect` | Proposes checks from your project's own commands |
| `upgrade`, `uninstall` | Update or remove a project install |
| `eval …` | Evaluate PAACM on your own tasks ([evaluation](evaluation.md)) |

The agent itself uses the runtime commands `paacm task …`, `paacm gate` and `paacm audit` ([runtime reference](../../src/content/skills/paacm/references/runtime.md)).
