#!/usr/bin/env bash
# Downloads the Thunderbird documentation used by the project into docs/.
# Re-runnable: overwrites existing files.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCS="$ROOT/docs"
DEV="https://developer.thunderbird.net"
API="https://webextension-api.thunderbird.net/en/mv2/_sources"
EXAMPLES="https://raw.githubusercontent.com/thunderbird/webext-examples/master/manifest_v2"

mkdir -p "$DOCS/thunderbird" "$DOCS/api" "$DOCS/examples/messageDisplayScript" "$DOCS/examples/composeScript"

fetch() {
  local url="$1" out="$2"
  echo "  $url"
  curl -fsSL "$url" -o "$out"
}

echo "developer.thunderbird.net"
for page in \
  add-ons/about-add-ons \
  add-ons/mailextensions \
  add-ons/mailextensions/supported-manifest-keys \
  add-ons/mailextensions/supported-ui-elements \
  add-ons/mailextensions/supported-webextension-api \
  add-ons/mailextensions/experiments \
  add-ons/hello-world-add-on \
  add-ons/hello-world-add-on/using-webextension-apis \
  add-ons/hello-world-add-on/using-a-background-page \
  add-ons/hello-world-add-on/using-content-scripts \
  add-ons/updating/updates-for-thunderbird-140 \
  add-ons/resources/tips-and-tricks; do
  fetch "$DEV/$page.md" "$DOCS/thunderbird/$(echo "$page" | tr '/' '_').md"
done

echo "webextension-api.thunderbird.net (mv2, rst sources)"
for api in compose composeAction composeScripts messageDisplay messageDisplayAction \
  messageDisplayScripts messages menus tabs windows runtime; do
  fetch "$API/$api.rst.txt" "$DOCS/api/$api.rst.txt"
done

echo "thunderbird/webext-examples"
fetch "$EXAMPLES/messageDisplayScript/manifest.json" "$DOCS/examples/messageDisplayScript/manifest.json"
fetch "$EXAMPLES/messageDisplayScript/src/background.js" "$DOCS/examples/messageDisplayScript/background.js"
fetch "$EXAMPLES/messageDisplayScript/src/message-content-script.js" "$DOCS/examples/messageDisplayScript/message-content-script.js"
fetch "$EXAMPLES/messageDisplayScript/src/message-content-styles.css" "$DOCS/examples/messageDisplayScript/message-content-styles.css"
fetch "$EXAMPLES/composeScript/manifest.json" "$DOCS/examples/composeScript/manifest.json"
fetch "$EXAMPLES/composeScript/background.js" "$DOCS/examples/composeScript/background.js"
fetch "$EXAMPLES/composeScript/compose.js" "$DOCS/examples/composeScript/compose.js"

echo "done"
