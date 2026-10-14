---
name: paacm
description: Apply the Portable Adaptive Agentic Coding Method to a repository development task.
argument-hint: "[development request]"
disable-model-invocation: true
---

# PAACM skill

User request: $ARGUMENTS

Read **AGENTS.md** as the canonical shared policy. Read **.agent/workflows/implement.md** and the relevant security/verification policies. If the request is a defect investigation, use **.agent/workflows/debug.md**; if it is review-only, use **.agent/workflows/review.md**.

Begin with a concise task contract and choose FAST, STANDARD, or DEEP proportional to risk. Localize the change, use one patch owner, implement minimally, run real configured checks, challenge the result, and report actual evidence. Do not commit, push, deploy, or take consequential external actions without approval.

If no request was supplied, ask for the development task.