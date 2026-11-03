"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { MD, dom } = require("./helpers.js");

function names(nodes) {
  return nodes.map(n => (n.nodeType === 3 ? "#text" : n.nodeName.toLowerCase()));
}

test("reply above quote: only author paragraph", () => {
  const { window } = dom('<p>answer</p><div class="moz-cite-prefix">On x wrote:</div><blockquote type="cite"><p>orig</p></blockquote>');
  const nodes = MD.findAuthorRegion(window.document.body);
  assert.deepEqual(names(nodes), ["p"]);
  assert.equal(nodes[0].textContent, "answer");
});

test("reply below quote: empty br and paragraph after quote", () => {
  const { window } = dom('<div class="moz-cite-prefix">On x wrote:</div><blockquote type="cite"><p>orig</p></blockquote><br><p>answer</p>');
  const nodes = MD.findAuthorRegion(window.document.body);
  assert.deepEqual(names(nodes), ["br", "p"]);
});

test("signature and forward container are excluded, blank text ignored", () => {
  const { window } = dom('\n<p>hi</p>\n<div class="moz-signature">-- <br>me</div>\n<div class="moz-forward-container">fwd</div>');
  const nodes = MD.findAuthorRegion(window.document.body);
  assert.deepEqual(names(nodes), ["p"]);
});

test("bare text node is part of the region", () => {
  const { window } = dom('plain text<br><div class="moz-signature">sig</div>');
  assert.deepEqual(names(MD.findAuthorRegion(window.document.body)), ["#text", "br"]);
});

test("replaceAuthorRegion keeps quote and signature, places wrapper where region was", () => {
  const { window } = dom('<p>one</p><p>two</p><div class="moz-cite-prefix">x</div><blockquote type="cite">q</blockquote><div class="moz-signature">sig</div>');
  const body = window.document.body;
  const wrapper = MD.buildSourceElement(window.document, "one\n\ntwo");
  MD.replaceAuthorRegion(body, wrapper);
  assert.deepEqual(names(Array.from(body.children)), ["div", "div", "blockquote", "div"]);
  assert.equal(body.firstElementChild, wrapper);
  assert.equal(body.querySelector("blockquote").textContent, "q");
});

test("replaceAuthorRegion on empty region inserts at top", () => {
  const { window } = dom('<div class="moz-signature">sig</div>');
  const body = window.document.body;
  const wrapper = MD.buildSourceElement(window.document, "");
  MD.replaceAuthorRegion(body, wrapper);
  assert.equal(body.firstElementChild, wrapper);
  assert.equal(MD.getSourceElement(body), wrapper);
});

test("full round trip: html -> markdown source -> html", () => {
  const { window } = dom('<h2>Hi</h2><p>a <b>b</b></p><div class="moz-cite-prefix">x</div><blockquote type="cite">q</blockquote>');
  const body = window.document.body;
  const container = window.document.createElement("div");
  for (const n of MD.findAuthorRegion(body)) {
    container.appendChild(n.cloneNode(true));
  }
  const source = MD.htmlToMarkdown(container);
  assert.equal(source, "## Hi\n\na **b**");
  const html = MD.markdownToHtml(MD.domToText(MD.buildSourceElement(window.document, source)));
  assert.match(html, /<h2>Hi<\/h2>/);
  assert.match(html, /<p>a <strong>b<\/strong><\/p>/);
});
