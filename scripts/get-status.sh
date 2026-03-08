#!/bin/bash
set -euo pipefail

repo_path="$1"
cd "$repo_path"

# Get status in a machine-readable format
# format: [XY] [path] [-> renamed_path]
git status --porcelain=v1
