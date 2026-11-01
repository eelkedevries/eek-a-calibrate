#!/usr/bin/env bash
set -euo pipefail

# Scaffold the next numbered prompt file.
# Usage: new-prompt.sh <short_name> ["Task title"]
#   <short_name>  lowercase words separated by underscores, e.g. title_screen
# Run from the project root (where docs-dev/ lives).

SHORT_NAME="${1:?Usage: new-prompt.sh <short_name> [\"Task title\"]}"
TITLE="${2:-}"
PROMPT_DIR="${PROMPT_DIR:-docs-dev/agent/prompts}"

if ! [[ "$SHORT_NAME" =~ ^[a-z0-9]+(_[a-z0-9]+)*$ ]]; then
  echo "Invalid short_name: '$SHORT_NAME'. Use lowercase words separated by underscores, e.g. title_screen." >&2
  exit 1
fi

mkdir -p "$PROMPT_DIR"

# Next three-digit number: one above the current maximum, else 001.
max="$(find "$PROMPT_DIR" -maxdepth 1 -type f -name '[0-9][0-9][0-9]*_*.md' \
  | sed -E 's|.*/([0-9]{3})[a-z]?_.*|\1|' | sort -n | tail -1 || true)"
if [[ -z "${max:-}" ]]; then
  next="001"
else
  next="$(printf '%03d' $((10#$max + 1)))"
fi

FILE="$PROMPT_DIR/${next}_${SHORT_NAME}.md"
if [[ -e "$FILE" ]]; then
  echo "Refusing to overwrite existing file: $FILE" >&2
  exit 1
fi

[[ -n "$TITLE" ]] || TITLE="$(echo "$SHORT_NAME" | tr '_' ' ')"

cat > "$FILE" <<EOF
# Task: ${TITLE}

## Goal

<One-sentence goal.>

## Scope

Implement only the work described in this prompt. Do not implement adjacent systems or future prompts.

## Required changes

1. <Specific required change>

## Do not implement

- <likely overreach>

## Acceptance criteria

The task is complete when:
- <criterion>

## Checks

Run the project's verify command and any checks relevant to this prompt.

## Commit and push

If and only if the scope was followed and checks pass, create one commit on \`main\` using this file's exact filename (\`${next}_${SHORT_NAME}.md\`) as the commit message, then push.

Do not commit or push partially completed work unless explicitly instructed.

## Final report

End with the required final report specified in \`AGENTS.md\`.
EOF

echo "Created $FILE"
