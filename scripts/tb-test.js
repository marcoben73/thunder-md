#!/usr/bin/env node
/*
 * End-to-end scenarios against a running Thunderbird started with
 * scripts/test-profile.sh run (devtools server on port 6000).
 *
 *   node scripts/tb-test.js [scenario...] [--port 6000]
 *
 * Installs (or reloads) src/ as a temporary add-on, drives the UI from the
 * parent process (button clicks) and the extension APIs from the background
 * page, and checks the resulting DOM.
 */
"use strict";

const path = require("node:path");
const { RdpClient } = require("./tb-rdp.js");
const { startSmtpSink, decodeQuotedPrintable } = require("./smtp-sink.js");

const ADDON_ID = "thundermd@khet.it";
const DISPLAY_BUTTON = "thundermd_khet_it-messageDisplayAction-toolbarbutton";
const COMPOSE_BUTTON = "thundermd_khet_it-composeAction-toolbarbutton";
const SRC = path.resolve(__dirname, "..", "src");

const sleep = ms => new Promise(r => setTimeout(r, ms));

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

class Harness {
  constructor(rdp, bg, chrome) {
    this.rdp = rdp;
    this.bg = bg;
    this.chrome = chrome;
    this.logs = [];
    bg.onConsole(m => this.logs.push(`[${m.level}] ${m.text}`));
  }

  static async create(port) {
    const rdp = await RdpClient.connect(port);
    const installed = (await rdp.listAddons()).some(a => a.id === ADDON_ID);
    if (!installed) {
      await rdp.installTemporaryAddon(SRC);
    } else if (!process.env.TB_NO_RELOAD) {
      await rdp.reloadAddon(ADDON_ID);
    }
    await sleep(1000);
    const bg = await rdp.addonTarget(ADDON_ID);
    const chrome = await rdp.parentProcessTarget();
    return new Harness(rdp, bg, chrome);
  }

  bgEval(body) {
    return this.bg.evalAsync(body);
  }

  chromeEval(body) {
    return this.chrome.evalAsync(body);
  }

  async ensureInbox() {
    // The extension has no accountsRead: inspect the folder from the parent.
    await this.chromeEval(`
      const { MailServices } = ChromeUtils.importESModule("resource:///modules/MailServices.sys.mjs");
      const inbox = MailServices.accounts.localFoldersServer.rootFolder.getChildNamed("Inbox");
      if (inbox.getTotalMessages(false) === 0) {
        inbox.updateFolder(null);
        await new Promise(r => setTimeout(r, 2500));
      }
      const w = Services.wm.getMostRecentWindow("mail:3pane");
      const about3Pane = w.gTabmail.currentAbout3Pane;
      if (!about3Pane.gFolder || about3Pane.gFolder.URI !== inbox.URI) {
        about3Pane.displayFolder(inbox.URI);
        await new Promise(r => setTimeout(r, 1500));
      }
      return inbox.getTotalMessages(false)`);
  }

  async mailTabId() {
    // Tab ids are renumbered when the add-on is reloaded: resolve each time.
    return this.bgEval("const [tab] = await browser.tabs.query({ mailTab: true }); return tab.id");
  }

  /** Selects a message in the 3-pane thread tree by subject. */
  async selectMessage(subject) {
    await this.chromeEval(`
      const w = Services.wm.getMostRecentWindow("mail:3pane");
      const about3Pane = w.gTabmail.currentAbout3Pane;
      const view = about3Pane.gDBView;
      for (let i = 0; i < view.rowCount; i++) {
        if (view.getMsgHdrAt(i).subject === ${JSON.stringify(subject)}) {
          about3Pane.threadTree.selectedIndex = i;
          return i;
        }
      }
      throw new Error("message not found: " + ${JSON.stringify(subject)})`);
    await sleep(1500);
  }

