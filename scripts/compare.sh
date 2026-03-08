#!/bin/bash
set -euo pipefail

repo_path="$1"
branch1="$2"
branch2="$3"
mode="${4:-files}" # files | diff
file_path="${5:-}"

cd "$repo_path"

if [ "$mode" = "files" ]; then
    # Get status and file path
    git diff --name-status "$branch1..$branch2"
else
    if [ -n "$file_path" ]; then
        # Specific file diff
        git diff "$branch1..$branch2" -- "$file_path"
    else
        # Full diff
        git diff "$branch1..$branch2"
    fi
fi
