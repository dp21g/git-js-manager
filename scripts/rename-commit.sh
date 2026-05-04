#!/bin/bash
set -euo pipefail

repo_path="$1"
commit_hash="$2"
message_file="$3"

log() {
  printf '[rename-commit.sh] %s\n' "$1" >&2
}

restore_stash() {
  if [ "${stashed:-0}" -eq 1 ]; then
    if ! git stash pop >/dev/null 2>&1; then
      echo "Commit renamed, but restoring stashed changes failed. Please apply the latest stash manually." >&2
      exit 1
    fi
  fi
}

cleanup() {
  rm -f "${sequence_editor:-}" "${git_editor:-}" "${message_copy:-}"
}

cd "$repo_path"

if [ ! -s "$message_file" ]; then
  echo "New commit message is empty." >&2
  exit 1
fi

message_copy="$(mktemp)"
cat "$message_file" > "$message_copy"

if ! git rev-parse --verify "${commit_hash}^{commit}" >/dev/null 2>&1; then
  echo "Commit not found: $commit_hash" >&2
  exit 1
fi

if ! git merge-base --is-ancestor "$commit_hash" HEAD >/dev/null 2>&1; then
  echo "Commit is not part of the current branch history." >&2
  exit 1
fi

parent_count="$(git rev-list --parents -n 1 "$commit_hash" | awk '{ print NF - 1 }')"
if [ "$parent_count" -gt 1 ]; then
  echo "Renaming merge commits is not supported yet." >&2
  exit 1
fi

stashed=0
if [ -n "$(git status --porcelain)" ]; then
  log "stashing working tree before rewrite"
  git stash push --include-untracked -m "git-squash-ui-rename-temp" >/dev/null
  stashed=1
fi

trap cleanup EXIT

head_hash="$(git rev-parse HEAD)"
if [ "$commit_hash" = "$head_hash" ]; then
  log "amending HEAD commit message"
  git commit --amend --no-verify --file "$message_copy" >/dev/null
  restore_stash
  exit 0
fi

sequence_editor="$(mktemp)"
git_editor="$(mktemp)"
rebase_target=("${commit_hash}^")

if [ "$parent_count" -eq 0 ]; then
  rebase_target=(--root)
fi

cat > "$sequence_editor" <<'EOF'
#!/bin/bash
set -euo pipefail

todo_file="$1"
tmp_file="$(mktemp)"
changed=0

while IFS= read -r line || [ -n "$line" ]; do
  if [ "$changed" -eq 0 ] && printf '%s\n' "$line" | grep -qE '^pick[[:space:]]'; then
    printf '%s\n' "${line/pick /reword }" >> "$tmp_file"
    changed=1
  else
    printf '%s\n' "$line" >> "$tmp_file"
  fi
done < "$todo_file"

mv "$tmp_file" "$todo_file"

if [ "$changed" -eq 0 ]; then
  echo "Could not find the commit to reword." >&2
  exit 1
fi
EOF

cat > "$git_editor" <<EOF
#!/bin/bash
set -euo pipefail
cat "$message_copy" > "\$1"
EOF

chmod +x "$sequence_editor" "$git_editor"

log "starting interactive rebase to rename $commit_hash"
if ! GIT_SEQUENCE_EDITOR="$sequence_editor" GIT_EDITOR="$git_editor" git rebase -i "${rebase_target[@]}" >/dev/null; then
  git rebase --abort >/dev/null 2>&1 || true
  restore_stash
  echo "Commit rename failed during rebase." >&2
  exit 1
fi

restore_stash
log "commit message updated successfully"
