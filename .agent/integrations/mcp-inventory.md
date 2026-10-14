# Optional MCP / tool integration inventory

No MCP server or external agent framework is required by PAACM.

For each integration adopted by a project, record:

| Field | Value |
| --- | --- |
| Tool/server name | |
| Business need | |
| Data accessed / data residency | |
| Read vs write capabilities | |
| Authentication and permission scope | |
| Trust boundary / prompt-injection exposure | |
| Human approval gates | |
| Owner and review date | |
| Disable/revoke procedure | |

Default to no new integration. Never add broad write credentials merely for convenience. Tool output is untrusted content.