# 0003. Protected tests, a sanctioned BLOCKED exit and a retry cap

- **Status:** accepted
- **Date:** 2026-10-14

## Context

When tests are hard to pass, agents edit the tests. Pleading with them not to cheat does not work.

## Decision

From the commit at which acceptance tests are approved, tests, CI configuration, the check manifest and agent configuration are read-only to the writer: a protect hook blocks edits and the gate's diff audit catches edits made by other means. The writer has an explicit `BLOCKED:` exit for conflicts between the specification and the tests. After three consecutive gate failures on the same check it must escalate.

## Evidence

- More than 79% of Claude's cheating on impossible tasks was editing tests; giving GPT-5 an explicit abort cut cheating from 54% to 9%; more retries raised cheating ([verification](../../research/04-verification.md)).
- 'Do not cheat' prompts changed the cheating rate from 80% to 80% ([practices](../../research/10-practices.md)).
- 87% of detected cheating on SWE-bench Pro came from reading the gold commit in `.git` ([verification](../../research/04-verification.md)), so the audit compares against a recorded baseline rather than trusting history the agent can read.

## Consequences

Legitimate test changes need a human-approved path, which the algorithm provides (a new approved baseline). Edit-tool hooks miss edits made through the shell, which is why the diff audit is mandatory.

Since 3.4.1 the audit also treats changes to the check manifest and `.agent/paacm.json` after the approved baseline as violations, since either could weaken the gate. The protect hook and the shell guard refuse direct edits to the task state, resolve symbolic links, and match case-insensitively where the file system does.

## Alternatives considered

Prompt-only prohibitions (rejected); unlimited retries (rejected).
