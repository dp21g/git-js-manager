#!/bin/bash
set -euo pipefail

repo_path="$1"
shift
hashes=("$@")

cd "$repo_path"

if [ ${#hashes[@]} -eq 0 ]; then
  echo "No commits specified to reverse."
  exit 1
fi

# We use --no-commit to leave changes in the working tree as requested
# git revert handles multiple hashes by reverting them in the order provided
git revert --no-commit "${hashes[@]}"
