#!/bin/bash
set -euo pipefail

repo_path="$1"
message="$2"

cd "$repo_path"

if [ -z "$message" ]; then
  echo "Error: Commit message is empty"
  exit 1
fi

git commit -m "$message"
