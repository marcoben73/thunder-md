"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const localesDir = path.join(__dirname, "..", "src", "_locales");
const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src", "manifest.json"), "utf8"));
const background = fs.readFileSync(path.join(__dirname, "..", "src", "background.js"), "utf8");

function readLocale(code) {
  return JSON.parse(fs.readFileSync(path.join(localesDir, code, "messages.json"), "utf8"));
}

const locales = fs.readdirSync(localesDir);
const reference = readLocale(manifest.default_locale);
const referenceKeys = Object.keys(reference).sort();

test("default locale exists", () => {
  assert.ok(locales.includes(manifest.default_locale));
});

for (const code of locales) {
  test(`locale ${code} has the same keys as ${manifest.default_locale}`, () => {
    const messages = readLocale(code);
    assert.deepEqual(Object.keys(messages).sort(), referenceKeys);
    for (const [key, entry] of Object.entries(messages)) {
      assert.ok(entry.message && entry.message.trim(), `${code}: empty message for ${key}`);
    }
  });
}

test("every key referenced by manifest and background exists in the default locale", () => {
  const used = new Set();
  for (const match of JSON.stringify(manifest).matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) {
    used.add(match[1]);
  }
  for (const match of background.matchAll(/\bt\("([A-Za-z0-9_]+)"\)/g)) {
    used.add(match[1]);
  }
  assert.ok(used.size > 0);
  for (const key of used) {
    assert.ok(key in reference, `missing key ${key}`);
  }
});
