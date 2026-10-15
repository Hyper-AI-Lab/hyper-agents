# Worked examples

Each example shows the request, where you come in, and how the task ends. Agent output is abridged.

## 1. A FAST fix in Claude Code (project install)

The error message for an expired invoice says "experied". An existing test covers the message format.

```text
/paacm Fix the typo "experied" in the expired-invoice error message.
```

The agent restates the request, assigns route FAST (one-sentence diff, local, covered by an existing test) and starts a task. Before changing anything it approves the existing tests (`paacm task approve-tests`), so they are protected, then edits the message, runs the gate and commits.

```text
OUTCOME: done — fixed the typo in the expired-invoice error message
ROUTE / AUTONOMY: FAST / L1
CHANGES: src/billing/errors.ts; commit 5b0e2d1
ACCEPTANCE:
  1. The message reads "expired" — passed — paacm gate → exit 0 (unit-tests: "invoice errors" ok)
CHECKS RUN:
  paacm gate → exit 0 (quick: lint, typecheck, unit-tests)
CHECKS NOT RUN: none
REVIEW: not run (FAST)
RISKS AND UNKNOWNS: none
NEEDS APPROVAL: none
```

You approved nothing, because there was no specification, plan or new test to approve.

## 2. A STANDARD bug fix in Cursor (project install, power layer), with a log

CSV exports with more than 10,000 rows come out truncated. A customer sent the export and the server log.

```text
/paacm Large CSV exports are cut off at 10,000 rows; they should contain every row.
The server log from the failed export is in logs/export-2026-10-12.txt.
```

1. **Triage.** STANDARD: a bounded bug with clear intent. The agent saves the log in the task's `inputs/` folder and searches it instead of reading it whole. It finds `pageSize: 10000` next to a missing continuation token.
2. **Explore.** `paacm-explorer` returns pointers: `src/export/csv.ts:88-121` pages through results, `test/export/csv.test.ts` covers small exports only.
3. **Plan.** Two tasks: a regression test with 25,000 rows, then the fix that follows the continuation token. You approve it.
4. **Tests first.** The new test fails with `expected 25000 rows, received 10000`, the right reason. At L1 you approve the test; the agent commits it and approves the tests.
5. **Implement and verify.** The agent fixes the paging loop, the gate passes, and the reviewer, in a fresh context with only the diff, the plan and the gate output, finds no blocking issue.

```text
OUTCOME: done — CSV exports follow the continuation token and include every row
ROUTE / AUTONOMY: STANDARD / L1
CHANGES: src/export/csv.ts, test/export/csv.test.ts; commits a41c9e0 (test) 0d7f3b2 (fix)
ACCEPTANCE:
  1. An export of 25,000 rows contains 25,000 rows — passed — npx vitest run test/export/csv.test.ts → exit 0
CHECKS RUN:
  paacm gate → exit 0 (quick)
  paacm gate --tier full → exit 0 (build, integration-tests)
CHECKS NOT RUN:
  security tier — not configured — no scanner ran
REVIEW: No blocking findings
RISKS AND UNKNOWNS: exports above 1,000,000 rows were not tested
NEEDS APPROVAL: push the branch and open a pull request?
```

## 3. A DEEP feature in Claude Code, with a reference repository

```text
/paacm Add per-tenant rate limiting to the public API: a configurable limit per minute,
429 with Retry-After when exceeded. Use the token-bucket approach of
https://github.com/acme/limiter as a reference (do not copy code).
The product requirements are in docs/rate-limits.md.
```

1. **Triage.** DEEP and high-stakes (a public API), so autonomy L1. The agent clones the reference shallowly into `.agent/tasks/2026-10-14-tenant-rate-limit/inputs/limiter/` and records its commit. It reads `docs/rate-limits.md`. It runs nothing from the reference repository.
2. **Specify.** It asks one question at a time: "Should the limit apply per API key or per tenant when a tenant has several keys? I recommend per tenant, as `docs/rate-limits.md` §2 implies." It then writes `SPEC.md`: goal, context sources with pointers, constraints, out of scope ("no limits on internal endpoints"), boundaries, numbered acceptance criteria, and the exact commands that prove them. You approve it.
3. **Fresh session.** The agent suggests continuing in a new session that starts from `SPEC.md`. In it, the session-start hook shows the task and its state.
4. **Plan, tests, implementation.** You approve the plan and the acceptance tests. The agent implements the plan task by task, one commit each. The gate runs the `full` tier because the route is DEEP.
5. **Held-out tests.** Because the task is high-stakes, the report lists the held-out acceptance tests in CI as a step that still has to run before you merge.

## 4. A task that stops with BLOCKED

During a STANDARD task the gate fails three times on the same integration test, because the test needs a database the environment does not have.

```text
BLOCKED: trigger 5 — integration-tests failed 3 times in a row: "connect ECONNREFUSED 127.0.0.1:5432" (paacm gate → exit 1) — needs: a running test database, or approval to record this check under CHECKS NOT RUN
```

The agent stopped instead of trying a fourth fix or editing the test. Start the database and say "continue", or decide that the check is not needed for this change. Either decision goes into the task log.

## 5. An unattended run (L3)

For machine-checkable work with a small blast radius, such as a dependency update with a strong test suite, run Claude Code headless in a disposable worktree whose project install uses `--autonomy L3`:

```bash
git worktree add ../app-deps-update -b deps-update
```

```bash
cd ../app-deps-update && claude -p "/paacm Update eslint to the latest 9.x release and fix any new lint errors" --max-turns 80
```

The L3 profile gives Claude Code the sandbox and its permission rules; the hooks and the gate apply as always. A reviewer critiques the plan instead of you. The run ends with a report, or a `BLOCKED:` line, in the output and in `REPORT.md`. Review the branch, let held-out tests run in CI, and merge it yourself.
