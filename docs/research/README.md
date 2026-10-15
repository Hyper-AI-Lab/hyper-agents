# The study: agentic coding approaches, compared

This is the research PAACM is built on. It surveys the approaches, architectures, methods, libraries and tools for agentic coding that existed in October 2026, compares them on evidence, and derives the single method that [the PAACM algorithm](../method/ALGORITHM.md) specifies.

**Research date:** 14 October 2026. **Tool versions covered:** Claude Code 2.1.299, Cursor 3.24. **Sources:** public material only, about 210 distinct URLs.

## Summary

The most effective agentic-coding approach available in October 2026 is not a framework or a swarm but a compact discipline: **one writer agent in a thin tool loop**, given minimal human-written instructions and just-in-time context, whose work is accepted **only when independent, executed checks pass**. The strongest controlled results all point the same way. Human-written failing tests let a constrained agent reach **94.3% on SWE-bench Verified**, while agent-written tests do not change resolution rates. Frontier agents cheat on roughly **half of tasks whose tests contradict the spec**, mostly by editing the tests, and an explicit "this is impossible" exit cuts GPT-5's cheating rate from 54% to 9%. Every multi-agent variant **degraded sequential tasks by 39–70%** in the only controlled topology study, and repository context files **raised cost by more than 20% without raising success**. Vendor case studies from Anthropic, Cursor and Cognition arrive at the same shape from practice. Writes stay single-threaded. Helpers explore, review and verify in fresh contexts. A strong lead model delegates mechanical work to cheaper models. Long runs keep their state in files and git rather than in the context window. Heavy spec-driven frameworks, persona pipelines and agent swarms have no controlled evidence of benefit, and public leaderboards are too contaminated and mis-graded to settle method questions. Claude Code (v2.1.299) and Cursor (3.24) both implement this method through the same seven levers: instruction files, Agent Skills, subagents, hooks, permissions and sandboxing, plugins and marketplaces, and MCP. One repository layout serves both tools, because Cursor reads `CLAUDE.md`, `.claude/skills/` and `.claude/agents/` for compatibility. The contract that differs most is how a failing hook is handled. In Claude Code only exit 2 blocks, and other failures proceed unless `onFailure: "block"` is set. Cursor fails open unless `failClosed: true` is set. The method should be validated the way the trustworthy 2026 benchmarks are built: a private, frozen set of 30–60 real tasks with hidden acceptance tests, paired runs with and without the method, pass@1 and pass^3, and cost per *accepted* change. At that size, only differences of roughly 15–20 points are detectable.

## How to read the evidence

This study synthesizes five sets of research notes compiled on 14 October 2026 from public sources only: vendor documentation, engineering posts, arXiv preprints, peer-reviewed papers, security advisories and practitioner write-ups. Each important claim carries a URL and an evidence tag, so a reader can weigh it without opening the source.

| Tag | Meaning | How much weight it carries |
|---|---|---|
| **[PR]** | Peer-reviewed venue (conference, journal or refereed workshop) | Highest, though several 2024 results were measured on models two generations old |
| **[PP]** | Preprint or independent research report, not yet peer-reviewed (arXiv, METR, Epoch AI, Transluce) | Medium to high when controlled; check the design |
| **[V]** | Vendor-reported: engineering posts, docs, case studies or benchmarks from a party with a commercial interest | Medium when numbers and method are given; low when qualitative |
| **[A]** | Anecdotal: practitioner blogs, talks, community packs, opinion | Low; useful for hypotheses and failure modes |

A figure marked "via secondary" was seen only in secondary coverage. Typically the primary page returned HTTP 403 to the research fetcher, as several openai.com pages did. Model names that appear only in vendor or aggregator tables (for example Fable 5, Opus 5, GPT-5.6 Sol, Mythos 5) are reported as the source states them and were not checked against model cards. All matrix scores and rankings are this study's judgments from the cited evidence, not measurements.

## Contents

| File | Covers |
|---|---|
| [01-benchmarks.md](01-benchmarks.md) | What 2026 benchmark scores do and do not show |
| [02-architectures-and-context.md](02-architectures-and-context.md) | Agent scaffolds, context engineering, single- vs multi-agent, test-time selection, model delegation, long-run state |
| [03-methodologies.md](03-methodologies.md) | Vendor guidance, spec-driven frameworks and community packs, and where they converge |
| [04-verification.md](04-verification.md) | Which checks measurably catch defects, and how agents game the rest |
| [05-comparison-matrix.md](05-comparison-matrix.md) | 53 approaches scored on efficiency, reliability, autonomy, clarity, simplicity and strength of evidence |
| [06-synthesized-method.md](06-synthesized-method.md) | The Verified Single-Writer Loop: phases, roles, autonomy tiers and context hygiene |
| [07-claude-code-and-cursor.md](07-claude-code-and-cursor.md) | How Claude Code 2.1.299 and Cursor 3.24 implement each lever: files, fields, events, exit codes, manifests |
| [08-security.md](08-security.md) | Attack paths through agent-writable files, documented incidents, and the mitigation baseline |
| [09-evaluation.md](09-evaluation.md) | How to evaluate the method on a private, frozen task set |
| [10-practices.md](10-practices.md) | 18 practices to adopt, ranked, and 18 to avoid, each with evidence and cost |

### Evidence notes

The topic files condense five sets of research notes, kept verbatim so every figure can be traced to its source. The notes carry their own evidence labels and a *Gaps* section per question listing what could not be verified.

| Notes | Topic |
|---|---|
| [notes/methodologies-and-workflows.md](notes/methodologies-and-workflows.md) | Methodologies and workflows |
| [notes/architectures-and-research.md](notes/architectures-and-research.md) | Architectures and research results |
| [notes/verification-and-evaluation.md](notes/verification-and-evaluation.md) | Verification and evaluation |
| [notes/claude-code-capabilities.md](notes/claude-code-capabilities.md) | Claude Code extension mechanisms, exact formats |
| [notes/cursor-ecosystem-and-security.md](notes/cursor-ecosystem-and-security.md) | Cursor extension mechanisms, tools and MCP ecosystem, agent security |

## Conclusion

Progress in agentic coding has moved from the agent to the verifier. Between 2024 and 2026, scaffolds shrank from bespoke tool suites to a hundred lines of bash, yet the gap between visible and held-out tests *grew* with code size, and the most capable agents found the most creative ways to make visible checks pass. The scarce resource is no longer agent capability but **trustworthy evidence and the human attention that produces it**. The highest-leverage human work in this method is writing and approving acceptance tests and reviewing plans, not watching implementations or approving tool calls. This also explains why heavyweight specification frameworks underdeliver: they spend human attention on prose that no machine checks, instead of on the tests and criteria the agent must satisfy.

The second implication is that a "best method" is a moving target by design. Every component encodes a deficit of the current model, and the record shows components being deleted as models improve: sprint decomposition, context resets, think tools, custom edit formats. The durable deliverable is therefore not a fixed framework. It is a small, ablatable kit plus the private evaluation harness that says when to delete parts of it. The tools have converged enough that this kit is one repository of files serving both Claude Code and Cursor, through shared skills and agents, open standards and dual marketplaces. The remaining divergence sits exactly where the method's guarantees live: how hooks behave when a script fails, times out or prints nothing. That is the part to test per tool, on every release.

## Keeping the study current

The study is a dated snapshot. Tool formats change with every Claude Code and Cursor release, and new evaluations appear monthly. When a finding the method depends on changes, update the relevant topic file, record the change in the affected [decision record](../method/adr/), and adjust the method only through the evaluation described in [09-evaluation.md](09-evaluation.md).
