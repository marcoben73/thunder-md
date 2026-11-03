"use strict";

const path = require("node:path");
const { JSDOM } = require("jsdom");

globalThis.TurndownService = require("turndown");
globalThis.turndownPluginGfm = require("turndown-plugin-gfm");
globalThis.marked = require("marked");

require(path.join(__dirname, "..", "src", "lib", "md-convert.js"));
require(path.join(__dirname, "..", "src", "lib", "compose-region.js"));

function dom(html) {
  return new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
}

module.exports = { MD: globalThis.ThunderMD, dom };
