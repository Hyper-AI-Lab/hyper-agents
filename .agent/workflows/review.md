# PAACM review workflow

Review against the user's contract and repository behavior, not only style or whether tests pass.

## Sequence

1. Read the change request, constraints, relevant instructions, and diff.
2. Trace changed behavior and call sites. Look for correctness, API compatibility, data loss, concurrency, security, error handling, and test coverage.
3. Distinguish confirmed defects from plausible risks and stylistic suggestions. Cite specific file/line evidence when possible.
4. Check verification evidence. Tests can pass while semantics are wrong; note blind spots and untested edge cases.
5. For high-risk work, prefer an independent **read-only** reviewer who did not author the patch. Do not let reviewers edit concurrently.
6. Report findings ordered by severity, with impact and reproduction/mitigation. If none are found, state remaining verification gaps.

Never claim to have run tests, inspected files, or reproduced an issue when you have not.