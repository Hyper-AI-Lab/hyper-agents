# Repository-specific PAACM evaluation schema

Compare a baseline (existing agent workflow) against the same representative task set using PAACM. Keep the model, IDE, repository snapshot, and resource budget comparable where possible. Do not claim causality from a handful of cherry-picked successes.

For each task, record:

| Field | Description |
| --- | --- |
| task_id | Stable anonymized identifier |
| repo_revision | Starting commit SHA |
| task_type / risk | Bug, feature, refactor; FAST/STANDARD/DEEP |
| condition | Baseline, policy-only, PAACM, or optional component |
| acceptance | Held-out behavior and regression checks |
| accepted | Reviewer-approved and regression-free? |
| elapsed_time | Time to accepted change |
| model_usage / cost | Tokens or cost where available |
| attempts / corrections | Number of retries and human interventions |
| verification | Commands, exit codes, missing checks |
| safety | Unapproved side effects, secrets, destructive actions |
| recovery | Ability to resume after interruption |
| notes | Failure mode and confounders |

Report success rate, cost per accepted task, time to green, human corrections, safety incidents, and variability. Test optional reviewer/subagent/MCP additions independently. No single benchmark establishes universal optimality.