#!/usr/bin/env bash
# Copies the browser builds of the npm libraries into src/vendor/ (no bundler),
# together with their license texts and a THIRD-PARTY.md manifest.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
NM="$ROOT/node_modules"
OUT="$ROOT/src/vendor"
mkdir -p "$OUT"
cp "$NM/marked/lib/marked.umd.js" "$OUT/marked.umd.js"
cp "$NM/turndown/lib/turndown.browser.umd.js" "$OUT/turndown.js"
cp "$NM/turndown-plugin-gfm/dist/turndown-plugin-gfm.js" "$OUT/turndown-plugin-gfm.js"
rm -f "$OUT/VERSIONS"

{
  echo "# Third-party code bundled in src/vendor/"
  echo
  echo "Files are copied unmodified from the npm packages listed below (see scripts/vendor.sh)."
  echo
  echo "| File | Package | Version | License | Source |"
  echo "|---|---|---|---|---|"
  for entry in "marked.umd.js|marked|lib/marked.umd.js" \
               "turndown.js|turndown|lib/turndown.browser.umd.js" \
               "turndown-plugin-gfm.js|turndown-plugin-gfm|dist/turndown-plugin-gfm.js"; do
    IFS='|' read -r file pkg src <<< "$entry"
    version=$(node -p "require('$NM/$pkg/package.json').version")
    license=$(node -p "require('$NM/$pkg/package.json').license")
    echo "| $file | $pkg | $version | $license (LICENSE-$pkg.txt) | https://www.npmjs.com/package/$pkg/v/$version ($src) |"
    cp "$NM/$pkg/LICENSE" "$OUT/LICENSE-$pkg.txt"
  done
} > "$OUT/THIRD-PARTY.md"
cat "$OUT/THIRD-PARTY.md"
