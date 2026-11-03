#!/usr/bin/env node
/*
 * Minimal Firefox/Thunderbird Remote Debugging Protocol client.
 *
 * Library usage (see scripts/tb-test.js):
 *   const { RdpClient } = require("./tb-rdp.js");
 *   const rdp = await RdpClient.connect(6000);
 *   await rdp.installTemporaryAddon("/abs/path/src");
 *   const addon = await rdp.addonTarget("thundermd@khet.it");
 *   addon.onConsole(msg => console.log(msg));
 *   const value = await addon.evalAsync("await browser.tabs.query({})");
 *
 * CLI usage:
 *   node scripts/tb-rdp.js install <addonDir> [port]
 *   node scripts/tb-rdp.js reload <addonId> [port]
 *   node scripts/tb-rdp.js console <addonId> [port]      # tail the add-on console
 *   node scripts/tb-rdp.js eval <addonId> <js> [port]    # evaluate in the background page
 *   node scripts/tb-rdp.js chrome <js> [port]            # evaluate in the parent process
 */
"use strict";

const net = require("node:net");
const EventEmitter = require("node:events");

class RdpClient extends EventEmitter {
  static connect(port = 6000, host = "127.0.0.1") {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ port, host });
      const client = new RdpClient(socket);
      client.on("error", () => {});
      socket.once("error", error => reject(new Error(`cannot connect to the devtools server on ${host}:${port} (${error.code}); start Thunderbird with scripts/test-profile.sh run`)));
      client.once("greeting", () => {
        socket.removeListener("error", reject);
        resolve(client);
      });
    });
  }

  constructor(socket) {
    super();
    this.socket = socket;
    this.buffer = "";
    this.pending = new Map(); // actor -> queue of resolvers
    this.greeted = false;
    socket.setEncoding("utf8");
    socket.on("data", chunk => this._onData(chunk));
    socket.on("close", () => this.emit("close"));
    socket.on("error", error => this.emit("error", error));
  }

  close() {
    this.socket.end();
  }

  _onData(chunk) {
    this.buffer += chunk;
    for (;;) {
      const colon = this.buffer.indexOf(":");
      if (colon < 0) {
        return;
      }
      const length = Number(this.buffer.slice(0, colon));
      if (!Number.isFinite(length)) {
        throw new Error(`RDP: bad packet header ${JSON.stringify(this.buffer.slice(0, 40))}`);
      }
      const body = this.buffer.slice(colon + 1);
      if (Buffer.byteLength(body, "utf8") < length) {
        return;
      }
      const bytes = Buffer.from(body, "utf8");
      const packet = JSON.parse(bytes.subarray(0, length).toString("utf8"));
      this.buffer = bytes.subarray(length).toString("utf8");
      this._dispatch(packet);
    }
  }

  _dispatch(packet) {
    if (!this.greeted && packet.from === "root" && packet.applicationType) {
      this.greeted = true;
      this.emit("greeting", packet);
      return;
    }
    this.emit("packet", packet);
    const queue = this.pending.get(packet.from);
    const isEvent = packet.type !== undefined && !("error" in packet);
    if (queue && queue.length && !isEvent) {
      queue.shift()(packet);
      return;
    }
    if (queue && queue.length && isEvent && queue[0].acceptsType === packet.type) {
      queue.shift()(packet);
      return;
    }
    this.emit(`event:${packet.from}`, packet);
  }

  request(packet, acceptsType) {
    return new Promise((resolve, reject) => {
      const queue = this.pending.get(packet.to) || [];
      const resolver = reply => ("error" in reply ? reject(new Error(`RDP ${packet.type}: ${reply.error} ${reply.message || ""}`)) : resolve(reply));
      resolver.acceptsType = acceptsType;
      queue.push(resolver);
      this.pending.set(packet.to, queue);
      this.socket.write(`${Buffer.byteLength(JSON.stringify(packet), "utf8")}:${JSON.stringify(packet)}`);
    });
  }

  async root() {
    if (!this._root) {
      this._root = await this.request({ to: "root", type: "getRoot" });
    }
    return this._root;
  }

  async listAddons() {
    const reply = await this.request({ to: "root", type: "listAddons" });
    return reply.addons;
  }

  async installTemporaryAddon(addonPath) {
    const root = await this.root();
    const reply = await this.request({ to: root.addonsActor, type: "installTemporaryAddon", addonPath, openDevTools: false });
    return reply.addon;
  }

  async reloadAddon(addonId) {
    const addon = (await this.listAddons()).find(a => a.id === addonId);
    if (!addon) {
      throw new Error(`addon ${addonId} not installed`);
    }
    return this.request({ to: addon.actor, type: "reload" });
  }

  /**
   * Descriptor -> watcher -> first "frame" target (Watcher pattern used by
   * current Firefox/Thunderbird devtools).
   */
  async targetFromDescriptor(descriptorActor, preferUrl = null) {
    const watcher = await this.request({
      to: descriptorActor,
      type: "getWatcher",
      isServerTargetSwitchingEnabled: true,
      isPopupDebuggingEnabled: false,
    });
    const watcherActor = watcher.actor;
    // Several frame targets may show up (fallback document, background
    // page, popups): prefer the one matching `preferUrl`, else wait a
    // little and take the first.
    const forms = [];
    const formPromise = new Promise(resolve => {
      const listener = packet => {
        if (packet.type === "target-available-form" && packet.target) {
          forms.push(packet.target);
          if (!preferUrl || (packet.target.url || "").includes(preferUrl)) {
            this.removeListener(`event:${watcherActor}`, listener);
            resolve(packet.target);
          }
        }
      };
      this.on(`event:${watcherActor}`, listener);
      setTimeout(() => {
        this.removeListener(`event:${watcherActor}`, listener);
        if (forms.length) {
          resolve(forms[0]);
        }
      }, 3000);
    });
    await this.request({ to: watcherActor, type: "watchTargets", targetType: "frame" });
    const form = await withTimeout(formPromise, 10000, "target-available-form");
    return new Target(this, form, watcherActor);
  }

  async addonTarget(addonId) {
    const addon = (await this.listAddons()).find(a => a.id === addonId);
    if (!addon) {
      throw new Error(`addon ${addonId} not installed`);
    }
    return this.targetFromDescriptor(addon.actor, "_generated_background_page.html");
  }

  async parentProcessTarget() {
    const reply = await this.request({ to: "root", type: "getProcess", id: 0 });
    const descriptor = reply.processDescriptor || reply.form;
    try {
      const target = await this.request({ to: descriptor.actor, type: "getTarget" });
      return new Target(this, target.process || target.form || target);
    } catch (error) {
      return this.targetFromDescriptor(descriptor.actor);
    }
  }
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout waiting for ${label} (${ms}ms)`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

class Target {
  constructor(client, form, watcherActor = null) {
    this.client = client;
    this.form = form;
    this.actor = form.actor;
    this.watcherActor = watcherActor;
    this.consoleActor = form.consoleActor;
    if (!this.consoleActor) {
      throw new Error(`target without consoleActor: ${JSON.stringify(form).slice(0, 200)}`);
    }
  }

  async startConsole() {
    if (this._listening) {
      return;
    }
    this._listening = true;
    if (this.watcherActor) {
      await this.client.request({
        to: this.watcherActor,
        type: "watchResources",
        resourceTypes: ["console-message", "error-message"],
      });
    } else {
      await this.client.request({ to: this.consoleActor, type: "startListeners", listeners: ["ConsoleAPI", "PageError"] });
    }
  }

  /** callback({level, text, timestamp, filename}) for console.* calls and page errors */
  onConsole(callback) {
    this.startConsole().catch(error => callback({ level: "error", text: `console listener failed: ${error.message}` }));
    const handleResource = (resourceType, resource) => {
      if (resourceType === "console-message") {
        const m = resource.message || resource;
        callback({ level: m.level, text: (m.arguments || []).map(describeGrip).join(" "), timestamp: m.timeStamp, filename: m.filename });
      } else if (resourceType === "error-message") {
        const e = resource.pageError || resource;
        callback({ level: e.warning ? "warning" : "error", text: e.errorMessage, timestamp: e.timeStamp, filename: e.sourceName });
      }
    };
    const onPacket = packet => {
      if (packet.type === "resources-available-array" && Array.isArray(packet.array)) {
        for (const [resourceType, resources] of packet.array) {
          for (const resource of resources) {
            handleResource(resourceType, resource);
          }
        }
      } else if (packet.type === "consoleAPICall" && packet.message) {
        handleResource("console-message", packet.message);
      } else if (packet.type === "pageError" && packet.pageError) {
        handleResource("error-message", packet.pageError);
      }
    };
    for (const actor of new Set([this.actor, this.consoleActor, this.watcherActor].filter(Boolean))) {
      this.client.on(`event:${actor}`, onPacket);
    }
  }

  /**
   * Evaluates `text` in the target global. Returns the result as a plain
   * value when it is a primitive, otherwise the grip.
   */
  async eval(text) {
    // evaluateJSAsync answers at once with a resultID; the value follows as
    // an "evaluationResult" event. Listen before sending to avoid a race.
    const results = new Map();
    let waiting = null;
    const listener = packet => {
      if (packet.type === "evaluationResult") {
        results.set(packet.resultID, packet);
        if (waiting && waiting.id === packet.resultID) {
          waiting.resolve(packet);
        }
      }
    };
    this.client.on(`event:${this.consoleActor}`, listener);
    try {
      const reply = await this.client.request({ to: this.consoleActor, type: "evaluateJSAsync", text });
      const id = reply.resultID;
      let result = results.get(id);
      if (!result) {
        result = await withTimeout(new Promise(resolve => { waiting = { id, resolve }; }), 30000, "evaluationResult");
      }
      if (result.exceptionMessage || result.exception) {
        throw new Error(`eval failed: ${result.exceptionMessage || describeGrip(result.exception)}`);
      }
      return unwrap(result.result);
    } finally {
      this.client.removeListener(`event:${this.consoleActor}`, listener);
    }
  }

  /**
   * Evaluates an async body (may use `await`) and returns the JSON-parsed
   * value of its last expression. Stores the result in a temporary global
   * and polls, since evaluateJSAsync does not wait for promises.
   */
  async evalAsync(body, timeoutMs = 15000) {
    const slot = `__tbrdp_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const wrapped = `globalThis.${slot} = { done: false }; (async () => { try { const value = await (async () => { ${body} })(); globalThis.${slot} = { done: true, ok: true, value: JSON.stringify(value === undefined ? null : value) }; } catch (e) { globalThis.${slot} = { done: true, ok: false, error: String(e) + (e && e.stack ? "\\n" + e.stack : "") }; } })(); null`;
    await this.eval(wrapped);
    const started = Date.now();
    for (;;) {
      const state = await this.eval(`JSON.stringify(globalThis.${slot})`);
      const parsed = JSON.parse(state);
      if (parsed.done) {
        await this.eval(`delete globalThis.${slot}`);
        if (!parsed.ok) {
          throw new Error(parsed.error);
        }
        return parsed.value === undefined ? null : JSON.parse(parsed.value);
      }
      if (Date.now() - started > timeoutMs) {
        throw new Error(`evalAsync timeout after ${timeoutMs}ms`);
      }
      await new Promise(r => setTimeout(r, 100));
    }
  }
}

