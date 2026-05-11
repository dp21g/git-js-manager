#!/bin/bash
set -euo pipefail

repo_path="$1"

cd "$repo_path"

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

current_branch="$(git branch --show-current)"
local_branches="$(git for-each-ref --sort=refname --format='%(refname:short)' refs/heads)"
remote_branches="$(git for-each-ref --sort=refname --format='%(refname:short)' refs/remotes | grep -v '/HEAD$' || true)"
local_upstreams="$(git for-each-ref --format='%(refname:short)__GSUI_UP__%(upstream:short)' refs/heads)"

local_branches_json=""
local_status_json=""
sep=""

while read -r name; do
  [ -z "$name" ] && continue

  escaped_name="$(json_escape "$name")"
  local_branches_json="${local_branches_json}${sep}\"${escaped_name}\""

  if upstream="$(git rev-parse --abbrev-ref "${name}@{upstream}" 2>/dev/null)"; then
    counts="$(git rev-list --left-right --count "${name}...${upstream}")"
    ahead="$(echo "$counts" | awk '{print $1}')"
    behind="$(echo "$counts" | awk '{print $2}')"
    escaped_upstream="$(json_escape "$upstream")"
    local_status_json="${local_status_json}${sep}{\"name\":\"${escaped_name}\",\"hasUpstream\":true,\"upstream\":\"${escaped_upstream}\",\"ahead\":${ahead},\"behind\":${behind}}"
  else
    local_status_json="${local_status_json}${sep}{\"name\":\"${escaped_name}\",\"hasUpstream\":false,\"upstream\":\"\",\"ahead\":0,\"behind\":0}"
  fi

  sep=","
done <<< "$local_branches"

remote_branches_json=""
sep=""

while read -r remote_ref; do
  [ -z "$remote_ref" ] && continue

  remote_name="${remote_ref%%/*}"
  short_name="${remote_ref#*/}"
  local_name=""
  local_exists="false"

  tracked_local="$(printf '%s\n' "$local_upstreams" | awk -F'__GSUI_UP__' -v target="$remote_ref" '$2==target { print $1; exit }')"
  if [ -n "$tracked_local" ]; then
    local_name="$tracked_local"
    local_exists="true"
  elif git show-ref --verify --quiet "refs/heads/$short_name"; then
    local_name="$short_name"
    local_exists="true"
  fi

  escaped_remote_ref="$(json_escape "$remote_ref")"
  escaped_short_name="$(json_escape "$short_name")"
  escaped_remote_name="$(json_escape "$remote_name")"
  escaped_local_name="$(json_escape "$local_name")"

  remote_branches_json="${remote_branches_json}${sep}{\"name\":\"${escaped_remote_ref}\",\"shortName\":\"${escaped_short_name}\",\"remote\":\"${escaped_remote_name}\",\"localExists\":${local_exists},\"localName\":\"${escaped_local_name}\"}"
  sep=","
done <<< "$remote_branches"

printf '{"branch":"%s","branches":[%s],"branchStatuses":[%s],"remoteBranches":[%s]}' \
  "$(json_escape "$current_branch")" \
  "$local_branches_json" \
  "$local_status_json" \
  "$remote_branches_json"
