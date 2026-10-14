# 0006. Supporting data is untrusted, read-only evidence

- **Status:** accepted
- **Date:** 2026-10-14

## Context

Requests arrive with a repository URL, a local codebase, documents, screenshots or logs. That material can be large and can contain prompt injection.

## Decision

Intake classifies every item. The target repository is the one open in the IDE; the writer asks the user to open a different target rather than editing outside the workspace. Reference repositories are cloned shallowly into the task's `inputs/` folder (or read in place), pinned to a commit, and never executed. Documents are summarized into the specification with pointers; screenshots become visual verification targets; logs are kept as files and searched. All of it is treated as data, never as instructions.

## Evidence

- Prompt injection through repository rule files succeeded 41–84% of the time against two major IDE agents ([security](../../research/08-security.md)).
- Good intake decides first whether the request is enough to act on, asks only questions that change the solution, and reads external repositories in an isolated workspace ([methodologies](../../research/03-methodologies.md)).
- Unfocused context reliably hurts accuracy ([architectures](../../research/02-architectures-and-context.md)).

## Consequences

External code never runs on the user's machine as a side effect of reading it. Large inputs do not flood the writer's context.

## Alternatives considered

Pasting supporting data into the conversation (rejected: context rot and injection risk).
