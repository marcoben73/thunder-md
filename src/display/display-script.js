/*
 * Message display script: runs in the displayed message document. Replaces
 * the rendered body with its markdown source (read-only) and restores it on
 * request.
 */
(function () {
  "use strict";

  const MD = globalThis.ThunderMD;
  // Header tables Thunderbird prepends to the body (hidden in normal view).
  const HIDDEN_HEADER_SELECTOR = ".moz-main-header, [class*=\"moz-header-part\"]";
  // Original body nodes, moved into a fragment while the markdown view is
  // active; no HTML serialization/reparse.
  let originalNodes = null;

  function apply(markdown) {
    const body = document.body;
    if (!body) {
      return { markdown: false };
    }
    if (markdown) {
      if (originalNodes !== null) {
        return { markdown: true };
      }
      const source = MD.htmlToMarkdown(body, HIDDEN_HEADER_SELECTOR);
      originalNodes = document.createDocumentFragment();
      while (body.firstChild) {
        originalNodes.appendChild(body.firstChild);
      }
      const pre = document.createElement("pre");
      pre.className = MD.SOURCE_CLASS;
      pre.textContent = source;
      body.appendChild(pre);
      return { markdown: true };
    }
    if (originalNodes !== null) {
      body.replaceChildren(originalNodes);
      originalNodes = null;
    }
    return { markdown: false };
  }

  browser.runtime.onMessage.addListener(message => {
    if (message && message.action === "display.apply") {
      return Promise.resolve(apply(Boolean(message.markdown)));
    }
    return false;
  });

  browser.runtime
    .sendMessage({ action: "display.getMode" })
    .then(markdown => {
      if (markdown) {
        apply(true);
      }
    })
    .catch(() => {});
})();
