"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { MD, dom } = require("./helpers.js");

test("markdownToHtml: heading, list, code fence, table, soft and hard breaks", () => {
  const html = MD.markdownToHtml("# Title\n\nline one\nline two  \nline three\n\n- a\n- b\n\n```js\nx = 1\n```\n\n| h1 | h2 |\n|---|---|\n| c1 | c2 |");
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /<p>line one\nline two<br>line three<\/p>/);
  assert.match(html, /<ul>\s*<li>a<\/li>\s*<li>b<\/li>\s*<\/ul>/);
  assert.match(html, /<pre><code class="language-js">x = 1\n<\/code><\/pre>/);
  assert.match(html, /<table[^>]*>[\s\S]*<th[^>]*>h1<\/th>[\s\S]*<td[^>]*>c2<\/td>[\s\S]*<\/table>/);
});

test("markdownToHtml: wrapped list items stay inline, loose items are unwrapped", () => {
  const html = MD.markdownToHtml("- first line\n  wrapped `code` line\n- second\n\nText\n\n- loose one\n\n- loose two\n\n1. nested parent\n\n   - child\n\n2. two paragraphs\n\n   second paragraph");
  assert.match(html, /<li>first line\nwrapped <code>code<\/code> line<\/li>/);
  assert.match(html, /<li>loose one<\/li>\s*<li>loose two<\/li>/);
  assert.match(html, /<li>nested parent<\/li>\s*<ul>\s*<li>child<\/li>\s*<\/ul>\s*<li>/);
  assert.match(html, /<li><p>two paragraphs<\/p>\s*<p>second paragraph<\/p>\s*<\/li>/);
  assert.doesNotMatch(html, /<br>/);
});

test("markdownToHtml: nested lists take the editor shape (list after its item)", () => {
  const html = MD.markdownToHtml("- l1\n  - l2\n  - l2b\n    - l3\n- l1b");
  assert.match(html, /<ul>\s*<li>l1<\/li>\s*<ul>\s*<li>l2<\/li>\s*<li>l2b<\/li>\s*<ul>\s*<li>l3<\/li>\s*<\/ul>\s*<\/ul>\s*<li>l1b<\/li>\s*<\/ul>/);
  assert.doesNotMatch(html, /<li>[^<]*<ul>/);
});

test("htmlToMarkdown: editor-shaped nested lists round-trip with indentation", () => {
  const md = MD.htmlToMarkdown("<ul><li>l1</li><ul><li>l2</li><ul><li>l3</li></ul><li>l2b</li></ul><li>l1b</li></ul>");
  assert.equal(md, "- l1\n  - l2\n    - l3\n  - l2b\n- l1b");
  assert.equal(MD.htmlToMarkdown(MD.markdownToHtml(md)), md);
});

test("markdownToHtml: empty input gives empty string", () => {
  assert.equal(MD.markdownToHtml(""), "");
  assert.equal(MD.markdownToHtml("   \n"), "");
});

test("htmlToMarkdown from string", () => {
  const md = MD.htmlToMarkdown("<h1>T</h1><p>hi <strong>b</strong> and <em>i</em></p><ul><li>x</li><li>y</li></ul>");
  assert.equal(md, "# T\n\nhi **b** and _i_\n\n- x\n- y");
});

test("htmlToMarkdown from DOM element keeps links, images and tables", () => {
  const { window } = dom('<div id="r"><p>see <a href="https://x.it/">x</a> <img src="cid:1" alt="pic"></p><table><tr><th>a</th></tr><tr><td>1</td></tr></table></div>');
  const md = MD.htmlToMarkdown(window.document.getElementById("r"));
  assert.match(md, /\[x\]\(https:\/\/x\.it\/\)/);
  assert.match(md, /!\[pic\]\(cid:1\)/);
  assert.match(md, /\| a   \|/);
  assert.match(md, /\| 1   \|/);
});

test("htmlToMarkdown drops style and script", () => {
  const md = MD.htmlToMarkdown("<style>p{}</style><script>1</script><p>ok</p>");
  assert.equal(md, "ok");
});

test("domToText rebuilds line breaks from br and blocks", () => {
  const { window } = dom('<div id="w">a<br>b<div>c</div><p>d&nbsp;e</p>f<br></div>');
  const text = MD.domToText(window.document.getElementById("w"));
  assert.equal(text, "a\nb\nc\nd e\nf");
});

test("domToText keeps blank lines (paragraph separation)", () => {
  const { window } = dom('<div id="w">one<br><br>two<br><br><br>three</div>');
  assert.equal(MD.domToText(window.document.getElementById("w")), "one\n\ntwo\n\nthree");
});

test("textToSourceHtml escapes and splits lines", () => {
  const html = MD.textToSourceHtml("a <b>\r\n> q");
  assert.equal(html, '<pre class="thundermd-source">a &lt;b&gt;<br>&gt; q<br></pre>');
});

test("textToLinesHtml escapes, normalizes CRLF and joins with br", () => {
  assert.equal(MD.textToLinesHtml("a <b>\r\nc\n\nd"), "a &lt;b&gt;<br>c<br><br>d");
  assert.equal(MD.textToLinesHtml(""), "");
});

