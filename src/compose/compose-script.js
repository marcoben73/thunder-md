/*
 * Compose script: runs in the real editor document. Converts the author
 * region between native HTML and markdown source on request of the
 * background script.
 */
(function () {
  "use strict";

  const MD = globalThis.ThunderMD;

  function placeCaretAtEnd(node) {
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(node);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function currentState() {
    return { markdown: Boolean(MD.getSourceElement(document.body)) };
  }

  function toMarkdown() {
    if (MD.getSourceElement(document.body)) {
      return currentState();
    }
    const nodes = MD.findAuthorRegion(document.body);
    const container = document.createElement("div");
    for (const node of nodes) {
      container.appendChild(node.cloneNode(true));
    }
    const source = MD.htmlToMarkdown(container);
    return setSource(source);
  }

  function setSource(source) {
    const wrapper = MD.buildSourceElement(document, source);
    const existing = MD.getSourceElement(document.body);
    if (existing) {
      existing.replaceWith(wrapper);
    } else {
      MD.replaceAuthorRegion(document.body, wrapper);
    }
    placeCaretAtEnd(wrapper);
    return currentState();
  }

  function toHtml() {
    const wrapper = MD.getSourceElement(document.body);
    if (!wrapper) {
      return Object.assign(currentState(), { source: null });
    }
    const source = MD.domToText(wrapper);
    const html = MD.markdownToHtml(source);
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const fragment = document.createDocumentFragment();
    for (const node of Array.from(parsed.body.childNodes)) {
      fragment.appendChild(document.importNode(node, true));
    }
    if (!fragment.childNodes.length) {
      fragment.appendChild(document.createElement("br"));
    }
    const last = fragment.lastChild;
    wrapper.replaceWith(fragment);
    placeCaretAtEnd(last);
    return Object.assign(currentState(), { source });
  }

  /** The source wrapper when the whole selection lies inside it. */
  function sourceElementAroundSelection() {
    const wrapper = MD.getSourceElement(document.body);
    const selection = window.getSelection();
    if (!wrapper || !selection || !selection.rangeCount) {
      return null;
    }
    const range = selection.getRangeAt(0);
    return wrapper.contains(range.startContainer) && wrapper.contains(range.endContainer) ? wrapper : null;
  }

  function insertLines(text) {
    const html = MD.textToLinesHtml(text);
    if (document.execCommand("insertHTML", false, html)) {
      return;
    }
    const selection = window.getSelection();
    const range = selection.getRangeAt(0);
    range.deleteContents();
    const fragment = new DOMParser().parseFromString(html, "text/html").body;
    const nodes = Array.from(fragment.childNodes).map(node => document.importNode(node, true));
    for (const node of nodes) {
      range.insertNode(node);
      range.setStartAfter(node);
    }
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  /*
   * Editors such as Ghostwriter put an HTML flavor on the clipboard with one
   * block element per line. Pasted as HTML into the source wrapper, every
   * line would become a paragraph and show up with a blank line after it.
   * Inside the wrapper only the plain text flavor is meaningful.
   */
  function onPaste(event) {
    if (!sourceElementAroundSelection()) {
      return;
    }
    const data = event.clipboardData;
    const text = data ? data.getData("text/plain") : "";
    if (!text) {
      return;
    }
    event.preventDefault();
    insertLines(text);
  }

  document.addEventListener("paste", onPaste, true);

  browser.runtime.onMessage.addListener(message => {
    if (!message || typeof message.action !== "string") {
      return false;
    }
    switch (message.action) {
      case "compose.getState":
        return Promise.resolve(currentState());
      case "compose.toMarkdown":
        return Promise.resolve(toMarkdown());
      case "compose.toHtml":
        return Promise.resolve(toHtml());
      case "compose.setSource":
        return Promise.resolve(setSource(message.source || ""));
      default:
        return false;
    }
  });

  // Reopened drafts: if the body already holds the wrapper, the background
  // script must align the button state.
  browser.runtime.sendMessage({ action: "compose.ready", state: currentState() }).catch(() => {});
})();
