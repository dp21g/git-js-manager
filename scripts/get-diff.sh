#!/bin/bash
set -euo pipefail

repo_path="$1"
# Commits should be passed as a comma-separated string or multiple args
shift
hashes=("$@")

cd "$repo_path"

if [ ${#hashes[@]} -eq 0 ]; then
  echo "No commits specified" >&2
  exit 1
fi

if [ ${#hashes[@]} -eq 1 ]; then
  # Single commit: show its changes
  git show --format="" --color=never "${hashes[0]}"
else
  # Multiple commits: show combined diff from the parent of the oldest to the latest
  # We assume hashes are in newest-to-oldest order based on index 0 being latest
  latest="${hashes[0]}"
  oldest="${hashes[${#hashes[@]}-1]}"
  
  # Get parent of oldest
  parent=$(git rev-parse "${oldest}^" 2>/dev/null || echo "")
  
  if [ -z "$parent" ]; then
    # If no parent, diff against empty tree
    git diff $(git hash-object -t tree /dev/null) "$latest"
  else
    git diff "$parent" "$latest"
  fi
fi
