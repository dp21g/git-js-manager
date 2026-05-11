#!/bin/bash
set -euo pipefail

repo_path="$1"
stash_ref="$2"
file_path="${3:-}"

cd "$repo_path"

if [ -z "$file_path" ]; then
  git stash apply "$stash_ref"
  exit 0
fi

if git cat-file -e "${stash_ref}:${file_path}" 2>/dev/null; then
  git checkout "$stash_ref" -- "$file_path"
  exit 0
fi

if git rev-parse --verify "${stash_ref}^3" >/dev/null 2>&1 && git cat-file -e "${stash_ref}^3:${file_path}" 2>/dev/null; then
  git checkout "${stash_ref}^3" -- "$file_path"
  exit 0
fi

if git cat-file -e "${stash_ref}^1:${file_path}" 2>/dev/null; then
  rm -f -- "$file_path"
  exit 0
fi

echo "No stash changes found for $file_path" >&2
exit 1
