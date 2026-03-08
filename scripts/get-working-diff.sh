#!/bin/bash
set -euo pipefail

repo_path="$1"
file_path="$2"
is_staged="$3" # "true" or "false"

cd "$repo_path"

if [ "$is_staged" == "true" ]; then
  git diff --cached "$file_path"
else
  # Check if untracked
  if git ls-files --error-unmatch "$file_path" >/dev/null 2>&1; then
    git diff "$file_path"
  else
    # Untracked: show as a new file diff
    # We use a trick to make git diff show it as a new file
    # by diffing against /dev/null
    git diff --no-index /dev/null "$file_path" || true
  fi
fi
