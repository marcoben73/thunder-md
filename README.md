# ThunderMD

A Thunderbird extension for Markdown.

- **Received mail**: show the message body as Markdown source.
- **New mail**: write in Markdown and send it as HTML.

## Features

Requires Thunderbird >= 153.

- **Reading**: a "Markdown" button in the message header toolbar. Shows the message body as
  Markdown source (read-only, monospace). Second click: original body. The state is per tab and
  stays active when switching messages.
- **Composing**: a "Markdown" button in the formatting toolbar.
  - HTML composition: the text written by the author (quotes, signature and forward container are
    left untouched) is converted to Markdown source inside a monospace block. Second click, or send:
    the Markdown is converted to native HTML. If sending fails the Markdown source is restored.
  - Plain text composition: the button does nothing (Thunderbird hides the formatting toolbar there
    and the compose format of an open window cannot be changed via API). To write in Markdown, compose
    in HTML: Shift+Write, or enable "Compose messages in HTML format" in the identity settings. Note
    that Options > Delivery Format only affects the sent MIME format, not the editor.

Conversions: Markdown -> HTML with [marked](https://github.com/markedjs/marked) (GFM, `breaks: true`:
a single newline becomes a line break); HTML -> Markdown with
[turndown](https://github.com/mixmark-io/turndown) + GFM plugin (tables, strikethrough, task lists).

## Development

```
npm install        # dependencies (marked, turndown, jsdom for tests)
npm run vendor     # copy the browser builds into src/vendor/
npm test           # unit tests for the conversions (node --test + jsdom)
npm run build      # dist/thundermd-<version>.xpi
npm run docs       # re-download the documentation into docs/
```

`npx addons-linter src`: 0 errors expected; the `MANIFEST_PERMISSIONS`/`UNSUPPORTED_API` warnings
are normal, the linter only knows the Firefox schema.

Temporary install: Thunderbird > Add-ons Manager > gear icon > Debug Add-ons > Load Temporary
Add-on > `src/manifest.json`. Console: "Inspect" with "Persist Logs".

End-to-end tests against a real Thunderbird (throwaway profile, devtools server on port 6000):

```
scripts/test-profile.sh run     # starts Thunderbird on .tbtest/profile (Local Folders + test inbox)
node scripts/tb-test.js         # installs src/ as a temporary add-on and runs the scenarios
node scripts/tb-rdp.js console thundermd@khet.it   # tails the add-on console
```

`scripts/tb-rdp.js` is a small Remote Debugging Protocol client (install/reload the add-on, read its
console, evaluate JS in the background page or in the parent process). `scripts/smtp-sink.js` is the
SMTP server used by the send scenarios; the test profile points SMTP at 127.0.0.1:2525, so sending
fails unless the sink is running.

Technical notes and API limits in `docs/NOTES.md`; downloaded Thunderbird documentation in `docs/`.
Notes for the add-on reviewer (build, third-party code, permissions) in `REVIEWER_NOTES.md`.

## Localization

Labels follow the Thunderbird UI language through the standard WebExtension `_locales` mechanism
(`src/_locales/<code>/messages.json`, default `en`). Available: en, it, de, fr, es. To add a language,
copy `src/_locales/en/messages.json` into a new folder and translate the `message` values;
`npm test` checks that every locale has the same keys as `en`.

## License

MIT, see `LICENSE`. Bundled third-party code (marked, turndown, turndown-plugin-gfm, all MIT) is
listed in `src/vendor/THIRD-PARTY.md` with the license texts next to it.

## Permissions

- `compose`: editor scripts, button, send hooks, opening a new composition.
- `messagesModify`: scripts in the message display pane.
- `messagesRead`: find messages already on screen at startup (install, update, reload) to inject the
  display script into them.
