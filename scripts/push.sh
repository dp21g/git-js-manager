#!/bin/bash
set -euo pipefail

repo_path="$1"

cd "$repo_path"
git push --force-with-lease