function unwrap(grip) {
  if (grip === null || typeof grip !== "object") {
    return grip;
  }
  if (grip.type === "undefined") {
    return undefined;
  }
  if (grip.type === "null") {
    return null;
  }
  return grip;
}

function describeGrip(grip) {
  if (grip === null || typeof grip !== "object") {
    return String(grip);
  }
  if (grip.type === "longString") {
    return grip.initial;
  }
  if (grip.class === "Error" && grip.preview) {
    return `${grip.preview.name}: ${grip.preview.message}`;
  }
  if (grip.preview && grip.preview.ownProperties) {
    const props = Object.entries(grip.preview.ownProperties).map(([k, v]) => `${k}: ${describeGrip(v.value)}`);
    return `{${props.join(", ")}}`;
  }
  return grip.class ? `[${grip.class}]` : JSON.stringify(grip);
}

module.exports = { RdpClient, Target, describeGrip };

async function main(argv) {
  const [command, ...rest] = argv;
  const portArg = rest.length && /^\d+$/.test(rest[rest.length - 1]) ? Number(rest.pop()) : 6000;
  const rdp = await RdpClient.connect(portArg);
  try {
    switch (command) {
      case "install": {
        const addon = await rdp.installTemporaryAddon(require("node:path").resolve(rest[0]));
        console.log(`installed ${addon.id}`);
        break;
      }
      case "reload":
        await rdp.reloadAddon(rest[0]);
        console.log("reloaded");
        break;
      case "console": {
        const target = await rdp.addonTarget(rest[0]);
        target.onConsole(m => console.log(`[${m.level}] ${m.text}`));
        console.log("listening (ctrl-c to stop)");
        await new Promise(() => {});
        break;
      }
      case "eval": {
        const target = await rdp.addonTarget(rest[0]);
        console.log(JSON.stringify(await target.evalAsync(rest.slice(1).join(" ")), null, 2));
        break;
      }
      case "chrome": {
        const target = await rdp.parentProcessTarget();
        console.log(JSON.stringify(await target.evalAsync(rest.join(" ")), null, 2));
        break;
      }
      case "addons":
        console.log((await rdp.listAddons()).map(a => `${a.id}  ${a.name}`).join("\n"));
        break;
      default:
        console.error("usage: tb-rdp.js install <dir> | reload <id> | console <id> | eval <id> <js> | chrome <js> | addons  [port]");
        process.exitCode = 1;
    }
  } finally {
    if (command !== "console") {
      rdp.close();
    }
  }
}

if (require.main === module) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
