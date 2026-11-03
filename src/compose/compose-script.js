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
