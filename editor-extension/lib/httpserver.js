"use strict";

const http = require("node:http");
const { ERROR_CODES } = require("./contract.js");

const KNOWN_CODES = new Set(ERROR_CODES);

const STATUS_FOR = { unauthorized: 401, protocol_mismatch: 400 };

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

const sendError = (res, status, code, message) => send(res, status, { ok: false, error: { code, message } });

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      // A tour payload is kilobytes. Anything larger is a bug or an attack.
      if (size > 1024 * 1024) { reject(Object.assign(new Error("request too large"), { code: "bad_request" })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(Object.assign(new Error("body is not valid JSON"), { code: "bad_request" })); }
    });
    req.on("error", reject);
  });
}

function startServer({ handlers, authToken, protocolVersion }) {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers.origin !== undefined) {
        return sendError(res, 403, "unauthorized", "browser-originated requests are not accepted");
      }
      if (req.headers.authorization !== `Bearer ${authToken}`) {
        return sendError(res, 401, "unauthorized", "missing or invalid bearer token");
      }

      const url = new URL(req.url, "http://127.0.0.1");
      const body = req.method === "GET" ? {} : await readBody(req);
      const claimed = req.method === "GET" ? Number(url.searchParams.get("protocolVersion")) : body.protocolVersion;
      if (claimed !== protocolVersion) {
        return sendError(res, 400, "protocol_mismatch",
          `extension speaks protocol ${protocolVersion}, caller sent ${claimed === undefined || Number.isNaN(claimed) ? "nothing" : claimed}`);
      }

      const handler = handlers[`${req.method} ${url.pathname}`];
      if (!handler) return sendError(res, 400, "bad_request", `no such endpoint: ${req.method} ${url.pathname}`);

      send(res, 200, { ok: true, ...(await handler(body, url.searchParams)) });
    } catch (err) {
      const code = err && KNOWN_CODES.has(err.code) ? err.code : "bad_request";
      const status = STATUS_FOR[code] || (code === "bad_request" && !(err && KNOWN_CODES.has(err.code)) ? 500 : 400);
      sendError(res, status, code, String(err && err.message ? err.message : err));
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({
        port: addr.port,
        address: addr.address,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

module.exports = { startServer };
