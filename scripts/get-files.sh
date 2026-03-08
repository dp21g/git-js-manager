#!/bin/bash
set -euo pipefail

repo_path="$1"
shift
hashes=("$@")

cd "$repo_path"

if [ ${#hashes[@]} -eq 0 ]; then
  exit 0
fi

if [ ${#hashes[@]} -eq 1 ]; then
  # Single commit files
  git show --name-status --format="" "${hashes[0]}"
else
  # Combined diff files
  latest="${hashes[0]}"
  oldest="${hashes[${#hashes[@]}-1]}"
  parent=$(git rev-parse "${oldest}^" 2>/dev/null || echo "")
  
  if [ -z "$parent" ]; then
    git diff --name-status $(git hash-object -t tree /dev/null) "$latest"
  else
    git diff --name-status "$parent" "$latest"
  fi
fi
