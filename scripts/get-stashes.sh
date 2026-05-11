#!/bin/bash
set -euo pipefail

repo_path="$1"

cd "$repo_path"

git stash list --format='%gd__GSUI_STASH_FIELD__%gs__GSUI_STASH_FIELD__%H'
