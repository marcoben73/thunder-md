#!/usr/bin/env bash
# Packages src/ into dist/thundermd-<version>.xpi
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION=$(node -p "require('$ROOT/src/manifest.json').version")
OUT="$ROOT/dist/thundermd-$VERSION.xpi"
mkdir -p "$ROOT/dist"
rm -f "$OUT"
(cd "$ROOT/src" && zip -q -r -X "$OUT" . -x '*.map')
zip -q -j "$OUT" "$ROOT/LICENSE"
echo "$OUT"
unzip -l "$OUT" | tail -1
