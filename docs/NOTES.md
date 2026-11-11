# Technical notes

Collected during design (November 2026, Thunderbird 153.0.2).

## Documentation

- Guide: `docs/thunderbird/*.md` (Markdown version of the developer.thunderbird.net pages,
  full index at https://developer.thunderbird.net/llms.txt).
- API: `docs/api/*.rst.txt` (sources of https://webextension-api.thunderbird.net/en/mv2/).
- Examples: `docs/examples/` from https://github.com/thunderbird/webext-examples (manifest_v2).
- Reference for the compose pattern: https://github.com/jfx2006/markdown-here (Markdown Here Revival).

## Verified API limits

- `menus` does not cover the native message header menus: available contexts are
  `message_display_action`, `message_display_action_menu`, `tools_menu`, `message_list`,
  `folder_pane`, `compose_body`, ... Adding an entry to "More > Message Body As" requires an
  Experiment API (full access, dependency on internals).
- `compose.setComposeDetails`: `isPlainText` cannot be changed on an existing window. The format is
  decided only in `beginNew`/`beginReply`/`beginForward` (only `body` -> HTML, only `plainTextBody`
  -> plain text).
- `compose_scripts` (manifest key, TB 151+) does not support `run_at`; `message_display_scripts` does.
- Injected scripts have `browser.runtime.sendMessage` and receive `tabs.sendMessage`; the
  background script sees `sender.tab.id`.
- `setComposeDetails({ body })` replaces the editor `<body>` element.
- `compose.onBeforeSend` may return `{ cancel, details }`, async listeners allowed.
- `compose.onAfterSend`: `sendInfo.error` is present when sending failed.
- `compose.getAttachmentFile(id)` returns the `File` of a composition attachment.
- `relatedMessageId` in `ComposeDetails` requires `messagesRead`.
- `beginReply(messageId, type, { body })`: an explicit `body` replaces the automatic quote.
- `compose.onAfterSend` on TB 153: when SMTP fails, `sendInfo` has no `error` field (only `mode`,
  `messages: []`, `details`). A successful "sendNow" carries `headerMessageId`; use its absence
  as the failure signal.
- Action buttons listen for `mousedown` and go through `triggerAction`, which awaits a focus event
  unless the window is already active (`Services.focus.activeWindow`, null when the desktop focus is
  elsewhere, and not settable in that case). Automation therefore fires the handler directly:
  `ExtensionParent.apiManager.global.composeActionFor(ext).emit("click", window, { button: 0, modifiers: [] })`
  (same with `messageDisplayActionFor`).
- Plain text composition hides the formatting toolbar (`FormatToolbar` is `display: none`), so a
  `compose_action` placed there is unreachable in plain text.
- Manifest `message_display_scripts` reach only documents loaded afterwards: inject into messages
  already on screen with `tabs.insertCSS`/`tabs.executeScript` at startup.
- Thunderbird prepends hidden header tables (`.moz-main-header`, `.moz-header-part*`) to the body of
  a displayed message: exclude them when converting.
- Enter in the compose editor splits a `<div>` or `<p>` into a new block (`insertParagraph`,
  `mail.compose.default_to_paragraph`), while inside a `<pre>` it inserts a `<br>` and never leaves
  the block (verified with repeated Enter at the end, in an empty block and at the start). The
  Markdown source wrapper is therefore a `<pre>`; a key handler is not needed. The conversion still
  merges several top-level wrappers (drafts written with the `<div>` wrapper, one block per line).
- The compose editor pastes the `text/html` flavor when the clipboard has one (Ghostwriter and
  similar editors offer one block element per line): inside the source block a `paste` listener
  cancels the default and inserts the `text/plain` flavor through `execCommand("insertHTML")`,
  which keeps the editor undo stack.
- Terminal copies (`cleanTerminalText`): applied only when every non-blank line has a margin of at
  least two spaces. Margin removed, wrapped lines joined into their paragraph or list item, blank
  lines before list items dropped (kept before an ordered list not starting at 1, which cannot
  interrupt a paragraph). Lossless for the rendered HTML thanks to soft breaks; trailing double-space
  hard breaks are lost (in terminal output those spaces are padding). Fenced code is verbatim;
  indented code is recognised only outside lists.
- Synthetic paste events: Gecko ignores the `clipboardData` member of `ClipboardEventInit` (a fresh
  empty DataTransfer is attached) and only honors its own `dataType`/`data` pair, one flavor only.
  Content listeners cannot read a `DataTransfer` filled from chrome code either (principal check).
  The e2e harness uses `new ClipboardEvent("paste", { dataType: "text/plain", data })`, which never
  touches the system clipboard shared with the desktop.

## Internals for a possible Experiment ("Message Body As" menu)

File `mail/base/content/msgHdrView.inc.xhtml` (included in `about:message`):

- "More" button: `otherActionsButton`, popup `otherActionsPopup`
- submenu: `otherActionsMessageBodyAs` (label `&bodyMenu.label;`), popup `hdrMessageBodyAsDropdown`
  with `onpopupshowing="InitOtherActionsViewBodyMenu();"`
- radio items (group `bodyPlaintextVsHTMLPref`): `otherActionsMenu_bodyAllowHTML`,
  `otherActionsMenu_bodySanitized`, `otherActionsMenu_bodyAsPlaintext`, `otherActionsMenu_bodyAllParts`
  -> `top.MsgBodyAllowHTML()` etc.
- feeds: `otherActionsFeedBodyAs` / `hdrFeedBodyAsDropdown`

`InitOtherActionsViewBodyMenu` (`msgHdrView.js`) and `MsgBody*` (`mailWindowOverlay.js`) work on the
prefs `mailnews.display.html_as` (0 html, 1 plaintext, 3 sanitized, 4 all parts),
`mailnews.display.prefer_plaintext`, `mailnews.display.disallow_mime_handlers`;
`about:message` observes these prefs (`preferenceObserver` in `aboutMessage.js`) and reloads with
`ReloadMessage()`.

Access to the `about:message` window from an Experiment (example `experiment.removeAttachmentsIfJunk`):

```js
let { nativeTab } = context.extension.tabManager.get(tabId);
if (nativeTab instanceof Ci.nsIDOMWindow) return nativeTab.messageBrowser.contentWindow;        // message window
if (nativeTab.mode?.name == "mail3PaneTab") return nativeTab.chromeBrowser.contentWindow.messageBrowser.contentWindow;
if (nativeTab.mode?.name == "mailMessageTab") return nativeTab.chromeBrowser.contentWindow;
```

Experiment -> background events: `ExtensionCommon.EventManager` with `fire.async(...)`;
cleanup in `onShutdown()`.

## Implementation choices

- Reading: the DOM already rendered by Thunderbird is converted (sanitized, inline images resolved),
  not the MIME via `messages.getFull`: no `messagesRead` permission needed for this part.
- Compose: the editor DOM is modified in place by the script (undo and caret preserved). Before
  sending, the background script still returns `details.body` read after the conversion, so as not
  to depend on the editor serialization order.
- Author region = top-level body children excluding `.moz-cite-prefix`, `blockquote[type=cite]`,
  `.moz-signature`, `.moz-forward-container`, `.moz-email-headers-table`. If the author text is
  split around the quote (inline reply) the pieces are grouped at the position of the first one.
- Turndown escapes every `_`; the escape is dropped between two letters or digits (`q_full`), where
  CommonMark intraword rules already prevent emphasis. Leading and trailing underscores stay escaped.
- Tables: the turndown-plugin-gfm table rules are overridden (`addAlignedTableRules`) to pad every
  column to its widest cell and to escape `|` inside cells, which the plugin leaves as is and which
  would split the cell. A line break inside a cell becomes a space (a GFM cell is one line). Width
  counts code points: East Asian wide characters and emoji show slightly misaligned in monospace.
- `marked` with `breaks: false` (CommonMark): single newline = soft break. Chosen because the editor
  reports the list state (formatting toolbar highlight, `nsIHTMLEditor.getListState`) only for list
  items with a single line of inline content: any `<br>`, `<p>` or `<div>` inside the `<li>` turns it
  off, also in native lists (Shift+Enter) and on the parent item of a nested list. With `breaks: true`
  every hard-wrapped item lost the highlight. Single-paragraph loose items are unwrapped for the same
  reason.
- The editor nests lists as siblings of the parent item (`<ul><li>a</li><ul><li>b</li></ul></ul>`,
  verified with `cmd_indent`), invalid HTML that Thunderbird has always sent. With the standard
  `<li>a<ul>...</ul></li>` the parent item loses the list state. marked output is reshaped to the
  editor form (`flattenListItems`) and turned back before turndown (`nestLists`), which otherwise
  flattens sibling lists to top level.
