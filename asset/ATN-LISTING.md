# addons.thunderbird.net listing

Text and settings for the ThunderMD page on addons.thunderbird.net (ATN). Each section maps to a
field of the submission form or of the "Edit Product Page" screen. Copy the content of the code
blocks as is.

## Name

```
ThunderMD
```

## Add-on URL slug

```
thundermd
```

## Summary

Plain text, at most 250 characters (this one is 185).

```
Markdown for Thunderbird: read any message as Markdown source with one click, and write new mail in Markdown that is sent as clean native HTML. Quotes and signatures are left untouched.
```

## Description

ATN accepts a small HTML subset here (`a`, `b`, `strong`, `em`, `i`, `code`, `blockquote`, `ul`,
`ol`, `li`); line breaks are kept.

```
ThunderMD brings Markdown to Thunderbird, both ways.

<b>Read as Markdown</b>
A "Markdown" button in the message header toolbar shows the body of the displayed message as Markdown source: headings, emphasis, links, lists, code blocks, quotes and tables. Click again to get the original message back. The mode stays on while you move between messages in the same tab, so you can browse a folder in Markdown.

<b>Write in Markdown</b>
A "Markdown" button in the formatting toolbar of the HTML composer turns what you have written into a Markdown block. Write or paste Markdown there; click the button again, or just press Send, and it becomes native Thunderbird HTML that every recipient can read.
<ul>
<li>Only your own text is converted: the quoted message, the signature and forwarded content are left as they are.</li>
<li>GitHub Flavored Markdown: tables (sent with borders), strikethrough, task lists, fenced code.</li>
<li>Standard line handling: a single newline joins the lines, an empty line starts a new paragraph, so text wrapped by your editor arrives as flowing paragraphs.</li>
<li>Pasting from a Markdown editor keeps one line per line, even when the editor also copies HTML.</li>
<li>Switching back to Markdown gives readable source: aligned table columns, nested lists, identifiers such as <code>q_full</code> without needless escaping.</li>
<li>If sending fails, your Markdown source is put back in the editor.</li>
</ul>

<b>Notes</b>
<ul>
<li>Requires Thunderbird 153 or later.</li>
<li>Markdown writing needs an HTML composition. In a plain text composition the button does nothing: use Shift+Write, or enable "Compose messages in HTML format" in the account settings.</li>
<li>Everything runs locally. The add-on sends nothing over the network and stores no data.</li>
<li>Interface in English, Italian, German, French and Spanish.</li>
</ul>

Open source (MIT): <a href="https://github.com/marcoben73/thunder-md">github.com/marcoben73/thunder-md</a>. Conversions by marked and turndown.
```

## Categories

Pick the closest entries in the ATN list (the form allows a limited number):

- Message Composition (or the equivalent "Composition" entry)
- Message and News Reading

## Tags

```
markdown, compose, html, reading, editor
```

## Support and links

| Field | Value |
| --- | --- |
| Homepage | `https://github.com/marcoben73/thunder-md` |
| Support website | `https://github.com/marcoben73/thunder-md/issues` |
| Support email | `thundermd@khet.it` |
| License | MIT License |
| Privacy policy | none needed: no data is collected, stored or transmitted |
| Contributions URL | `https://www.buymeacoffee.com/marcoben73` |

## Screenshots

Upload in this order; the caption goes in the field next to each image.

| File | Caption |
| --- | --- |
| `asset/screenshot-reading-markdown.png` | A received message shown as Markdown source with the Markdown button in the header toolbar. |
| `asset/screenshot-reading-html.png` | The same message in the normal view, one click away. |
| `asset/screenshot-compose-markdown.png` | Writing in Markdown: lists, nested items, an aligned table, code and a quote. |
| `asset/screenshot-compose-html.png` | After one click, or on Send: native HTML with a bordered table. |

## Submission form

- Distribution: "On this site".
- File: `dist/thundermd-0.1.5.xpi`.
- Source code: answer yes (`src/vendor/marked.umd.js` is minified) and upload
  `dist/thundermd-0.1.5-source.zip` (made with `git archive` from the release commit).
- Notes to reviewer: paste the content of `REVIEWER_NOTES.md`.

## Version notes for 0.1.5

```
First public release.
- Read any message as Markdown source from the message header toolbar.
- Write in Markdown in the HTML composer and send native HTML; quotes, signature and forwarded content are left untouched.
- GitHub Flavored Markdown with bordered tables, nested lists, task lists and fenced code.
- Interface in English, Italian, German, French and Spanish.
```
