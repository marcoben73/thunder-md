/*
 * Conversion helpers shared by the background script, the compose script and
 * the message display script. No dependency is required at load time:
 * TurndownService, turndownPluginGfm and marked are resolved only when used,
 * so the file can be loaded where those libraries are absent.
 */
(function (root) {
  "use strict";

  const SOURCE_CLASS = "thundermd-source";
  const BLOCK_TAGS = new Set([
    "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DD", "DIV", "DL", "DT",
    "FIELDSET", "FIGCAPTION", "FIGURE", "FOOTER", "FORM", "H1", "H2", "H3",
    "H4", "H5", "H6", "HEADER", "HR", "LI", "MAIN", "NAV", "OL", "P", "PRE",
    "SECTION", "TABLE", "TBODY", "TD", "TFOOT", "TH", "THEAD", "TR", "UL",
  ]);

  let turndownInstance = null;

  function getTurndown() {
    if (turndownInstance) {
      return turndownInstance;
    }
    const service = new root.TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
      emDelimiter: "_",
      strongDelimiter: "**",
      hr: "---",
    });
    if (root.turndownPluginGfm && root.turndownPluginGfm.gfm) {
      service.use(root.turndownPluginGfm.gfm);
    }
    service.remove(["script", "style", "title", "meta", "head"]);
    // Turndown aligns list items to 4 columns ("-   x"); a single space is enough.
    service.addRule("listItemSingleSpace", {
      filter: "li",
      replacement(content, node, options) {
        const body = content
          .replace(/^\n+/, "")
          .replace(/\n+$/, "\n")
          .replace(/\n/gm, "\n  ");
        let prefix = options.bulletListMarker + " ";
        const parent = node.parentNode;
        if (parent.nodeName === "OL") {
          const start = parent.getAttribute("start");
          const index = Array.prototype.indexOf.call(parent.children, node);
          prefix = (start ? Number(start) + index : index + 1) + ". ";
        }
        return prefix + body + (node.nextSibling && !/\n$/.test(body) ? "\n" : "");
      },
    });
    turndownInstance = service;
    return service;
  }

  /**
   * Tables without a header row are kept as raw HTML by the GFM plugin.
   * Promote the first row to a header row so every table becomes a GFM
   * table. Works on a clone, never on the live document.
   */
  function normalizeTables(root) {
    for (const table of root.querySelectorAll("table")) {
      if (table.querySelector("th")) {
        continue;
      }
      const firstRow = table.querySelector("tr");
      if (!firstRow) {
        continue;
      }
      for (const cell of Array.from(firstRow.children)) {
        if (cell.nodeName === "TD") {
          const th = cell.ownerDocument.createElement("th");
          while (cell.firstChild) {
            th.appendChild(cell.firstChild);
          }
          cell.replaceWith(th);
        }
      }
    }
  }

  /**
   * HTML (string or DOM node) -> GFM markdown. `excludeSelector` removes
   * matching elements from a clone before converting (e.g. hidden header
   * tables Thunderbird prepends to displayed messages).
   */
  function htmlToMarkdown(input, excludeSelector) {
    if (input == null) {
      return "";
    }
    const source = typeof input === "string" ? parseHtml(input) : input.cloneNode(true);
    if (excludeSelector) {
      for (const node of source.querySelectorAll(excludeSelector)) {
        node.remove();
      }
    }
    normalizeTables(source);
    nestLists(source);
    return getTurndown().turndown(source).trim();
  }

  function parseHtml(html) {
    return new root.DOMParser().parseFromString(html, "text/html").body;
  }

  function isList(node) {
    return node.nodeName === "UL" || node.nodeName === "OL";
  }

  /*
   * The Thunderbird editor nests lists as siblings of their parent item
   * (<ul><li>a</li><ul><li>b</li></ul></ul>) and reports the list state of
   * the formatting toolbar only for items with inline content. The output of
   * marked is reshaped the same way: nested lists move after their item and
   * single-paragraph (loose) items are unwrapped. Items with several
   * paragraphs are left as they are.
   */
  function flattenListItems(root) {
    for (const item of Array.from(root.querySelectorAll("li"))) {
      let reference = item;
      for (const list of Array.from(item.children).filter(isList)) {
        reference.after(list);
        reference = list;
      }
      const content = Array.from(item.childNodes).filter(node => node.nodeType !== 3 || node.data.trim());
      if (content.length === 1 && content[0].nodeName === "P") {
        const paragraph = content[0];
        while (paragraph.firstChild) {
          item.insertBefore(paragraph.firstChild, paragraph);
        }
        paragraph.remove();
      }
      trimTrailingWhitespace(item);
    }
  }

  function trimTrailingWhitespace(element) {
    let last = element.lastChild;
    while (last && last.nodeType === 3) {
      last.data = last.data.replace(/\s+$/, "");
      if (last.data) {
        return;
      }
      last.remove();
      last = element.lastChild;
    }
  }

  /*
   * Inverse of flattenListItems for turndown, which only indents a list
   * placed inside an item. A list without a preceding item is left alone.
   */
  function nestLists(root) {
    for (const list of Array.from(root.querySelectorAll("ul > ul, ul > ol, ol > ul, ol > ol"))) {
      const previous = list.previousElementSibling;
      if (previous && previous.nodeName === "LI") {
        previous.appendChild(list);
      }
    }
  }

  /**
   * Markdown -> HTML. CommonMark line semantics (`breaks: false`): a single
   * newline is a soft break, so hard-wrapped sources render as flowing text
   * and list items stay on one line. A hard break needs two trailing spaces
   * or a backslash.
   */
  function markdownToHtml(markdown) {
    if (!markdown || !markdown.trim()) {
      return "";
    }
    const body = parseHtml(root.marked.parse(markdown, { gfm: true, breaks: false, async: false }));
    flattenListItems(body);
    return styleTables(body.innerHTML);
  }

  const TABLE_STYLE = "border-collapse:collapse;border:1px solid #999999";
  const CELL_STYLE = "border:1px solid #999999;padding:4px 8px";

  /**
   * Email clients ignore stylesheets, so rendered tables get borders as
   * attributes and inline styles. Only marked's own output is processed
   * (plain <table>, <th align=...>, <td align=...> tags).
   */
  function styleTables(html) {
    return html
      .replace(/<table>/g, `<table border="1" cellpadding="4" cellspacing="0" style="${TABLE_STYLE}">`)
      .replace(/<(th|td)(\s[^>]*)?>/g, (match, tag, attrs) => `<${tag}${attrs || ""} style="${CELL_STYLE}">`);
  }

  /**
   * Text of an editor node with line breaks rebuilt: <br> -> "\n", block
   * elements -> "\n" before and after. NBSPs inserted by the editor become
   * plain spaces.
   */
  function domToText(node) {
    const out = [];
    walk(node, out);
    return out
      .join("")
      .replace(/ /g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .replace(/^\n+/, "")
      .replace(/\s+$/, "");
  }

  function walk(node, out) {
    if (node.nodeType === 3) {
      out.push(node.nodeValue.replace(/\r?\n/g, " "));
      return;
    }
    if (node.nodeType !== 1 && node.nodeType !== 11) {
      return;
    }
    const tag = node.nodeName;
    if (tag === "BR") {
      out.push("\n");
      return;
    }
    const block = BLOCK_TAGS.has(tag);
    if (block && out.length && !out[out.length - 1].endsWith("\n")) {
      out.push("\n");
    }
    for (const child of node.childNodes) {
      walk(child, out);
    }
    if (block && out.length && !out[out.length - 1].endsWith("\n")) {
      out.push("\n");
    }
  }

  function escapeHtml(text) {
    return String(text)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /**
   * Plain text as escaped HTML lines separated by <br>, the representation
   * used inside the markdown source wrapper.
   */
  function textToLinesHtml(text) {
    const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    return lines.map(line => escapeHtml(line)).join("<br>");
  }

  /**
   * Markdown source wrapper as an HTML string.
   */
  function textToSourceHtml(text) {
    return `<div class="${SOURCE_CLASS}">${textToLinesHtml(text)}<br></div>`;
  }

  /**
   * Markdown source wrapper as a DOM element of the given document.
   */
  function buildSourceElement(doc, text) {
    const div = doc.createElement("div");
    div.className = SOURCE_CLASS;
    const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    lines.forEach((line, index) => {
      if (line) {
        div.appendChild(doc.createTextNode(line));
      }
      if (index < lines.length - 1) {
        div.appendChild(doc.createElement("br"));
      }
    });
    // A trailing <br> keeps the caret inside the block even on an empty line.
    div.appendChild(doc.createElement("br"));
    return div;
  }

  function getSourceElement(body) {
    return body ? body.querySelector(`:scope > .${SOURCE_CLASS}`) : null;
  }

  root.ThunderMD = Object.assign(root.ThunderMD || {}, {
    SOURCE_CLASS,
    htmlToMarkdown,
    markdownToHtml,
    domToText,
    escapeHtml,
    textToLinesHtml,
    textToSourceHtml,
    buildSourceElement,
    getSourceElement,
  });
})(globalThis);
