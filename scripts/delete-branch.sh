#!/bin/bash
set -euo pipefail

repo_path="$1"
branch_name="$2"
delete_remote="${3:-0}"

cd "$repo_path"

if ! git show-ref --verify --quiet "refs/heads/$branch_name"; then
  echo "Branch '$branch_name' does not exist locally." >&2
  exit 1
fi

current_branch="$(git branch --show-current)"

if [ "$branch_name" = "$current_branch" ]; then
  echo "Cannot delete the currently checked-out branch '$branch_name'." >&2
  exit 1
fi

upstream="$(git for-each-ref --format='%(upstream:short)' "refs/heads/$branch_name")"

if ! git branch -D "$branch_name" >/dev/null 2>&1; then
  echo "Failed to delete local branch '$branch_name'." >&2
  exit 1
fi

remote_deleted=0
if [ "$delete_remote" = "1" ] && [ -n "$upstream" ]; then
  remote_name="${upstream%%/*}"
  remote_branch="${upstream#*/}"
  if git push "$remote_name" --delete "$remote_branch" >/dev/null 2>&1; then
    remote_deleted=1
  fi
fi

printf 'deleted=%s\nremote_deleted=%s\nupstream=%s\n' \
  "$branch_name" \
  "$remote_deleted" \
  "${upstream:-}"
