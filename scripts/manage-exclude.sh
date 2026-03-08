#!/bin/bash
set -euo pipefail

repo_path="$1"
action="$2"
pattern="${3:-}" # Use default empty if $3 is missing

exclude_file="$repo_path/.git/info/exclude"

# Ensure the file exists
mkdir -p "$(dirname "$exclude_file")"
touch "$exclude_file"

if [ "$action" == "list" ]; then
  # List non-empty, non-comment lines
  grep -v '^#' "$exclude_file" | grep -v '^[[:space:]]*$' || true
elif [ "$action" == "add" ]; then
  # Check if already exists
  if ! grep -qxF "$pattern" "$exclude_file"; then
    echo "$pattern" >> "$exclude_file"
  fi
elif [ "$action" == "remove" ]; then
  # Remove the specific line
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "/^$(echo $pattern | sed 's/\//\\\//g')$/d" "$exclude_file"
  else
    sed -i "/^$(echo $pattern | sed 's/\//\\\//g')$/d" "$exclude_file"
  fi
fi
