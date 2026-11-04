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

  // Separates the cells of a row between the cell and the table rules.
  const CELL_MARK = "\u001f";

  function isHeadingRow(row) {
    const parent = row.parentNode;
    if (parent.nodeName === "THEAD") {
      return true;
    }
    return parent.firstElementChild === row &&
      (parent.nodeName === "TABLE" || parent.nodeName === "TBODY") &&
      Array.from(row.children).every(cell => cell.nodeName === "TH");
  }

  function padCell(text, width, align) {
    const gap = width - Array.from(text).length;
    if (gap <= 0) {
      return text;
    }
    if (align === "right") {
      return " ".repeat(gap) + text;
    }
    if (align === "center") {
      const left = Math.floor(gap / 2);
      return " ".repeat(left) + text + " ".repeat(gap - left);
    }
    return text + " ".repeat(gap);
  }

  function delimiterCell(width, align) {
    if (align === "left") {
      return ":" + "-".repeat(width - 1);
    }
    if (align === "right") {
      return "-".repeat(width - 1) + ":";
    }
    if (align === "center") {
      return ":" + "-".repeat(width - 2) + ":";
    }
    return "-".repeat(width);
  }

  /**
   * GFM table with every column padded to its widest cell. `rows` are arrays
   * of cell strings, the first one is the heading row; `aligns` holds
   * "left", "right", "center" or "" per column.
   */
  function formatTable(rows, aligns) {
    const columns = Math.max(...rows.map(row => row.length));
    const cells = rows.map(row => Array.from({ length: columns }, (_, i) => row[i] || ""));
    const widths = Array.from({ length: columns }, (_, i) =>
      Math.max(3, ...cells.map(row => Array.from(row[i]).length)));
    const line = parts => "| " + parts.join(" | ") + " |";
    const out = [line(cells[0].map((text, i) => padCell(text, widths[i], aligns[i])))];
    out.push(line(widths.map((width, i) => delimiterCell(width, aligns[i]))));
    for (const row of cells.slice(1)) {
      out.push(line(row.map((text, i) => padCell(text, widths[i], aligns[i]))));
    }
    return out.join("\n");
  }

  /*
   * Replace the table rules of turndown-plugin-gfm (rules added later take
   * precedence) to align the columns, and escape pipes inside cells, which
   * the plugin leaves as they are and which would split the cell. Header-less
   * tables keep the plugin's `keep`; normalizeTables() avoids them anyway.
   */
  function addAlignedTableRules(service) {
    service.addRule("alignedTableCell", {
      filter: ["th", "td"],
      replacement(content) {
        const text = content.replace(/\s*\n\s*/g, " ").trim().replace(/(?<!\\)\|/g, "\\|");
        return CELL_MARK + text;
      },
    });
    service.addRule("alignedTableRow", {
      filter: "tr",
      replacement(content) {
        return "\n" + content;
      },
    });
    service.addRule("alignedTableSection", {
      filter: ["thead", "tbody", "tfoot"],
      replacement(content) {
        return content;
      },
    });
    service.addRule("alignedTable", {
      filter(node) {
        return node.nodeName === "TABLE" && node.rows.length > 0 && isHeadingRow(node.rows[0]);
      },
      replacement(content, node) {
        const rows = content
          .split("\n")
          .filter(line => line.includes(CELL_MARK))
          .map(line => line.split(CELL_MARK).slice(1));
        if (!rows.length) {
          return "";
        }
        const aligns = Array.from(node.rows[0].cells, cell =>
          (cell.getAttribute("align") || "").toLowerCase());
        return "\n\n" + formatTable(rows, aligns) + "\n\n";
      },
    });
  }

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
      addAlignedTableRules(service);
    }
    service.remove(["script", "style", "title", "meta", "head"]);
    // Turndown escapes every underscore. Between two letters or digits an
    // underscore cannot open or close emphasis (CommonMark intraword rule),
    // so identifiers such as q_full stay readable.
    const escape = service.escape.bind(service);
    service.escape = text => escape(text).replace(/(?<=[\p{L}\p{N}])\\_(?=[\p{L}\p{N}])/gu, "_");
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

  /*
   * The wrapper is a <pre>: on Enter the Thunderbird editor inserts a line
   * break in it, while it splits a <div> or <p> into a new block at every
   * line (mail.compose.default_to_paragraph).
   */
  const SOURCE_TAG = "pre";

  /**
   * Markdown source wrapper as an HTML string.
   */
  function textToSourceHtml(text) {
    return `<${SOURCE_TAG} class="${SOURCE_CLASS}">${textToLinesHtml(text)}<br></${SOURCE_TAG}>`;
  }

  /**
   * Markdown source wrapper as a DOM element of the given document.
   */
  function buildSourceElement(doc, text) {
    const wrapper = doc.createElement(SOURCE_TAG);
    wrapper.className = SOURCE_CLASS;
    const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");
    lines.forEach((line, index) => {
      if (line) {
        wrapper.appendChild(doc.createTextNode(line));
      }
      if (index < lines.length - 1) {
        wrapper.appendChild(doc.createElement("br"));
      }
    });
    // A trailing <br> keeps the caret inside the block even on an empty line.
    wrapper.appendChild(doc.createElement("br"));
    return wrapper;
  }

  function getSourceElement(body) {
    return body ? body.querySelector(`:scope > .${SOURCE_CLASS}`) : null;
  }

  /**
   * All top-level source wrappers. Normally one; a draft written with an
   * earlier version, where the editor split the block at every Enter, holds
   * one per line.
   */
  function getSourceElements(body) {
    return body ? Array.from(body.querySelectorAll(`:scope > .${SOURCE_CLASS}`)) : [];
  }

  /** Markdown text of the wrappers, one line per wrapper boundary. */
  function sourceText(wrappers) {
    return wrappers.map(wrapper => domToText(wrapper)).join("\n");
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
    getSourceElements,
    sourceText,
  });
})(globalThis);
