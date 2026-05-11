#!/bin/bash
set -euo pipefail

repo_path="$1"
target_branch="$2"
strategy="${3:-direct}"
stash_name="${4:-}"

cd "$repo_path"

current_branch="$(git branch --show-current)"
created_stash=0
created_stash_ref=""
dirty="$(git status --porcelain)"

restore_stash() {
  if [ "$created_stash" -eq 1 ]; then
    if ! git stash pop >/dev/null 2>&1; then
      echo "Switch failed and the temporary stash could not be restored automatically. Reapply ${created_stash_ref} manually." >&2
    fi
  fi
}

switch_args=("switch" "$target_branch")

if git show-ref --verify --quiet "refs/heads/$target_branch"; then
  switch_args=("switch" "$target_branch")
elif git show-ref --verify --quiet "refs/remotes/$target_branch"; then
  local_branch="${target_branch#*/}"
  if git show-ref --verify --quiet "refs/heads/$local_branch"; then
    switch_args=("switch" "$local_branch")
  else
    switch_args=("switch" "--track" "-c" "$local_branch" "$target_branch")
  fi
fi

case "$strategy" in
  direct)
    ;;
  stash)
    if [ -n "$dirty" ]; then
      if [ -z "$stash_name" ]; then
        stash_name="Branch switch: ${current_branch} -> ${target_branch}"
      fi

      git stash push --include-untracked -m "$stash_name" >/dev/null
      created_stash=1
      created_stash_ref="$(git stash list -1 --format='%gd')"
    fi
    ;;
  *)
    echo "Unknown switch strategy: $strategy" >&2
    exit 1
    ;;
esac

if ! switch_output="$(git "${switch_args[@]}" 2>&1)"; then
  restore_stash
  echo "$switch_output" >&2
  exit 1
fi

printf 'previous_branch=%s\ncurrent_branch=%s\nstashed=%s\nstash_ref=%s\n' \
  "$current_branch" \
  "$(git branch --show-current)" \
  "$created_stash" \
  "$created_stash_ref"
