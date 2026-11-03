/*
 * Background: per-tab state of the two toggles, buttons, send hooks.
 */
"use strict";

const ACTIVE_ICON = "icons/md-active.svg";
const SEND_CONVERSION_TIMEOUT_MS = 10000;

// tabId -> boolean (body shown as markdown source)
const displayState = new Map();
// tabId -> { markdown: boolean, sourceBeforeSend: string | null }
const composeState = new Map();

function t(key) {
  return browser.i18n.getMessage(key);
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`ThunderMD: timeout ${label} (${ms}ms)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function getComposeState(tabId) {
  let state = composeState.get(tabId);
  if (!state) {
    state = { markdown: false, sourceBeforeSend: null };
    composeState.set(tabId, state);
  }
  return state;
}

async function updateDisplayButton(tabId, markdown) {
  await browser.messageDisplayAction.setIcon(markdown ? { tabId, path: ACTIVE_ICON } : { tabId });
  await browser.messageDisplayAction.setTitle({
    tabId,
    title: markdown ? t("displayToggleActiveTitle") : null,
  });
}

async function updateComposeButton(tabId, markdown) {
  await browser.composeAction.setIcon(markdown ? { tabId, path: ACTIVE_ICON } : { tabId });
  await browser.composeAction.setTitle({
    tabId,
    title: markdown ? t("composeToggleActiveTitle") : null,
  });
}

/* ---------- Message display ---------- */

/**
 * Manifest message_display_scripts only reach documents loaded after the
 * add-on started. Messages already on screen (install, update, reload) get
 * the script injected here.
 */
async function injectIntoOpenMessages() {
  const manifest = browser.runtime.getManifest();
  const scripts = manifest.message_display_scripts || [];
  const tabs = await browser.tabs.query({ type: ["mail", "messageDisplay"] });
  for (const tab of tabs) {
    let message = null;
    try {
      message = await browser.messageDisplay.getDisplayedMessage(tab.id);
    } catch (error) {
      continue;
    }
    if (!message) {
      continue;
    }
    try {
      for (const script of scripts) {
        for (const file of script.css || []) {
          await browser.tabs.insertCSS(tab.id, { file });
        }
        for (const file of script.js || []) {
          await browser.tabs.executeScript(tab.id, { file });
        }
      }
    } catch (error) {
      console.error("ThunderMD: injecting into an open message failed", error);
    }
  }
}

injectIntoOpenMessages();

browser.messageDisplayAction.onClicked.addListener(async tab => {
  const next = !displayState.get(tab.id);
  displayState.set(tab.id, next);
  try {
    await browser.tabs.sendMessage(tab.id, { action: "display.apply", markdown: next });
  } catch (error) {
    console.error("ThunderMD: display script not reachable", error);
  }
  await updateDisplayButton(tab.id, next);
});

/* ---------- Compose ---------- */

browser.composeAction.onClicked.addListener(async tab => {
  const details = await browser.compose.getComposeDetails(tab.id);
  if (details.isPlainText) {
    // Plain text composition: the editor has no HTML to work with and the
    // formatting toolbar is hidden anyway. Nothing to do.
    return;
  }
  const state = getComposeState(tab.id);
  const action = state.markdown ? "compose.toHtml" : "compose.toMarkdown";
  const result = await browser.tabs.sendMessage(tab.id, { action });
  state.markdown = result.markdown;
  await updateComposeButton(tab.id, state.markdown);
});

browser.compose.onBeforeSend.addListener(async (tab, details) => {
  const state = composeState.get(tab.id);
  if (!state || !state.markdown || details.isPlainText) {
    return {};
  }
  try {
    const result = await withTimeout(
      browser.tabs.sendMessage(tab.id, { action: "compose.toHtml" }),
      SEND_CONVERSION_TIMEOUT_MS,
      "compose.toHtml"
    );
    state.markdown = false;
    state.sourceBeforeSend = result.source;
    await updateComposeButton(tab.id, false);
    const fresh = await browser.compose.getComposeDetails(tab.id);
    return { details: { body: fresh.body } };
  } catch (error) {
    // Never send raw markdown silently.
    console.error("ThunderMD: conversion before send failed, send cancelled", error);
    return { cancel: true };
  }
});

/**
 * Thunderbird does not always set `sendInfo.error` when sending fails
 * (verified on 153: SMTP connection refused gives no error field). A real
 * send always carries `headerMessageId`; "sendLater" only queues.
 */
function sendFailed(sendInfo) {
  if (sendInfo.error) {
    return true;
  }
  return sendInfo.mode === "sendNow" && !sendInfo.headerMessageId;
}

browser.compose.onAfterSend.addListener(async (tab, sendInfo) => {
  const state = composeState.get(tab.id);
  if (!state || state.sourceBeforeSend === null) {
    return;
  }
  const source = state.sourceBeforeSend;
  state.sourceBeforeSend = null;
  if (!sendFailed(sendInfo)) {
    return;
  }
  try {
    const result = await browser.tabs.sendMessage(tab.id, { action: "compose.setSource", source });
    state.markdown = result.markdown;
    await updateComposeButton(tab.id, state.markdown);
  } catch (error) {
    console.error("ThunderMD: restoring the markdown source failed", error);
  }
});

/* ---------- Messages from injected scripts ---------- */

browser.runtime.onMessage.addListener((message, sender) => {
  if (!message || typeof message.action !== "string" || !sender.tab) {
    return false;
  }
  const tabId = sender.tab.id;
  switch (message.action) {
    case "display.getMode":
      return Promise.resolve(Boolean(displayState.get(tabId)));
    case "compose.ready": {
      const state = getComposeState(tabId);
      state.markdown = Boolean(message.state && message.state.markdown);
      return updateComposeButton(tabId, state.markdown).then(() => true);
    }
    default:
      return false;
  }
});

browser.tabs.onRemoved.addListener(tabId => {
  displayState.delete(tabId);
  composeState.delete(tabId);
});
