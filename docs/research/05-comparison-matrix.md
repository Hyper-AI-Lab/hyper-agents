# Six criteria score fifty-three approaches in one comparison matrix

The matrix below scores every approach covered above on the six requested criteria, using a 1–5 scale where 5 is best. These are this study's judgments from the cited evidence, not measurements.

| Criterion | What a 5 means |
|---|---|
| **Efficiency** | Lowest tokens, money and wall-clock per *accepted* outcome |
| **Reliability** | Highest measured or well-supported correctness |
| **Autonomy** | Can run longest unattended within a safe boundary |
| **Clarity** | Leaves the most legible, reviewable artifacts and state |
| **Simplicity** | Lowest setup and operating burden |

**Evidence** uses its own scale:

| Score | Basis |
|---|---|
| 5 | Several converging controlled or peer-reviewed results |
| 4 | One controlled or peer-reviewed result, or a large controlled preprint |
| 3 | Vendor or preprint numbers without controls |
| 2 | Vendor qualitative report or practitioner anecdote |
| 1 | None, or self-published only |

## Methodologies: cheap loops beat full ceremony

| # | Approach | Eff. | Rel. | Aut. | Clar. | Simp. | Evid. | Basis |
|---|---|---|---|---|---|---|---|---|
| 1 | Vendor core loop: explore → size-gated plan → implement → verify → commit | 4 | 4 | 3 | 4 | 5 | 3 | Converged guidance ([Claude Code](https://code.claude.com/docs/en/best-practices), [Codex](https://learn.chatgpt.com/docs/learn/best-practices), [Cursor](https://cursor.com/blog/agent-best-practices)) [V]; plans help, bad plans hurt ([arXiv 2604.12147](https://arxiv.org/abs/2604.12147)) [PP] |
| 2 | Interview → self-contained SPEC.md → fresh session | 3 | 4 | 4 | 5 | 4 | 2 | [Claude Code](https://code.claude.com/docs/en/best-practices) [V] |
| 3 | Long-running harness: initializer, JSON feature list, progress file, `init.sh`, one feature per session | 3 | 4 | 5 | 4 | 3 | 2 | [Anthropic](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) [V], qualitative |
| 4 | OpenAI ExecPlans (living, restartable plan) | 3 | 3 | 4 | 5 | 3 | 2 | [Cookbook](https://developers.openai.com/cookbook/articles/codex_exec_plans) [V]; "7+ hours" unverified |
| 5 | GitHub Spec Kit | 2 | 3 | 3 | 3 | 2 | 2 | No outcome studies; review burden ([Böckeler](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)) [A]; Radar "Assess" ([Thoughtworks](https://www.thoughtworks.com/radar/techniques/spec-driven-development)) [A] |
| 6 | AWS Kiro specs (with Quick Spec) | 2 | 3 | 3 | 3 | 3 | 2 | [Kiro](https://kiro.dev/docs/specs/) [V]; 16 acceptance criteria for a bug fix ([Böckeler](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)) [A] |
| 7 | BMAD Method | 2 | 3 | 3 | 3 | 2 | 1 | [BMAD](https://github.com/bmad-code-org/BMAD-METHOD) [V]; no evaluation |
| 8 | OpenSpec (spec deltas, brownfield) | 3 | 3 | 3 | 4 | 4 | 1 | [OpenSpec](https://github.com/Fission-AI/OpenSpec) [A]; no evaluation |
| 9 | GSD Core (fresh-context waves) | 2 | 3 | 4 | 3 | 3 | 1 | [gsd-core](https://github.com/open-gsd/gsd-core) [A] |
| 10 | Superpowers (brainstorm → worktree → plan → subagent TDD → review) | 2 | 4 | 4 | 4 | 3 | 2 | [superpowers](https://github.com/obra/superpowers) [A]; [Willison](https://simonwillison.net/2025/Oct/10/superpowers/) [A] |
| 11 | Karpathy behavioural guidelines (four rules) | 4 | 3 | 2 | 5 | 5 | 2 | [repo](https://github.com/multica-ai/andrej-karpathy-skills) [A]; targets the "unwanted features" rejections in [arXiv 2601.15195](https://arxiv.org/abs/2601.15195) [PR] |
| 12 | Research → plan → implement with intentional compaction | 4 | 3 | 3 | 4 | 3 | 2 | [HumanLayer](https://github.com/humanlayer/advanced-context-engineering-for-coding-agents/blob/main/ace-fca.md) [A] |
| 13 | Ralph loop (one item per loop, tests as backpressure) | 3 | 2 | 5 | 2 | 4 | 2 | [Huntley](https://ghuntley.com/ralph/) [A]; greenfield only |
| 14 | Task Master (PRD → task graph via MCP) | 2 | 3 | 3 | 4 | 3 | 1 | 36 tools ≈ 21k tokens ([README](https://github.com/eyaltoledano/claude-task-master)) [V] |
| 15 | claude-flow / Ruflo swarm orchestration | 1 | 2 | 3 | 1 | 1 | 1 | Self-published infrastructure metrics only ([README](https://github.com/ruvnet/claude-flow)) [A] |
| 16 | Kent Beck augmented TDD (human picks next test) | 3 | 4 | 2 | 4 | 4 | 2 | [Beck](https://newsletter.kentbeck.com/p/augmented-coding-beyond-the-vibes) [A] |

## Architectures: thin loops and context hygiene lead on efficiency

| # | Approach | Eff. | Rel. | Aut. | Clar. | Simp. | Evid. | Basis |
|---|---|---|---|---|---|---|---|---|
| 17 | Bash-only minimal loop (mini-SWE-agent) | 4 | 4 | 3 | 4 | 5 | 4 | 70–77% Verified with an identical prompt ([Willison](https://simonwillison.net/2026/Feb/19/swe-bench/)) [PP]; bash-only is cheaper for capable models ([arXiv 2609.20804](https://arxiv.org/abs/2609.20804)) [PP] |
| 18 | Two-tool scaffold with exact-match edits and absolute paths | 4 | 4 | 3 | 4 | 5 | 3 | 49% Verified ([Anthropic](https://www.anthropic.com/research/swe-bench-sonnet)) [V] |
| 19 | SWE-agent custom ACI (bounded views, lint guardrail) | 3 | 3 | 3 | 3 | 3 | 4 | Ablations on 2024 models ([arXiv 2405.15793](https://arxiv.org/html/2405.15793)) [PR] |
| 20 | Agentless fixed pipeline | 5 | 3 | 2 | 4 | 3 | 4 | 32.00% Lite at ≈ $0.70 ([arXiv 2407.01489](https://arxiv.org/abs/2407.01489)) [PR] |
| 21 | CodeAct / OpenHands code-as-action | 3 | 4 | 4 | 3 | 3 | 4 | Up to +20% over JSON actions ([arXiv 2402.01030](https://arxiv.org/abs/2402.01030)) [PR] |
| 22 | Aider architect/editor split | 3 | 3 | 2 | 3 | 4 | 3 | +3–5 points on Aider's benchmark ([Aider](https://aider.chat/2024/09/26/architect.html)) [V]; "often faulty" ([Cognition](https://cognition.com/blog/dont-build-multi-agents)) [V] |
| 23 | Single writer with read-only helper subagents (explore, review) | 4 | 4 | 4 | 4 | 4 | 3 | [Cognition](https://cognition.com/blog/multi-agents-working) [V]; [arXiv 2512.08296](https://arxiv.org/abs/2512.08296v2) [PP] |
| 24 | Strong lead plus cheap sidekick (Devin Fusion) | 5 | 4 | 4 | 3 | 3 | 3 | 63.1 at $1.35 vs 63.6 at $3.51 ([Cognition](https://cognition.com/blog/devin-fusion)) [V] |
| 25 | Planner / generator / evaluator harness | 1 | 4 | 5 | 4 | 2 | 2 | $9 broken vs $200 playable ([Anthropic](https://www.anthropic.com/engineering/harness-design-long-running-apps)) [V] |
| 26 | Hierarchical planners, workers and judge at hundreds of agents | 1 | 3 | 5 | 2 | 1 | 2 | 1M+ LoC, "still needed careful review" ([Cursor](https://cursor.com/blog/scaling-agents)) [V] |
| 27 | Lock-file parallel agents in containers, no orchestrator | 2 | 3 | 5 | 3 | 2 | 2 | ≈ $20k, needs a near-perfect oracle ([Anthropic](https://www.anthropic.com/engineering/building-c-compiler)) [V] |
| 28 | Flat peer multi-agent swarm | 1 | 1 | 3 | 1 | 1 | 4 | −39–70% on sequential tasks, 17.2× error amplification ([arXiv 2512.08296](https://arxiv.org/abs/2512.08296v2)) [PP]; [MAST](https://arxiv.org/html/2503.13657v3) [PP] |
| 29 | Best-of-N with regression-test filter and selector | 2 | 5 | 4 | 3 | 2 | 4 | 77.2 → 82.0 ([Anthropic](https://www.anthropic.com/news/claude-sonnet-4-5)) [V]; 60.6 → 66.4 ([OpenHands](https://openhands.dev/blog/sota-on-swe-bench-verified-with-inference-time-scaling-and-critic-model)) [V]; [arXiv 2501.14723](https://arxiv.org/abs/2501.14723) [PP] |
| 30 | MCTS tree search (SWE-Search) | 1 | 4 | 4 | 2 | 1 | 4 | +23% relative ([arXiv 2410.20285](https://arxiv.org/abs/2410.20285)) [PR] |
| 31 | Self-evolving scaffold (Live-SWE-agent) | 3 | 4 | 4 | 2 | 2 | 3 | 77.4% Verified ([arXiv 2511.13646](https://arxiv.org/abs/2511.13646)) [PP] |
| 32 | Agentic grep/glob search, with semantic search for large repos | 4 | 4 | 4 | 4 | 5 | 3 | +12.5% QA accuracy; +2.6% retention on ≥ 1k-file repos ([Cursor](https://cursor.com/blog/semsearch)) [V] |
| 33 | Observation masking / tool-result clearing | 5 | 4 | 4 | 3 | 4 | 4 | About half the cost, same solve rate ([arXiv 2508.21433](https://arxiv.org/abs/2508.21433v3)) [PR]; +29% ([Anthropic](https://claude.com/blog/context-management)) [V] |
| 34 | LLM-summary compaction | 3 | 3 | 4 | 3 | 5 | 4 | No better than masking, at higher cost ([arXiv 2508.21433](https://arxiv.org/abs/2508.21433v3)) [PR] |
| 35 | Minimal, human-written instruction file | 4 | 3 | 3 | 5 | 5 | 4 | About +4% for developer-written files ([arXiv 2602.11988](https://arxiv.org/abs/2602.11988)) [PP]; [IFScale](https://arxiv.org/abs/2507.11538) [PR] |
| 36 | LLM-generated or overview-heavy instruction file | 2 | 2 | 3 | 3 | 4 | 4 | −0.5% to −3% success, +20–23% cost ([arXiv 2602.11988](https://arxiv.org/html/2602.11988v1)) [PP] |
| 37 | Deferred tool loading (tool search, lazy MCP) | 5 | 4 | 4 | 3 | 4 | 3 | −85% definition tokens; accuracy 49% → 74% ([Anthropic](https://www.anthropic.com/engineering/advanced-tool-use)) [V] |

## Verification: trusted tests lead on reliability, prompts trail

| # | Approach | Eff. | Rel. | Aut. | Clar. | Simp. | Evid. | Basis |
|---|---|---|---|---|---|---|---|---|
| 38 | Human-written or approved failing acceptance tests before implementation | 4 | 5 | 4 | 5 | 3 | 4 | 94.3% Verified ([TDFlow](https://arxiv.org/abs/2510.23761)) [PR] |
| 39 | Agent-written tests as acceptance evidence | 3 | 2 | 3 | 2 | 5 | 4 | No change in resolution ([arXiv 2602.07900](https://arxiv.org/abs/2602.07900)) [PP] |
| 40 | Existing regression suite as filter | 4 | 4 | 4 | 4 | 5 | 4 | Vendor best-of-N filter ([Anthropic](https://www.anthropic.com/news/claude-4)) [V]; [Agentless](https://arxiv.org/abs/2407.01489) [PR] |
| 41 | Held-out, spec-derived acceptance tests | 3 | 5 | 4 | 4 | 2 | 3 | 43–48 point visible/held-out gap ([SpecBench](https://arxiv.org/html/2605.21384)) [PP] |
| 42 | Read-only tests plus an explicit "impossible / conflict" exit | 5 | 4 | 4 | 4 | 4 | 3 | Cheating 54% → 9% ([ImpossibleBench](https://arxiv.org/html/2510.20270v1)) [PP] |
| 43 | Static-analysis and scanner feedback loop | 4 | 4 | 4 | 4 | 4 | 3 | Security issues > 40% → 13% ([arXiv 2508.14419](https://arxiv.org/abs/2508.14419)) [PP] |
| 44 | Security tests on security-sensitive work | 3 | 4 | 3 | 4 | 2 | 4 | 57% functional vs 11.8% secure ([SusVibes](https://proceedings.mlr.press/v306/zhao26ax.html)) [PR] |
| 45 | Fresh-context reviewer, scoped to correctness and scope | 3 | 4 | 4 | 4 | 4 | 3 | AUROC 0.99 fresh vs 0.89 self ([arXiv 2603.04582](https://arxiv.org/html/2603.04582v1)) [PP]; ≈ 2 bugs/PR ([Cognition](https://cognition.com/blog/multi-agents-working)) [V] |
| 46 | Same-context self-review / "reflect" step | 3 | 2 | 3 | 2 | 5 | 3 | Self-attribution bias ([arXiv 2603.04582](https://arxiv.org/html/2603.04582v1)) [PP]; "talked itself into approving" ([Anthropic](https://www.anthropic.com/engineering/harness-design-long-running-apps)) [V] |
| 47 | LLM-as-judge as sole selector | 3 | 2 | 4 | 2 | 3 | 4 | Randomness and order bias ([CodeJudgeBench](https://arxiv.org/abs/2507.10535)) [PR]; overcorrection ([arXiv 2603.00539](https://arxiv.org/abs/2603.00539)) [PP] |
| 48 | Trained critic on production traces | 4 | 4 | 4 | 2 | 1 | 3 | Best@8 73.8 vs Random@8 57.9 ([OpenHands](https://openhands.dev/blog/20260305-learning-to-verify-ai-generated-code)) [V] |
| 49 | Deterministic gates (post-edit hooks, Stop hook, CI) | 4 | 4 | 5 | 4 | 4 | 2 | [Claude Code](https://code.claude.com/docs/en/best-practices) [V]; "feedback sensors" ([Radar digest](https://agentic-ai.readthedocs.io/en/latest/AgenticTechStack/thoughtworks-radar-vol34/)) [A] |
| 50 | Browser end-to-end self-verification | 3 | 4 | 4 | 4 | 3 | 2 | "Dramatically improved performance", no numbers ([Anthropic](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)) [V] |
| 51 | Harness-produced evidence and an annotated test plan (passed / failed / untested) | 4 | 3 | 4 | 5 | 4 | 2 | [Cognition](https://cognition.com/blog/testing-development) [V]; false-claim rates ([Transluce](https://transluce.org/investigating-o3-truthfulness)) [PP] |
| 52 | "Do not cheat" prompts | 5 | 1 | 3 | 3 | 5 | 4 | 80% → 80% ([METR](https://metr.org/blog/2025-06-05-recent-reward-hacking/)) [PP]; mixed ([ImpossibleBench](https://arxiv.org/html/2510.20270v1)) [PP] |
| 53 | LLM monitors for cheating | 3 | 2 | 4 | 2 | 3 | 3 | 86–89% detection on small tasks vs 42–65% at repository scale ([ImpossibleBench](https://arxiv.org/html/2510.20270v1)) [PP] |

No approach scores well on every criterion, and that is the matrix's main lesson. The highest-reliability items are trusted tests, held-out tests and best-of-N with grounded selection (rows 29, 38 and 41). All three cost human effort or compute. The highest-efficiency items are cheap and well supported: observation masking, deferred tool loading, a lead with a cheap sidekick, and the Agentless pipeline (rows 33, 37, 24 and 20).

The highest-autonomy designs are the hierarchical and evaluator harnesses (rows 25–27). They pay for autonomy with an order of magnitude more tokens and depend on a near-perfect oracle. The full-ceremony methodologies (rows 5–9 and 15) sit at the bottom on simplicity and evidence at the same time.

The synthesized method below applies an explicit selection rule. It **keeps** every element rated at least 4 on reliability or efficiency that also has evidence of at least 3 and simplicity of at least 3: rows 1, 17, 18, 21, 23, 24, 32, 33, 35, 37, 38, 40, 42, 43 and 45, plus the validation step of row 20. It **admits only as risk-triggered escalations** the costly high-reliability rows 29, 41 and 44. It **adds** cheap, high-clarity practices whose weaker evidence is offset by low cost (rows 2, 3, 11, 49, 50 and 51). It **drops** the swarm and full-ceremony end entirely.
