# Contributing

1. Open an issue describing the problem, affected IDE/version, expected behavior, and a minimal reproduction.
2. Work on a feature branch. Keep policy changes small and explain the reason for each new rule.
3. Run **sh -n scripts/agent-check scripts/install-to-project.sh** and **sh scripts/agent-check --quick**.
4. Test installation into a clean temporary repository and verify conflicts are not overwritten.
5. Open a pull request with the risk assessment, validation evidence, and any compatibility limitations.

Do not add secrets, credentials, personal data, project-specific proprietary information, or mandatory paid dependencies. Changes to trust boundaries, shell scripts, or automated checks require careful review. Keep the default single-agent path simple.