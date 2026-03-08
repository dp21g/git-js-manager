#!/bin/bash
set -euo pipefail

repo_path="$1"
base_branch="$2"

cd "$repo_path"

git log --oneline "${base_branch}..HEAD"