# Extending PAACM for your project

Most repositories that adopt PAACM already have conventions of their own. These include a knowledge base, a roadmap or plan of plans, review checklists, specialist reviewer agents, a learnings file, and paths that need extra care. This page explains where each kind of project rule belongs, so that PAACM and your conventions work as one process instead of two competing ones. The normative rules are in [ALGORITHM.md section 15](../method/ALGORITHM.md#15-project-extensions).

## Where a project rule belongs

| The rule | Put it in | Why |
|---|---|---|
| A fact the agent needs in every session: a build command it cannot guess, a non-default convention, a hard boundary | `AGENTS.md`, outside the PAACM block (and `CLAUDE.md` for Claude Code) | Always loaded; keep it short |
| What to do in one phase: sources to read at intake, fields a spec must have, reviewers to run, a checklist, what to do before delivery | `.agent/extensions/<reference>.md` | Loaded exactly when that phase starts |
| A command that proves the change works | `.agent/checks.conf` | Run by the gate; a check the agent cannot skip |
| Autonomy default, gate tiers, retry cap, protected paths, post-edit commands | `.agent/paacm.json` | Read by the hooks and the runtime |

## Extension files

An extension is a Markdown file named after a reference of the `paacm` skill:

| Phase or topic | Extension file |
|---|---|
| Orient | `.agent/extensions/00-orient.md` |
| Intake and triage | `.agent/extensions/01-intake-triage.md` |
| Specify | `.agent/extensions/02-specify.md` |
| Explore | `.agent/extensions/03-explore.md` |
| Plan | `.agent/extensions/04-plan.md` |
| Tests first | `.agent/extensions/05-tests-first.md` |
| Implement | `.agent/extensions/06-implement.md` |
| Verify (also read by `paacm-verify`) | `.agent/extensions/07-verify.md` |
| Review (also read by `paacm-review`) | `.agent/extensions/08-review.md` |
| Deliver | `.agent/extensions/09-deliver.md` |
| Autonomy, context, debugging, delegation, escalation, MCP, runtime, security | `.agent/extensions/autonomy.md`, `context.md`, `debugging.md`, `delegation.md`, `escalation.md`, `mcp.md`, `runtime.md`, `security.md` |

How the agent finds them:

- Every reference ends with a reminder to read its extension.
- The session-start message lists the extensions the repository has.
- `paacm doctor` warns about a file whose name matches no reference, because the agent would never read it.

What an extension may contain:

- **Additions only.** Steps, fields, sources to read, reviewers to run and checks to apply.
- **No gate removals.** It never removes or weakens a gate: the human approvals, frozen tests, the gate and its retry cap, the escalation triggers, approval of consequential actions. If an extension conflicts with a gate, the agent follows the gate and tells you.
- **`## Reviewer checklist`** in `08-review.md` is special. `paacm task review-input` copies that section into the review input, so the fresh-context reviewer checks every item. Write each item as something the reviewer can confirm against a diff. Only this section reaches the reviewer: put every reviewer rule under it, using `###` subheadings if needed, and keep the other sections for instructions to the writer. `paacm doctor` warns when the section is missing and names the sections that stay with the writer. The reviewer has no shell: if it needs a tool's output, have the writer save it in the task folder, where the review input lists it.
- **Explorer requirements.** The explorer subagent does not read extensions. The explore reference tells the writer to put the requirements of `03-explore.md` (sources to search, conventions to report) into the explorer's brief.

Extensions are protected configuration (`.agent/extensions/**`), like the checks and the hooks. The agent does not edit them during a task without your approval. Change them in a reviewed pull request, as you would any process change.

## Merging an existing team workflow

If your repository already has agent commands, reviewers and rules, map them onto PAACM's phases rather than running both:

| Your existing piece | In PAACM |
|---|---|
| A planning command (`/plan`) | An entry-point skill that runs phases 0–4 and stops for plan approval |
| An implementation command (`/implement`) | An entry-point skill that runs phases 5–9 for the approved plan |
| A debugging procedure | `.agent/extensions/debugging.md` |
| A review checklist | `## Reviewer checklist` in `.agent/extensions/08-review.md` |
| Specialist reviewer agents (security, performance, accessibility) | Named in `.agent/extensions/08-review.md`, with when each one runs; they receive the same `review-input.md` |
| A "sensitive areas" rule | `.agent/extensions/01-intake-triage.md`: mark such tasks high-stakes (route DEEP, autonomy L1), plus the paths in `protect.config` |
| A learnings file the agent appends to | `.agent/extensions/09-deliver.md`; keep the file out of `protect.config` so the agent can write it |
| A verification table in the instructions | `.agent/checks.conf`, with the instructions pointing to it |
| Existing hooks | Keep them; PAACM's settings merge adds its hooks next to yours |

Write entry points as skills (`.claude/skills/<name>/SKILL.md` with `disable-model-invocation: true`), so that they run only when a person invokes them and both IDEs can load them.

## A knowledge base

When the repository has a knowledge base the agent must use and keep current:

1. **`01-intake-triage.md`:** read the decision log and the open questions before triage. A business rule that is still open is escalation trigger 3: stop and name who decides.
2. **`02-specify.md`:** list the knowledge-base notes the task relies on under the spec's context sources, by id.
3. **`03-explore.md`:** search the knowledge base with its index or search tool alongside the code, and include it in the explorer's brief.
4. **`04-plan.md`:** make the knowledge-base update the **last task of the plan**. If the knowledge base's own checks are in the `quick` tier (step 5), the gate runs them before delivery, so the notes must already be current when the gate runs.
5. **`.agent/checks.conf`:** add the knowledge base's validators (for example a schema check and a "notes cite changed files" check) to the `quick` tier.
6. **`09-deliver.md`:** report which notes changed.

## A roadmap or plan of plans

When work must follow a roadmap whose items have owners, preconditions and reserved decisions:

1. **`01-intake-triage.md`:** identify the roadmap item the request belongs to and check its preconditions. If a precondition is not met, or the request would make a decision the roadmap reserves for someone else, stop with `BLOCKED:` and name the owner.
2. **`02-specify.md`:** record the roadmap item and the state of its dependencies in the spec.

## Writing extension text

An extension is read by an agent on every task that reaches its phase, so each line costs attention every time. These rules follow Matt Pocock's guidance on writing for agents ([writing-for-agents](https://github.com/mattpocock/skills/tree/main/skills/productivity/writing-for-agents)):

- **Say what to do.** A rule that only forbids something keeps the forbidden behaviour in mind. Pair any hard ban with the behaviour you want.
- **Point instead of copying.** Name the file and the condition for reading it: "before planning a change to billing, read `docs/billing.md`". The wording of the pointer decides when the agent follows it.
- **Keep each rule in one place.** Other files point to it, so a change is one edit.
- **Cut lines that change nothing.** A line the agent would follow anyway costs context and changes no behaviour. Test a doubtful line by running a task without it.
- **End each step on a checkable condition**, such as "every note that cites a changed file has a new `last_verified`", not a vague one such as "the notes are updated".

## Cursor

Cursor reads the skills in `.claude/skills/`, the agents in `.claude/agents/`, `AGENTS.md` and `CLAUDE.md`, and PAACM installs its Cursor hooks in `.cursor/hooks.json`. Cursor's documentation does not list `.claude/rules/`. If your project keeps rules there, point to them from an always-applied Cursor rule in `.cursor/rules/`.

In Cursor the protect hook **denies** edits to protected configuration, where Claude Code asks. A person makes those edits, or changes `protect.config` for the duration of the change.

## Upgrading from 3.0

Before 3.1, `paacm init` wrote the default protect list into `.agent/paacm.json` without `.agent/extensions/**`. If you add extensions to such an install, add `".agent/extensions/**"` to `protect.config`; `paacm doctor` reports when it is missing.

## A worked example

A repository keeps a knowledge base in `docs/kb/`, with a validator `python3 docs/kb/validate.py`. Reviewers must check that every new API endpoint has an authorization test.

`.agent/checks.conf`:

```text
quick|kb-validate|python3 docs/kb/validate.py
```

`.agent/extensions/01-intake-triage.md`:

```markdown
# Intake: project additions

1. Before assigning the route, read `docs/kb/decisions.md` and `docs/kb/open-questions.md`.
2. If the request depends on an open question, stop with BLOCKED: trigger 3 and name the owner listed in the question.
3. Changes under `src/auth/` or `migrations/` are high-stakes.
```

`.agent/extensions/08-review.md`:

```markdown
# Review: project additions

Also run the `security-reviewer` agent on the same review input when the diff touches `src/api/`.

## Reviewer checklist

- Every new API endpoint has a test that a caller without the required role gets 403.
- No migration drops a column without a backfill step.
```

The session-start message then lists `01-intake-triage, 08-review`, and the reviewer receives both checklist items in `review-input.md`.
