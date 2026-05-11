#!/bin/bash
set -euo pipefail

repo_path="$1"
old_name="$2"
new_name="$3"

cd "$repo_path"

if ! git show-ref --verify --quiet "refs/heads/$old_name"; then
  echo "Branch '$old_name' does not exist." >&2
  exit 1
fi

if [ "$old_name" = "$new_name" ]; then
  echo "New branch name is the same as the old name." >&2
  exit 1
fi

if git show-ref --verify --quiet "refs/heads/$new_name"; then
  echo "A branch named '$new_name' already exists." >&2
  exit 1
fi

if ! git branch -m "$old_name" "$new_name" >/dev/null 2>&1; then
  echo "Failed to rename branch '$old_name' to '$new_name'." >&2
  exit 1
fi

printf 'old_name=%s\nnew_name=%s\n' "$old_name" "$new_name"
