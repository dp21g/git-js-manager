#!/bin/bash
set -euo pipefail

repo_path="$1"
count="$2"
message_file="$3"

log() {
  printf '[squash.sh] %s\n' "$1" >&2
}

log "repo_path=$repo_path"
log "count=$count"
log "message_file=$message_file"

cd "$repo_path"
log "cwd=$(pwd)"

log "running: git reset --soft HEAD~${count}"
git reset --soft "HEAD~${count}"
log "running: git commit --no-verify --file $message_file"
git commit --no-verify --file "$message_file"
log "squash script completed successfully"