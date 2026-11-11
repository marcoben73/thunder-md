#!/usr/bin/env bash
# Copies the browser builds of the npm libraries into src/vendor/ (no bundler),
# together with their license texts, and writes src/VENDOR.md: the vendoring
# declaration read by the addons.thunderbird.net review, mapping every bundled
# file to the exact upstream file of the pinned release.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NM="$ROOT/node_modules"
OUT="$ROOT/src/vendor"
mkdir -p "$OUT"
rm -f "$OUT/VERSIONS" "$OUT/THIRD-PARTY.md"

ENTRIES=(
  "marked.umd.js|marked|lib/marked.umd.js"
  "turndown.js|turndown|lib/turndown.browser.umd.js"
  "turndown-plugin-gfm.js|turndown-plugin-gfm|dist/turndown-plugin-gfm.js"
)

{
  echo "# Third-party libraries"
  echo
  echo "Files in vendor/ are unmodified copies of the npm release files linked below (copied by"
  echo "scripts/vendor.sh, no bundler). License texts are in vendor/LICENSE-<package>.txt."
  for entry in "${ENTRIES[@]}"; do
    IFS='|' read -r file pkg src <<< "$entry"
    cp "$NM/$pkg/$src" "$OUT/$file"
    cp "$NM/$pkg/LICENSE" "$OUT/LICENSE-$pkg.txt"
    version=$(node -p "require('$NM/$pkg/package.json').version")
    license=$(node -p "require('$NM/$pkg/package.json').license")
    sha=$(sha256sum "$OUT/$file" | cut -d' ' -f1)
    echo
    echo "vendor/$file:"
    echo "- Package: $pkg"
    echo "- Version: $version"
    echo "- License: $license"
    echo "- URL: https://cdn.jsdelivr.net/npm/$pkg@$version/$src"
    echo "- SHA-256: $sha"
  done
} > "$ROOT/src/VENDOR.md"
cat "$ROOT/src/VENDOR.md"
