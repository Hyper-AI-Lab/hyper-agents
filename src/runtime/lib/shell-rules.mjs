// Shell command rules for the shell guard. `deny` rules block a command outright;
// `ask` rules require the human's approval. The guard is a backstop for the
// security policy, not a sandbox: it catches the most damaging patterns, and the
// IDE's sandbox and permission system remain the real boundary.

const RECURSIVE_FORCE = String.raw`-(?:[a-zA-Z]*[rR][a-zA-Z]*f|[a-zA-Z]*f[a-zA-Z]*[rR])[a-zA-Z]*`

export const SHELL_RULES = [
  {
    decision: 'deny',
    id: 'bypass-mode',
    pattern: /--dangerously-skip-permissions|--dangerously-bypass[\w-]*|--yolo\b|--trust-all-tools\b/,
    reason: 'starts an agent with its permission checks disabled',
  },
  {
    decision: 'deny',
    id: 'pipe-to-shell',
    pattern: /\b(?:curl|wget|iwr|Invoke-WebRequest|Invoke-RestMethod)\b[^\n;&|]*\|\s*(?:sudo\s+)?(?:sh|bash|zsh|dash|ksh|fish|pwsh|powershell|iex|python3?|node|perl|ruby)\b/i,
    reason: 'pipes a downloaded script straight into an interpreter',
  },
  {
    decision: 'deny',
    id: 'delete-root-or-home',
    pattern: new RegExp(String.raw`\brm\s+(?:-[a-zA-Z-]+\s+)*${RECURSIVE_FORCE}(?:\s+-[a-zA-Z-]+)*\s+(?:--no-preserve-root\s+)?(?:/|/\*|~|~/|~/\*|\$HOME|\$HOME/\*|\*|\.|\./\*|\.\.)(?=\s|$|;|&|\|)`),
    reason: 'recursively deletes the file system root, the home directory or the whole working tree',
  },
  {
    decision: 'deny',
    id: 'disk-destroy',
    pattern: /\bmkfs(?:\.\w+)?\b|\bdd\b[^\n;&|]*\bof=\/dev\/(?:sd|nvme|hd|disk|mmcblk|xvd)|\bformat\s+[a-z]:|:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/i,
    reason: 'formats a disk, overwrites a block device or starts a fork bomb',
  },
  {
    decision: 'deny',
    id: 'write-git-hooks',
    pattern: /(?:>|\btee\b|\bcp\b|\bmv\b|\bln\b|\binstall\b|\bchmod\b)[^\n;&|]*\.git[\\/]hooks[\\/]/,
    reason: 'writes into .git/hooks, which git executes outside any sandbox',
  },
  {
    decision: 'deny',
    id: 'rewrite-agent-config',
    pattern: /(?:>|\btee\b|\bcp\b|\bmv\b|\bsed\s+-i)[^\n;&|]*(?:\.claude[\\/]settings[^\s]*\.json|\.cursor[\\/](?:hooks|permissions|sandbox|mcp|cli)\.json|\.mcp\.json)/,
    reason: 'rewrites agent settings, hooks, permissions or MCP configuration through the shell',
  },
  {
    decision: 'deny',
    id: 'rewrite-gate-config',
    pattern: /(?:>|\btee\b|\bcp\b|\bmv\b|\bln\b|\bsed\s+-i)[^\n;&|]*\.agent[\\/](?:checks\.conf|paacm(?:\.lock)?\.json|extensions[\\/]|tasks[\\/](?:CURRENT\b|[^\s;&|]*state\.json))/,
    reason: "rewrites PAACM's gate configuration, a project extension or the task state through the shell; use the paacm task commands, or ask the human",
  },
  {
    decision: 'ask',
    id: 'reopen-tests',
    pattern: /\btask\s+reopen-tests\b/,
    reason: 'reopens the approved tests for editing; it is allowed only after the human approved this specific test change in the conversation',
  },
  {
    decision: 'ask',
    id: 'hide-changes',
    pattern: /\bgit\b[^\n;&|]*\bupdate-index\b[^\n;&|]*--(?:assume-unchanged|skip-worktree)\b/,
    reason: "hides a file's changes from git, and so from PAACM's protected-path audit",
  },
  {
    decision: 'ask',
    id: 'skip-git-hooks',
    pattern: new RegExp(
      [
        // --no-verify, or an abbreviation git accepts, on any git command
        String.raw`\bgit\b[^\n;&|]*\s--no-veri[a-z]*\b`,
        // git commit -n (alone or in a cluster of short flags), after any global options
        String.raw`\bgit(?:\s+(?:-[Cc]\s+\S+|-{1,2}[A-Za-z][\w-]*(?:=\S+)?))*\s+commit\b[^\n;&|]*\s-[a-z]*n[a-z]*(?=[\s;&|<>()'"]|$)`,
        // another hooks directory, given on the command line or in the configuration
        String.raw`\bgit\b[^\n;&|]*\s-c\s*['"]?core\.hookspath\b`,
        String.raw`\bgit\b[^\n;&|]*\bconfig\b[^\n;&|]*[\s'"]core\.hookspath\b`,
        String.raw`\bGIT_CONFIG_(?:COUNT|KEY_\d+|PARAMETERS)=`,
        // hook managers switched off through the environment
        String.raw`(?:^|[\s;&|(])(?:export\s+)?(?:HUSKY=['"]?0|HUSKY_SKIP_HOOKS=['"]?1|LEFTHOOK=['"]?0)\b`,
        String.raw`(?:^|[\s;&|(])export\s+SKIP=`,
        String.raw`(?:^|[\s;&|(])SKIP=\S+\s[^\n;&|]*\bgit\b`,
      ].join('|'),
      'i',
    ),
    reason: "skips or redirects the repository's git hooks (pre-commit and pre-push checks)",
  },
  {
    decision: 'ask',
    id: 'git-push',
    pattern: /\bgit\b[^\n;&|]*\bpush\b/,
    reason: 'pushes to a remote repository',
  },
  {
    decision: 'ask',
    id: 'git-destructive',
    pattern: /\bgit\b[^\n;&|]*\b(?:reset\s+--hard|clean\s+-[a-zA-Z]*f|checkout\s+(?:--\s+)?\.(?:\s|$)|restore\s+(?:--\S+\s+)*\.(?:\s|$)|branch\s+-D\b|update-ref\b|stash\s+(?:drop|clear)\b|filter-branch\b|filter-repo\b)/,
    reason: 'discards uncommitted work, deletes a branch, moves a ref directly or rewrites history',
  },
  {
    decision: 'ask',
    id: 'recursive-delete',
    pattern: new RegExp(String.raw`\brm\s+(?:-[a-zA-Z-]+\s+)*${RECURSIVE_FORCE}\b|\bRemove-Item\b[^\n;&|]*-Recurse\b|\brmdir\s+/s\b`, 'i'),
    reason: 'recursively deletes files',
  },
  {
    decision: 'ask',
    id: 'publish-deploy',
    pattern: /\b(?:npm|pnpm|bun)\s+publish\b|\byarn\s+(?:npm\s+)?publish\b|\bcargo\s+publish\b|\btwine\s+upload\b|\bgem\s+push\b|\bdocker\b[^\n;&|]*\s(?:push\b|--push\b)|\bgh\s+(?:release\s+create|pr\s+merge|repo\s+delete)\b|\b(?:terraform|tofu)\b[^\n;&|]*\s(?:apply|destroy)\b|\bkubectl\b[^\n;&|]*\s(?:apply|delete|replace|scale|rollout)\b|\bhelm\b[^\n;&|]*\s(?:install|upgrade|uninstall|delete|rollback)\b|\bvercel\b[^\n;&|]*--prod\b|\b(?:firebase|fly|netlify)\s+deploy\b|\bheroku\b|\baws\s+\S+\s+(?:delete|remove|rm|terminate|put)\S*/i,
    reason: 'publishes, deploys, or changes cloud or cluster resources',
  },
  {
    decision: 'ask',
    id: 'destructive-sql',
    pattern: /\b(?:DROP\s+(?:TABLE|DATABASE|SCHEMA|INDEX|VIEW)|TRUNCATE\s+(?:TABLE\s+)?\w|DELETE\s+FROM\s+\w+\s*(?:;|$|"|'))/i,
    reason: 'drops or empties database objects',
  },
  {
    decision: 'ask',
    id: 'open-permissions',
    pattern: /\bchmod\s+(?:-R\s+)?(?:0?777|a\+rwx)\b|\bsudo\b/,
    reason: 'opens file permissions to everyone or runs with elevated privileges',
  },
]

// Returns the first matching rule ({ decision, id, reason }) or null.
export function evaluateCommand(command) {
  if (typeof command !== 'string' || command.trim() === '') return null
  for (const decision of ['deny', 'ask']) {
    for (const rule of SHELL_RULES) {
      if (rule.decision === decision && rule.pattern.test(command)) return { decision, id: rule.id, reason: rule.reason }
    }
  }
  return null
}
