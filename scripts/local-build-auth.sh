#!/usr/bin/env bash
# LOCAL DEVELOPMENT ONLY: builds the open-source Supabase Auth server (GoTrue)
# from source via the Go module proxy into .local/tools/gotrue.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/.local/tools/gotrue"
REF="${AUTH_REF:-master}"
mkdir -p "$OUT" && cd "$(mktemp -d)"
go mod init tmpbuild >/dev/null 2>&1
GOFLAGS=-mod=mod go get "github.com/supabase/auth@$REF" >/dev/null
SRC="$(go list -m -f '{{.Dir}}' github.com/supabase/auth)"
rm -rf "$OUT/src" && cp -r "$SRC" "$OUT/src" && chmod -R u+w "$OUT/src"
cd "$OUT/src"
# The module zip omits this vendored fork; the upstream package works the same for our use.
sed -i '/replace github.com\/joho\/godotenv/d' go.mod
GOFLAGS=-mod=mod go build -o "$OUT/auth" .
echo "Auth-Server gebaut: $OUT/auth"
