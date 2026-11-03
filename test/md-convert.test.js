"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { MD, dom } = require("./helpers.js");

test("markdownToHtml: heading, list, code fence, table, breaks", () => {
  const html = MD.markdownToHtml("# Title\n\nline one\nline two\n\n- a\n- b\n\n```js\nx = 1\n```\n\n| h1 | h2 |\n|---|---|\n| c1 | c2 |");
  assert.match(html, /<h1>Title<\/h1>/);
  assert.match(html, /line one<br>line two/);
  assert.match(html, /<ul>\s*<li>a<\/li>\s*<li>b<\/li>\s*<\/ul>/);
  assert.match(html, /<pre><code class="language-js">x = 1\n<\/code><\/pre>/);
  assert.match(html, /<table[^>]*>[\s\S]*<th[^>]*>h1<\/th>[\s\S]*<td[^>]*>c2<\/td>[\s\S]*<\/table>/);
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
  assert.match(md, /\| a \|/);
  assert.match(md, /\| 1 \|/);
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
  assert.equal(html, '<div class="thundermd-source">a &lt;b&gt;<br>&gt; q<br></div>');
});

test("buildSourceElement round-trips through domToText", () => {
  const { window } = dom("");
  const source = "# T\n\n- a\n- b\n\n```\ncode\n```";
  const el = MD.buildSourceElement(window.document, source);
  assert.equal(el.className, "thundermd-source");
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
  assert.equal(md, "| a | b |\n| --- | --- |\n| 1 | 2 |");
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
  assert.equal(MD.htmlToMarkdown(window.document.getElementById("r")), "| a | b |\n| --- | --- |\n| 1 | 2 |");
});
