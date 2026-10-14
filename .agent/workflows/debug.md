# PAACM debugging workflow

1. **Capture:** describe observed vs expected behavior, reproduction steps, logs, and affected versions without exposing secrets.
2. **Reproduce:** run the narrowest deterministic reproduction available. If not reproducible, state what is missing.
3. **Localize:** trace entry points, recent changes, data flow, and invariants. Form a falsifiable root-cause hypothesis.
4. **Test first when feasible:** add a regression test that fails for the observed defect. Avoid brittle tests that merely encode the implementation.
5. **Fix narrowly:** change the causal path rather than masking symptoms. Preserve unrelated work.
6. **Verify:** rerun the reproduction and relevant surrounding tests; escalate to full checks for material risk.
7. **Challenge:** inspect adjacent cases, error handling, security, and regressions. If root cause remains uncertain, say so.
8. **Handoff:** explain root cause/evidence, patch, actual checks, and remaining uncertainty.

Do not repeatedly retry guesses without new evidence. For production incidents, require explicit approval for consequential operational actions.