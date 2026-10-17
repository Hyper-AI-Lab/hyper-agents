# 0018. Test strength: property-based tests and an optional mutation check

- **Status:** accepted
- **Date:** 2026-10-17

## Context

After `testsApprovedAt` the tests are frozen ([ADR 0003](0003-protected-tests-and-blocked-exit.md)), so every later rung of the verification ladder is only as strong as those tests. Coverage does not measure whether they catch faults.

## Decision

Phase 5 adds a property-based test for rule evaluation, parsing and transformations when the project has a property-testing library. A project may add a mutation check to the `full` tier. When it fails, the writer does not edit the frozen tests; it reports the surviving mutants and stops with `BLOCKED:` trigger 4, so the human decides whether to approve more tests.

## Evidence

- Test suites can reach 100% coverage with a 4% mutation score; feeding surviving mutants back to an LLM raised mutation scores significantly over prompting alone and over EvoSuite on 204 subjects ([MutGen, arXiv 2506.02954](https://arxiv.org/abs/2506.02954)) [PR, IEEE TSE 2026].
- An agent writing Hypothesis property tests for 100 Python packages produced bug reports of which 56% were valid, 86% among the top-ranked ones; maintainers merged several of its fixes ([arXiv 2510.09907](https://arxiv.org/abs/2510.09907)) [PR, NeurIPS 2025]. Across models, property-test prompting recalled 42–83% of seeded bugs ([PBT-Bench, arXiv 2605.15229](https://arxiv.org/abs/2605.15229)) [PP].
- StrykerJS fails a run below its `thresholds.break` score and can re-test only what changed with `--incremental`; mutmut re-tests only functions whose source changed but documents no failing exit code ([Stryker](https://stryker-mutator.io/docs/stryker-js/configuration/); [mutmut](https://mutmut.readthedocs.io/en/latest/)) [V].

## Consequences

Weak approved tests become visible before delivery instead of after a regression. Mutation runs are slow, so they belong to the `full` tier, and a project chooses the threshold and the scope. A property-testing library is a new test dependency the project decides on.

## Alternatives considered

Running mutation testing when the tests are approved (impossible: the implementation does not exist yet and the new tests fail), and letting the writer strengthen the tests itself after a failed mutation check (rejected: it would reopen the tests the human froze).
