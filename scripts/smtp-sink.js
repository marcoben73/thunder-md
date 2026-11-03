/*
 * Minimal SMTP sink for tests: accepts every message and hands the DATA
 * section to a callback. No auth, no TLS.
 *
 *   const { startSmtpSink } = require("./smtp-sink.js");
 *   const sink = await startSmtpSink(2525);
 *   ... sink.messages (array of raw DATA strings) ...
 *   await sink.close();
 */
"use strict";

const net = require("node:net");

function startSmtpSink(port = 2525, host = "127.0.0.1") {
  const messages = [];
  const server = net.createServer(socket => {
    let buffer = "";
    let inData = false;
    let data = "";
    const send = line => socket.write(`${line}\r\n`);
    send("220 smtp-sink ready");
    socket.on("data", chunk => {
      buffer += chunk.toString("utf8");
      let index;
      while ((index = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 2);
        if (inData) {
          if (line === ".") {
            inData = false;
            messages.push(data.replace(/^\.\./gm, "."));
            data = "";
            send("250 2.0.0 queued");
          } else {
            data += `${line}\r\n`;
          }
          continue;
        }
        const verb = line.split(" ")[0].toUpperCase();
        if (verb === "EHLO") {
          socket.write("250-smtp-sink\r\n250-8BITMIME\r\n250 SIZE 52428800\r\n");
        } else if (verb === "HELO") {
          send("250 smtp-sink");
        } else if (verb === "DATA") {
          inData = true;
          send("354 go ahead");
        } else if (verb === "QUIT") {
          send("221 bye");
          socket.end();
        } else {
          send("250 ok");
        }
      }
    });
    socket.on("error", () => {});
  });
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => {
      resolve({
        messages,
        close: () => new Promise(r => server.close(r)),
      });
    });
  });
}

/** Decodes quoted-printable text (enough for test assertions). */
function decodeQuotedPrintable(text) {
  return text
    .replace(/=\r?\n/g, "")
    .replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

module.exports = { startSmtpSink, decodeQuotedPrintable };
