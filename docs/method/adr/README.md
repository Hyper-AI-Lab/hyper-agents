# Decision records

Each record states one design decision of PAACM 3.0, the evidence behind it, and what it costs. They are numbered in the order the [algorithm](../ALGORITHM.md) relies on them.

| Record | Decision |
|---|---|
| [0001](0001-single-writer.md) | One writer, read-only helpers |
| [0002](0002-executed-evidence.md) | Accept only on independent, executed evidence |
| [0003](0003-protected-tests-and-blocked-exit.md) | Protected tests, a sanctioned BLOCKED exit and a retry cap |
| [0004](0004-minimal-instructions.md) | Minimal always-on instructions; skills for procedures; hooks for must-happen rules |
| [0005](0005-routing-and-planning.md) | Size-gated routing and planning |
| [0006](0006-supporting-data-intake.md) | Supporting data is untrusted, read-only evidence |
| [0007](0007-autonomy-levels.md) | Autonomy levels by verifiability and blast radius |
| [0008](0008-state-on-disk.md) | State on disk and in git |
| [0009](0009-context-hygiene.md) | Context hygiene and just-in-time exploration |
| [0010](0010-model-allocation.md) | A strong lead with inexpensive helpers under a fixed brief |
| [0011](0011-single-source-packaging.md) | One source of content, packaged for both IDEs |
| [0012](0012-security-baseline.md) | Security baseline |
| [0013](0013-evaluation.md) | Evaluation on a private, frozen task set |
| [0014](0014-rejected-approaches.md) | Approaches the method rejects |
| [0015](0015-node-cli.md) | A zero-dependency Node command-line tool replaces the shell scripts |
