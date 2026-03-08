#!/bin/bash
set -euo pipefail

repo_path="$1"

cd "$repo_path"

current_branch="$(git branch --show-current)"
branches="$(git for-each-ref --format='%(refname:short)' refs/heads)"

printf '{"branch":"%s","branches":[%s],"branchStatuses":[%s]}' \
  "$current_branch" \
  "$(echo "$branches" | awk 'NF { printf "%s\"%s\"", sep, $0; sep="," }')" \
  "$(echo "$branches" | while read -r name; do
      [ -z "$name" ] && continue
      if upstream=$(git rev-parse --abbrev-ref "${name}@{upstream}" 2>/dev/null); then
        counts=$(git rev-list --left-right --count "${name}...${upstream}")
        ahead=$(echo "$counts" | awk '{print $1}')
        behind=$(echo "$counts" | awk '{print $2}')
        printf '%s{"name":"%s","hasUpstream":true,"upstream":"%s","ahead":%s,"behind":%s}' "$sep" "$name" "$upstream" "$ahead" "$behind"
      else
        printf '%s{"name":"%s","hasUpstream":false,"upstream":"","ahead":0,"behind":0}' "$sep" "$name"
      fi
      sep=,
    done)"