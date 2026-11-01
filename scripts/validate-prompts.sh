#!/usr/bin/env bash
set -euo pipefail

PROMPT_DIR="${1:-docs-dev/agent/prompts}"

test -d "$PROMPT_DIR" || {
  echo "Prompt directory not found: $PROMPT_DIR" >&2
  exit 1
}

echo "Checking prompt files in: $PROMPT_DIR"

bad_files="$(find "$PROMPT_DIR" -maxdepth 1 -type f -name "*.md" \
  | sed "s|^$PROMPT_DIR/||" \
  | grep -Ev '^[0-9]{3}[a-z]?_[a-z0-9]+(_[a-z0-9]+)*\.md$' || true)"

if [[ -n "$bad_files" ]]; then
  printf 'Prompt files with invalid names:\n%s\n' "$bad_files" >&2
  echo "Expected format: 001_short_name.md or 001b_short_name_fix.md" >&2
  exit 1
fi

duplicate_ids="$(find "$PROMPT_DIR" -maxdepth 1 -type f -name "*.md" \
  | sed -E 's|.*/([0-9]{3}[a-z]?)_.*|\1|' \
  | sort \
  | uniq -d || true)"

if [[ -n "$duplicate_ids" ]]; then
  printf 'Duplicate prompt IDs found:\n%s\n' "$duplicate_ids" >&2
  exit 1
fi

echo "Prompt validation completed."