  /** Extension-side id of the message displayed in the mail tab. */
  async displayedMessageId() {
    const tabId = await this.mailTabId();
    return this.bgEval(`const m = await browser.messageDisplay.getDisplayedMessage(${tabId}); return m && m.id`);
  }

  /**
   * Fires the action's click handler directly. A real click goes through
   * triggerAction(), which waits for the window to become active; on a
   * desktop where the test Thunderbird has no focus that never happens.
   */
  actionSnippet(apiName, windowExpr) {
    return `
      const { ExtensionParent } = ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
      const ext = ExtensionParent.GlobalManager.getExtension("${ADDON_ID}");
      ExtensionParent.apiManager.global.${apiName}(ext).emit("click", ${windowExpr}, { button: 0, modifiers: [] });`;
  }

  async clickDisplayButton() {
    await this.chromeEval(`
      const w = Services.wm.getMostRecentWindow("mail:3pane");
      ${this.actionSnippet("messageDisplayActionFor", "w")}
      return true`);
    await sleep(1200);
  }

  readPane() {
    return this.chromeEval(`
      const w = Services.wm.getMostRecentWindow("mail:3pane");
      const am = w.gTabmail.currentAboutMessage;
      const doc = am.getMessagePaneBrowser().contentDocument;
      const pre = doc.querySelector("pre.thundermd-source");
      return {
        markdown: pre ? pre.textContent : null,
        hasHtmlBody: Boolean(doc.querySelector(".moz-text-html, .moz-text-plain, .moz-text-flowed")),
        buttonTitle: am.document.getElementById("${DISPLAY_BUTTON}").getAttribute("tooltiptext"),
      }`);
  }

  composeWindowSnippet(subject) {
    return `
      const w = [...Services.wm.getEnumerator("msgcompose")].find(x => x.document.getElementById("msgSubject").value === ${JSON.stringify(subject)});
      if (!w) throw new Error("compose window not found: " + ${JSON.stringify(subject)});
      const editorDoc = w.document.getElementById("messageEditor").contentDocument;`;
  }

  async clickComposeButton(subject) {
    await this.chromeEval(`${this.composeWindowSnippet(subject)}
      ${this.actionSnippet("composeActionFor", "w")}
      return true`);
    await sleep(1200);
  }

  readEditor(subject) {
    return this.chromeEval(`${this.composeWindowSnippet(subject)}
      const wrapper = editorDoc.body.querySelector(":scope > .thundermd-source");
      return {
        html: editorDoc.body.innerHTML,
        children: [...editorDoc.body.children].map(e => e.localName + (e.className ? "." + e.className : "") + (e.getAttribute("type") ? "[" + e.getAttribute("type") + "]" : "")),
        wrapperText: wrapper ? wrapper.innerText : null,
        wrapperHtml: wrapper ? wrapper.innerHTML : null,
        buttonTitle: w.document.getElementById("${COMPOSE_BUTTON}").getAttribute("tooltiptext"),
      }`);
  }

  /**
   * Dispatches a synthetic paste event carrying a text/plain flavor into the
   * editor document, without touching the system clipboard. Gecko ignores the
   * clipboardData member of ClipboardEventInit and only honors its own
   * dataType/data pair, so a single flavor is all a synthetic event can carry.
   * The editor ignores untrusted events, so only the add-on's listener can
   * insert text.
   */
  pasteText(subject, text) {
    return this.chromeEval(`${this.composeWindowSnippet(subject)}
      const win = editorDoc.defaultView;
      const event = new win.ClipboardEvent("paste", { dataType: "text/plain", data: ${JSON.stringify(text)}, bubbles: true, cancelable: true });
      editorDoc.body.dispatchEvent(event);
      return event.defaultPrevented`);
  }

