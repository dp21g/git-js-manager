#!/bin/bash
set -euo pipefail

repo_path="$1"
stash_ref="$2"
file_path="${3:-}"

cd "$repo_path"

if [ -n "$file_path" ]; then
  tracked_diff="$(git diff --binary "${stash_ref}^1" "${stash_ref}" -- "$file_path" || true)"
  if [ -n "$tracked_diff" ]; then
    printf '%s' "$tracked_diff"
    exit 0
  fi

  if git rev-parse --verify "${stash_ref}^3" >/dev/null 2>&1; then
    empty_tree="$(git hash-object -t tree /dev/null)"
    untracked_diff="$(git diff --binary "$empty_tree" "${stash_ref}^3" -- "$file_path" || true)"
    if [ -n "$untracked_diff" ]; then
      printf '%s' "$untracked_diff"
      exit 0
    fi
  fi

  exit 0
else
  git stash show -p --binary --format= --include-untracked "$stash_ref"
fi
