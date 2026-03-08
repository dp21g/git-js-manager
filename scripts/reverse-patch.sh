#!/bin/bash
# reverse-patch-v2.sh
set -euo pipefail

repo_path="$1"
cd "$repo_path"

# We use git apply directly.
# If the caller provides a "Manual Reverse" patch (where + means undo-delete and - means undo-add),
# we apply it normally.
# --3way is critical for handling context that might have shifted.
# --whitespace=nowarn avoids common failure points.
git apply --index --3way --whitespace=nowarn --verbose -