test("buildSourceElement round-trips through domToText", () => {
  const { window } = dom("");
  const source = "# T\n\n- a\n- b\n\n```\ncode\n```";
  const el = MD.buildSourceElement(window.document, source);
  assert.equal(el.className, "thundermd-source");
  assert.equal(el.localName, "pre");
  assert.equal(MD.domToText(el), source);
});

test("htmlToMarkdown: ordered and nested lists", () => {
  const md = MD.htmlToMarkdown("<ol start=\"3\"><li>a</li><li>b<ul><li>c</li></ul></li></ol>");
  assert.equal(md, "3. a\n4. b\n  - c");
});

test("htmlToMarkdown promotes the first row of header-less tables", () => {
  const { window } = dom('<div id="r"><table><tr><td>a</td><td>b</td></tr><tr><td>1</td><td>2</td></tr></table></div>');
  const el = window.document.getElementById("r");
  const md = MD.htmlToMarkdown(el);
  assert.equal(md, "| a   | b   |\n| --- | --- |\n| 1   | 2   |");
  assert.equal(el.querySelector("th"), null, "live DOM must not be modified");
});

test("htmlToMarkdown excludeSelector drops matching elements from a clone", () => {
  const { window } = dom('<div id="r"><table class="moz-header-part1 moz-main-header"><tr><td>Subject: x</td></tr></table><p>body</p></div>');
  const el = window.document.getElementById("r");
  assert.equal(MD.htmlToMarkdown(el, ".moz-main-header"), "body");
  assert.ok(el.querySelector(".moz-main-header"), "live DOM must keep the element");
});

test("markdownToHtml: tables get borders as attributes and inline styles", () => {
  const html = MD.markdownToHtml("| a | b |\n|:--|--:|\n| 1 | 2 |");
  assert.match(html, /<table border="1" cellpadding="4" cellspacing="0" style="border-collapse:collapse;border:1px solid #999999">/);
  assert.match(html, /<th align="left" style="border:1px solid #999999;padding:4px 8px">a<\/th>/);
  assert.match(html, /<td align="right" style="border:1px solid #999999;padding:4px 8px">2<\/td>/);
  assert.equal((html.match(/style="border:1px solid/g) || []).length, 4);
});

test("markdownToHtml: table HTML round-trips back to a GFM table", () => {
  const { window } = dom(`<div id="r">${MD.markdownToHtml("| a | b |\n|---|---|\n| 1 | 2 |")}</div>`);
  assert.equal(MD.htmlToMarkdown(window.document.getElementById("r")), "| a   | b   |\n| --- | --- |\n| 1   | 2   |");
});

test("sourceText joins split wrappers one line per block", () => {
  const { window } = dom('<pre class="thundermd-source">a<br>b<br></pre><div class="thundermd-source">c</div><div class="thundermd-source"><br></div><div class="thundermd-source">d<br></div>');
  const wrappers = MD.getSourceElements(window.document.body);
  assert.equal(wrappers.length, 4);
  assert.equal(MD.sourceText(wrappers), "a\nb\nc\n\nd");
});

test("htmlToMarkdown keeps intraword underscores unescaped", () => {
  const md = MD.htmlToMarkdown("<p>take q_empty = QCOUNT, q_full and a_b_c; _lead, trail_, __init__, <em>em</em></p>");
  assert.equal(md, "take q_empty = QCOUNT, q_full and a_b_c; \\_lead, trail\\_, \\_\\_init\\_\\_, _em_");
  const html = MD.markdownToHtml(md);
  assert.match(html, /q_empty = QCOUNT, q_full and a_b_c; _lead, trail_, __init__, <em>em<\/em>/);
});

test("htmlToMarkdown pads table columns to the widest cell", () => {
  const md = MD.htmlToMarkdown("<table><tr><th>aaaaa</th><th>b</th></tr><tr><td>c</td><td>ddddd</td></tr></table>");
  assert.equal(md, "| aaaaa | b     |\n| ----- | ----- |\n| c     | ddddd |");
});

test("htmlToMarkdown table: alignment, escaped pipes, ragged rows, line breaks", () => {
  const md = MD.htmlToMarkdown('<table><thead><tr><th align="left">L</th><th align="center">Center</th><th align="right">R</th></tr></thead>' +
    "<tbody><tr><td>a | b</td><td><code>x|y</code></td><td>1<br>2</td></tr><tr><td>only</td></tr></tbody></table>");
  assert.equal(md, [
    "| L      | Center |   R |",
    "| :----- | :----: | --: |",
    "| a \\| b | `x\\|y` | 1 2 |",
    "| only   |        |     |",
  ].join("\n"));
  const html = MD.markdownToHtml(md);
  assert.match(html, /<td[^>]*>a \| b<\/td>/);
  assert.match(html, /<td[^>]*><code>x\|y<\/code><\/td>/);
  assert.equal((html.match(/<tr>/g) || []).length, 3);
});
