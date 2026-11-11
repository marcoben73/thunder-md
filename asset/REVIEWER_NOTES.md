# Notes for the ATN reviewer

ThunderMD lets the user read a message body as Markdown source and write messages in Markdown that
are converted to HTML before sending. No network access, no data collection, no remote code.

## Build

The XPI is a plain zip of `src/` plus `LICENSE`, produced by `scripts/build.sh`. There is no
transpilation or bundling: every file in the XPI is identical to the file in the repository
(https://github.com/marcoben73/thunder-md).

## Third-party code

`vendor/` holds three unmodified files copied from npm by `scripts/vendor.sh`. They are declared in
`VENDOR.md` at the add-on root: each file is mapped to the exact file of the pinned release on
jsDelivr, with its SHA-256 (the bundled copies are byte-identical). `marked.umd.js` is minified
upstream; it is shipped as published by the marked project. The license texts are in `vendor/`.

| File | Package | Version |
|---|---|---|
| vendor/marked.umd.js | marked | 18.1.3 |
| vendor/turndown.js | turndown | 7.2.4 |
| vendor/turndown-plugin-gfm.js | turndown-plugin-gfm | 1.0.2 |

To verify: download the URLs in `VENDOR.md` and compare checksums, or `npm install` (versions
pinned in `package-lock.json`), `npm run vendor`, then diff `src/vendor/` against the XPI.

## Permissions

- `compose`: `compose_scripts` (editor DOM access), `composeAction`, `compose.getComposeDetails`,
  `compose.setComposeDetails` (only `isModified` and `body`), `onBeforeSend`, `onAfterSend`.
- `messagesModify`: `message_display_scripts`, and `tabs.insertCSS`/`tabs.executeScript` on message
  display tabs at startup (see below).
- `messagesRead`: `messageDisplay.getDisplayedMessage` at startup, only to know which open tabs show
  a message. No message content is read through the API.

## Behaviour worth checking

- **Startup injection** (`src/background.js`, `injectIntoOpenMessages`): manifest
  `message_display_scripts` only reach documents loaded after the add-on starts, so on install,
  update or reload the same files are injected into messages already on screen with
  `tabs.insertCSS`/`tabs.executeScript`. The file list is read from the manifest, nothing dynamic.
- **Message display** (`src/display/display-script.js`): on request the rendered body is converted to
  Markdown with turndown and shown in a `<pre>` via `textContent`; the original nodes are kept in a
  DocumentFragment and put back on the next toggle. No `innerHTML`, nothing is written to the message.
- **Compose** (`src/compose/compose-script.js`): the author's part of the editor body (everything
  except `.moz-cite-prefix`, `blockquote[type=cite]`, `.moz-signature`, `.moz-forward-container`) is
  replaced in place by a `<pre class="thundermd-source">` holding the Markdown text, and converted
  back with marked. The rendered HTML is the user's own text parsed with `DOMParser` and imported into
  the editor. Rendered tables get `border="1"` and inline border styles so recipients see borders.
- **Paste** (`src/compose/compose-script.js`, `onPaste`): only when the caret is inside the Markdown
  block, the default paste is cancelled and the clipboard `text/plain` flavor is inserted with
  `execCommand("insertHTML")`. The HTML passed is built by `textToLinesHtml`: every line is
  HTML-escaped and joined with `<br>`, so no markup from the clipboard reaches the editor. Text with a
  terminal margin is tidied first by `cleanTerminalText` (pure string function).
- **Sending** (`src/background.js`, `onBeforeSend`): if the window is in Markdown mode the editor is
  converted first and the listener returns `{ details: { body } }`; if the conversion fails the send
  is cancelled (`{ cancel: true }`) instead of sending raw Markdown. `onAfterSend` puts the Markdown
  source back when sending failed (detected by `sendInfo.error`, or a `sendNow` without
  `headerMessageId`, because Thunderbird 153 does not set `error` on SMTP failures).
- **Plain text composition**: the button does nothing; the compose format of an open window cannot be
  changed through the API and the formatting toolbar is hidden there anyway.
- **Icons**: `icons/md-active.svg` is not referenced by the manifest; `background.js` sets it with
  `messageDisplayAction.setIcon`/`composeAction.setIcon` while a tab is in Markdown mode.
- **State**: two in-memory `Map`s keyed by tab id in the background page, cleared on `tabs.onRemoved`.
  No `storage`, no preferences.

## Tests

- `npm test`: unit tests of the conversion helpers (node + jsdom).
- `node scripts/tb-test.js`: end-to-end scenarios against a running Thunderbird on a throwaway
  profile (`scripts/test-profile.sh run`), driven through the devtools Remote Debugging Protocol
  (`scripts/tb-rdp.js`). They cover both toggles, replies with quotes, failed and successful sends
  (local SMTP sink in `scripts/smtp-sink.js`). These scripts are development tooling and are not part
  of the XPI.

## Known limitations

- Inline replies: author text split around the quote is grouped at the position of the first piece.
- A draft saved while in Markdown mode keeps the `pre.thundermd-source` wrapper in its body; it is
  recognised again when the draft is reopened.
- Minimum version 154: the `compose_scripts`/`message_display_scripts` manifest keys are used, and
  before 154 `message_display_scripts` also required the `scripting` permission.
