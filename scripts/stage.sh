#!/bin/bash
set -euo pipefail

repo_path="$1"
action="$2" # stage | unstage
file_path="$3"

cd "$repo_path"

if [ "$action" == "stage" ]; then
  git add "$file_path"
else
  git reset HEAD "$file_path"
fi
