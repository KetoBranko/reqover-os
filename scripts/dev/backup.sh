#!/usr/bin/env bash
# Copies the tracked source tree and a git bundle (full history) to the shared
# project folder, as long as no remote repository exists.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="${1:-/mnt/project-files/reqover}"
mkdir -p "$DEST/code"
cd "$ROOT"
git bundle create "$DEST/reqover-os.bundle" --all >/dev/null 2>&1
rm -rf "$DEST/code" && mkdir -p "$DEST/code"
git ls-files -z | tar --null -T - -cf - | tar -xf - -C "$DEST/code"
echo "Gesichert nach $DEST (Quellcode + reqover-os.bundle)"
