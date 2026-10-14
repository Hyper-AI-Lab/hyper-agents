#!/bin/sh
# Conservative installer: no overwrite, no auto-merge, no global changes.
set -eu
set -f
umask 077

usage() {
  echo "Usage: sh scripts/install-to-project.sh TARGET_DIR --dry-run|--apply" >&2
  exit 2
}

[ "$#" -eq 2 ] || usage
target=$1
mode=$2
case "$mode" in --dry-run|--apply) ;; *) usage ;; esac

if [ ! -d "$target" ] || [ -L "$target" ]; then
  echo "Target must be an existing non-symlink directory." >&2
  exit 2
fi

ROOT=$(CDPATH= cd "$(dirname "$0")/.." && pwd)
TARGET=$(CDPATH= cd "$target" && pwd)
if [ "$ROOT" = "$TARGET" ]; then
  echo "Source and target are the same directory." >&2
  exit 2
fi

paths='AGENTS.md
CLAUDE.md
.agent/workflows/implement.md
.agent/workflows/debug.md
.agent/workflows/review.md
.agent/policies/security.md
.agent/policies/verification.md
.agent/templates/task-contract.md
.agent/integrations/mcp-inventory.md
.agent/evals/task-schema.md
.agent/checks.conf
.agent/state/.gitignore
.claude/skills/paacm/SKILL.md
.cursor/commands/paacm.md
scripts/agent-check
scripts/install-to-project.sh
docs/agentic-kit/USER_GUIDE.md'

# Preflight every path before writing anything. Detect conflicting files
# and symlinked destination ancestors. Concurrent hostile changes are out of scope.
conflict=0
for rel in $paths; do
  src="$ROOT/$rel"
  dst="$TARGET/$rel"

  if [ ! -f "$src" ] || [ -L "$src" ]; then
    echo "Unsafe or missing source: $rel" >&2
    conflict=1
    continue
  fi

  ancestor=$(dirname "$rel")
  while [ "$ancestor" != . ]; do
    if [ -L "$TARGET/$ancestor" ]; then
      echo "Symlinked destination ancestor: $ancestor" >&2
      conflict=1
    elif [ -e "$TARGET/$ancestor" ] && [ ! -d "$TARGET/$ancestor" ]; then
      echo "Non-directory destination ancestor: $ancestor" >&2
      conflict=1
    fi
    ancestor=$(dirname "$ancestor")
  done

  if [ -L "$dst" ]; then
    echo "Symlinked destination: $rel" >&2
    conflict=1
  elif [ -e "$dst" ]; then
    if [ ! -f "$dst" ] || ! cmp -s "$src" "$dst"; then
      echo "Conflicting destination (not overwritten): $rel" >&2
      conflict=1
    else
      echo "UNCHANGED $rel"
    fi
  else
    echo "ADD $rel"
  fi
done

if [ "$conflict" -ne 0 ]; then
  echo "Installation stopped; resolve conflicts manually." >&2
  exit 1
fi

if [ "$mode" = --dry-run ]; then
  echo "Dry run complete. No files changed."
  exit 0
fi

for rel in $paths; do
  src="$ROOT/$rel"
  dst="$TARGET/$rel"
  if [ -e "$dst" ]; then
    continue
  fi
  mkdir -p "$(dirname "$dst")"
  if [ -e "$dst" ] || [ -L "$dst" ]; then
    echo "Destination changed during installation: $rel" >&2
    exit 1
  fi
  cp "$src" "$dst"
  echo "INSTALLED $rel"
done

echo "Installation complete. Review files and configure .agent/checks.conf for this project."