  async closeCompose(subject) {
    await this.bgEval(`
      const tabs = await browser.tabs.query({ type: "messageCompose" });
      for (const tab of tabs) {
        const d = await browser.compose.getComposeDetails(tab.id);
        if (d.subject === ${JSON.stringify(subject)}) {
          await browser.compose.setComposeDetails(tab.id, { isModified: false });
          await browser.tabs.remove(tab.id);
        }
      }
      return true`);
  }

  async dismissDialogs() {
    return this.chromeEval(`
      let closed = [];
      for (const w of Services.wm.getEnumerator(null)) {
        if (w.location.href.includes("commonDialog.xhtml")) {
          const text = w.document.getElementById("infoBody")?.textContent || "";
          closed.push(text.slice(0, 200));
          w.document.querySelector("dialog").acceptDialog();
        }
      }
      return closed`);
  }
}

const scenarios = {
  async "display-toggle"(h) {
    await h.selectMessage("HTML test message");
    let pane = await h.readPane();
    assert(pane.markdown === null && pane.hasHtmlBody, "initial pane shows HTML");
    await h.clickDisplayButton();
    pane = await h.readPane();
    assert(pane.markdown !== null, "markdown view applied");
    const md = pane.markdown;
    for (const expected of ["# Project update", "**team**", "_important_", "[the docs](https://example.invalid/docs)", "- first item", "1. step one", "```", "npm test", "| Name  | Value |", "| ----- | ----- |", "| alpha | 1     |", "> A quoted sentence."]) {
      assert(md.includes(expected), `markdown contains ${JSON.stringify(expected)}\n--- got:\n${md}`);
    }
    assert(!md.includes("<table") && !md.includes("Subject:"), `no raw header table\n--- got:\n${md}`);
    assert(pane.buttonTitle === "Show original message body", `active title, got ${pane.buttonTitle}`);
    await h.clickDisplayButton();
    pane = await h.readPane();
    assert(pane.markdown === null && pane.hasHtmlBody, "original body restored");
    assert(pane.buttonTitle === "Show message body as Markdown", `default title, got ${pane.buttonTitle}`);
  },

  async "display-persist-across-messages"(h) {
    await h.selectMessage("HTML test message");
    await h.clickDisplayButton();
    await h.selectMessage("Plain text test message");
    let pane = await h.readPane();
    assert(pane.markdown !== null, "markdown mode kept on the next message");
    assert(pane.markdown.includes("quoted line one"), `plain text message converted\n--- got:\n${pane.markdown}`);
    assert(!pane.markdown.includes("Subject:"), `no header table in plain message\n--- got:\n${pane.markdown}`);
    await h.clickDisplayButton();
    await h.selectMessage("HTML test message");
    pane = await h.readPane();
    assert(pane.markdown === null, "mode off persists on the next message");
  },

  async "compose-toggle"(h) {
    const subject = "tmd-compose";
    try {
      await h.bgEval(`await browser.compose.beginNew({ subject: ${JSON.stringify(subject)}, to: ["a@example.invalid"], body: "<h2>Hi</h2><p>a <b>b</b></p><ul><li>x</li><ul><li>x1</li></ul><li>y</li></ul><table><tr><th>Col A</th><th>Col B</th></tr><tr><td>1</td><td>2</td></tr></table><p>between</p><table><tr><td>k</td><td>v</td></tr><tr><td>k2</td><td>v2</td></tr></table>" }); return true`);
      await sleep(2000);
      await h.clickComposeButton(subject);
      let ed = await h.readEditor(subject);
      assert(ed.wrapperText !== null, `wrapper present after first click; children=${ed.children}`);
      for (const expected of ["## Hi", "a **b**", "- x\n  - x1\n- y", "| Col A | Col B |", "| ----- | ----- |", "| 1     | 2     |", "| k   | v   |", "| k2  | v2  |"]) {
        assert(ed.wrapperText.includes(expected), `wrapper text contains ${JSON.stringify(expected)}\n--- got:\n${ed.wrapperText}`);
      }
      assert(ed.buttonTitle === "Convert Markdown to HTML", `active title, got ${ed.buttonTitle}`);
      await h.clickComposeButton(subject);
      ed = await h.readEditor(subject);
      assert(ed.wrapperText === null, "wrapper removed after second click");
      for (const expected of ["<h2>Hi</h2>", "<strong>b</strong>", "<li>x</li><ul>\n<li>x1</li>\n</ul>\n<li>y</li>", ">Col A</th>", ">2</td>", ">k</th>", ">v2</td>", 'border="1"', "border-collapse:collapse"]) {
        assert(ed.html.includes(expected), `html contains ${JSON.stringify(expected)}\n--- got:\n${ed.html}`);
      }
      assert(ed.buttonTitle === "Switch to Markdown mode", `default title, got ${ed.buttonTitle}`);
      assert((ed.html.match(/<table/g) || []).length === 2, `two tables rendered\n--- got:\n${ed.html}`);
    } finally {
      await h.closeCompose(subject);
    }
  },

  async "compose-paste-plain-text"(h) {
    const subject = "tmd-paste";
    const text = "\n# Title\nline one\nline two";
    try {
      await h.bgEval(`await browser.compose.beginNew({ subject: ${JSON.stringify(subject)}, to: ["a@example.invalid"], body: "<p>x</p>" }); return true`);
      await sleep(2000);
      await h.clickComposeButton(subject);
      let prevented = await h.pasteText(subject, text);
      assert(prevented === true, "paste handled inside the markdown block");
      await sleep(300);
      let ed = await h.readEditor(subject);
      assert(ed.wrapperHtml !== null, `wrapper present; children=${ed.children}`);
      assert(ed.wrapperHtml.includes("x<br># Title<br>line one<br>line two"), `lines joined with br\n--- got:\n${ed.wrapperHtml}`);
      assert(!/<(p|div)[\s>]/.test(ed.wrapperHtml), `no block elements inside the wrapper\n--- got:\n${ed.wrapperHtml}`);
      // Terminal copy: two-space margin, hard wraps, padded blank lines.
      prevented = await h.pasteText(subject, "\n  Para one\n  wrapped\n   \n  1. item\n     cont\n     \n  2. two");
      assert(prevented === true, "terminal paste handled inside the markdown block");
      await sleep(300);
      ed = await h.readEditor(subject);
      assert(ed.wrapperHtml.includes("Para one wrapped<br>1. item cont<br>2. two"), `terminal margin and wraps removed\n--- got:\n${ed.wrapperHtml}`);
      await h.clickComposeButton(subject);
      ed = await h.readEditor(subject);
      assert(ed.html.includes("<h1>Title</h1>"), `pasted markdown converted\n--- got:\n${ed.html}`);
      assert(/<li>item cont<\/li>\s*<li>two<\/li>/.test(ed.html), `terminal list converted\n--- got:\n${ed.html}`);
      prevented = await h.pasteText(subject, text);
      assert(prevented === false, "paste left to the editor outside the markdown block");
    } finally {
      await h.closeCompose(subject);
    }
  },

  async "compose-enter-keeps-block"(h) {
    const subject = "tmd-enter";
    try {
      await h.bgEval(`await browser.compose.beginNew({ subject: ${JSON.stringify(subject)}, to: ["a@example.invalid"], body: "<p>x</p>" }); return true`);
      await sleep(2000);
      await h.clickComposeButton(subject);
      // insertParagraph is what the editor runs on Enter.
      const result = await h.chromeEval(`${h.composeWindowSnippet(subject)}
        const wrapper = editorDoc.body.querySelector(":scope > .thundermd-source");
        const sel = editorDoc.defaultView.getSelection();
        sel.collapse(wrapper, wrapper.childNodes.length);
        editorDoc.execCommand("insertParagraph", false, null);
        editorDoc.execCommand("insertHTML", false, "# Head");
        editorDoc.execCommand("insertParagraph", false, null);
        editorDoc.execCommand("insertParagraph", false, null);
        editorDoc.execCommand("insertHTML", false, "second line");
        // Blocks left by the earlier <div> wrapper must still be merged.
        const legacy = editorDoc.createElement("div");
        legacy.className = "thundermd-source";
        legacy.textContent = "- old item";
        editorDoc.body.appendChild(legacy);
        return { tag: wrapper.localName, wrappers: editorDoc.body.querySelectorAll(".thundermd-source").length, html: wrapper.innerHTML };`);
      assert(result.tag === "pre", `wrapper is a pre, got ${result.tag}`);
      assert(result.wrappers === 2, `enter did not split the block\n--- got:\n${result.html}`);
      await h.clickComposeButton(subject);
      const ed = await h.readEditor(subject);
      assert(ed.wrapperText === null, `no wrapper left; children=${ed.children}`);
      for (const expected of ["<p>x</p>", "<h1>Head</h1>", "<p>second line</p>", "<li>old item</li>"]) {
        assert(ed.html.includes(expected), `html contains ${JSON.stringify(expected)}\n--- got:\n${ed.html}`);
      }
    } finally {
      await h.closeCompose(subject);
    }
  },

  async "compose-reply-keeps-quote"(h) {
    const subject = "tmd-reply";
    try {
      // No body here: an explicit body in beginReply replaces the quote.
      await h.selectMessage("HTML test message");
      const messageId = await h.displayedMessageId();
      assert(messageId, "displayed message id resolved");
      const tabId = await h.bgEval(`const t = await browser.compose.beginReply(${messageId}, "replyToSender", { subject: ${JSON.stringify(subject)} }); return t.id`);
      await sleep(2500);
      const before = await h.readEditor(subject);
      assert(before.html.includes('type="cite"'), `reply has a cite blockquote; children=${before.children}`);
      await h.clickComposeButton(subject);
      let ed = await h.readEditor(subject);
      assert(ed.wrapperText !== null, `wrapper present; children=${ed.children}`);
      assert(ed.html.includes('type="cite"') && ed.html.includes("Project update"), "quote still present");
      // The identity may reply above or below the quote: the wrapper must sit
      // at one end, with the cite prefix and the blockquote kept together.
      const wrapperIndex = ed.children.findIndex(c => c.startsWith("pre.thundermd-source"));
      assert(wrapperIndex === 0 || wrapperIndex === ed.children.length - 1, `wrapper at one end; children=${ed.children}`);
      await h.bgEval(`await browser.tabs.sendMessage(${tabId}, { action: "compose.setSource", source: "my answer" }); return true`);
      await h.clickComposeButton(subject);
      ed = await h.readEditor(subject);
      assert(ed.wrapperText === null, "wrapper removed");
      assert(ed.html.includes("<p>my answer</p>") && ed.html.includes('type="cite"'), `html back with quote\n--- got:\n${ed.html}`);
    } finally {
      await h.closeCompose(subject);
    }
  },

  async "compose-send-failure-restores-source"(h) {
    const subject = "tmd-send";
    try {
      const tabId = await h.bgEval(`const t = await browser.compose.beginNew({ subject: ${JSON.stringify(subject)}, to: ["a@example.invalid"], body: "<p>x</p>" }); return t.id`);
      await sleep(2000);
      await h.clickComposeButton(subject);
      await h.bgEval(`await browser.tabs.sendMessage(${tabId}, { action: "compose.setSource", source: "# Sent title\\n\\n**bold** text" }); return true`);
      let ed = await h.readEditor(subject);
      assert(ed.wrapperText && ed.wrapperText.includes("# Sent title"), "source set in wrapper");
      await h.chromeEval(`${h.composeWindowSnippet(subject)} w.goDoCommand("cmd_sendNow"); return true`);
      let dialogs = [];
      for (let i = 0; i < 20 && dialogs.length === 0; i++) {
        await sleep(500);
        dialogs = await h.dismissDialogs();
      }
      await sleep(1000);
      ed = await h.readEditor(subject);
      assert(dialogs.length > 0, "a send error dialog appeared (SMTP on a closed port)");
      assert(ed.wrapperText !== null && ed.wrapperText.includes("# Sent title"), `markdown source restored after failed send\n--- html:\n${ed.html}\n--- dialogs: ${dialogs.join(" | ")}`);
      assert(ed.buttonTitle === "Convert Markdown to HTML", `button back to active, got ${ed.buttonTitle}`);
    } finally {
      await h.dismissDialogs();
      await h.closeCompose(subject);
    }
  },

  async "compose-send-success-converts"(h) {
    const subject = "tmd-send-ok";
    const sink = await startSmtpSink(2525);
    try {
      const tabId = await h.bgEval(`const t = await browser.compose.beginNew({ subject: ${JSON.stringify(subject)}, to: ["a@example.invalid"], body: "<p>x</p>" }); return t.id`);
      await sleep(2000);
      await h.clickComposeButton(subject);
      await h.bgEval(`await browser.tabs.sendMessage(${tabId}, { action: "compose.setSource", source: "# Sent title\\n\\n| a | b |\\n|---|---|\\n| 1 | 2 |" }); return true`);
      await h.chromeEval(`${h.composeWindowSnippet(subject)} w.goDoCommand("cmd_sendNow"); return true`);
      let open = true;
      for (let i = 0; i < 30 && open; i++) {
        await sleep(500);
        const dialogs = await h.dismissDialogs();
        assert(dialogs.length === 0, `no error dialog expected, got: ${dialogs.join(" | ")}`);
        open = await h.bgEval(`return (await browser.tabs.query({ type: "messageCompose" })).some(t => t.id === ${tabId})`);
      }
      assert(!open, "compose window closed after a successful send");
      assert(sink.messages.length === 1, `one message received by the SMTP sink, got ${sink.messages.length}`);
      const raw = decodeQuotedPrintable(sink.messages[0]);
      assert(raw.includes("<h1>Sent title</h1>"), `received HTML has the rendered heading\n--- got:\n${raw.slice(0, 1500)}`);
      assert(raw.includes('<table border="1"') && raw.includes("border-collapse:collapse") && raw.includes(">2</td>"), `received HTML has a bordered table\n--- got:\n${raw.slice(0, 1500)}`);
      assert(!raw.includes("thundermd-source"), "no markdown wrapper in the sent message");
      const state = await h.bgEval(`return composeState.has(${tabId})`);
      assert(!state, "compose state cleaned up after the tab closed");
    } finally {
      await sink.close();
      await h.closeCompose(subject);
    }
  },
};

async function main() {
  const args = process.argv.slice(2);
  const portIndex = args.indexOf("--port");
  const port = portIndex >= 0 ? Number(args.splice(portIndex, 2)[1]) : 6000;
  const selected = args.length ? args : Object.keys(scenarios);
  const h = await Harness.create(port);
  await h.ensureInbox();
  let failed = 0;
  for (const name of selected) {
    const fn = scenarios[name];
    if (!fn) {
      console.log(`?? unknown scenario ${name}`);
      failed++;
      continue;
    }
    const logStart = h.logs.length;
    try {
      await fn(h);
      console.log(`ok   ${name}`);
    } catch (error) {
      failed++;
      console.log(`FAIL ${name}\n     ${error.message.replace(/\n/g, "\n     ")}`);
    }
    const newLogs = h.logs.slice(logStart);
    if (newLogs.length) {
      console.log(newLogs.map(l => `     console: ${l}`).join("\n"));
    }
  }
  console.log(`\n${selected.length - failed}/${selected.length} scenarios passed`);
  h.rdp.close();
  process.exitCode = failed ? 1 : 0;
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
