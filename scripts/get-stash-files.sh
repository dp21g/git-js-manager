#!/bin/bash
set -euo pipefail

repo_path="$1"
stash_ref="$2"

cd "$repo_path"

git stash show --name-status --format= --include-untracked "$stash_ref"
