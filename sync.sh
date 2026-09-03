#!/bin/bash
# Copy the Bit across from the working checkout in the bitespeed repo.
# Always give tar an explicit source directory: running it against the current
# directory has twice nested this repo inside its own subfolder.
set -euo pipefail
SRC=${1:-/home/user/bitespeed/plethora-gym-trainer}
DEST=$(cd "$(dirname "$0")" && pwd)/plethora-gym-trainer
[ -f "$SRC/main.js" ] || { echo "no main.js in $SRC" >&2; exit 1; }
rm -rf "$DEST" && mkdir -p "$DEST"
(cd "$SRC" && tar cf - \
  --exclude=./node_modules --exclude=./dev/shots \
  --exclude=./dev/_main.dev.js --exclude=./build --exclude=./.git .) | tar xf - -C "$DEST"
[ -d "$DEST/.git" ] && { echo "refusing: nested .git in $DEST" >&2; exit 1; }
echo "synced $(find "$DEST" -type f | wc -l) files"
