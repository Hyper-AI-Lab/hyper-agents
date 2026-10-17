# 0017. Code intelligence through language servers

- **Status:** accepted
- **Date:** 2026-10-17

## Context

Without a language server the agent learns about a type error or a missing import only when the post-edit hook or the gate runs a checker, and it finds callers and definitions by text search, which also matches namesakes.

## Decision

The setup guide recommends Anthropic's official code-intelligence plugins (`pyright-lsp`, `typescript-lsp` and the others). The read-only explorer and reviewer list the `LSP` tool and use it for definitions, references and implementations when it is active. `paacm doctor` warns when a project enables an official code-intelligence plugin whose language server is not on `PATH`. The gate's checks remain the authority; the language server's diagnostics are earlier hints.

## Evidence

- With a plugin installed, Claude Code reports the errors and warnings an edit introduced right after the edit, and adds a read-only `LSP` tool for symbol lookups; the tool stays inactive until a plugin is installed, and cloud sessions do not start language servers ([Claude Code: code intelligence plugins](https://code.claude.com/docs/en/plugins/code-intelligence); [tools reference](https://code.claude.com/docs/en/tools-reference)) [V].
- A plugin does not include its language server; a missing binary shows only in the `/plugin` errors tab ([code intelligence plugins](https://code.claude.com/docs/en/plugins/code-intelligence)) [V].

## Consequences

Type errors surface at the edit instead of at the gate, and symbol lookups replace some text searches. Each developer installs one binary per language. Memory use grows while a server indexes the project, and a language server can disagree with the project's own type checker.

## Alternatives considered

Bundling a language server with the kit (rejected: per-language binaries and versions belong to the project) and making a plugin mandatory (rejected: the method works without one, and cloud sessions cannot use it).
