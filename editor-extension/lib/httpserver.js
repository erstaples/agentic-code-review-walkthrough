"use strict";

const http = require("node:http");
const crypto = require("node:crypto");
const { ERROR_CODES } = require("./contract.js");

const KNOWN_CODES = new Set(ERROR_CODES);

const STATUS_FOR = { unauthorized: 401, protocol_mismatch: 400 };

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

const sendError = (res, status, code, message, details) => send(res, status, { ok: false, error: { code, message, ...(details === undefined ? {} : { details }) } });

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    let limitExceeded = false;
    req.on("data", (c) => {
      size += c.length;
      // A tour payload is kilobytes. Anything larger is a bug or an attack.
      if (size > 1024 * 1024) { limitExceeded = true; return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (limitExceeded) return reject(Object.assign(new Error("request too large"), { code: "bad_request" }));
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

      const expectedToken = `Bearer ${authToken}`;
      const receivedAuth = req.headers.authorization || "";
      const expectedHash = crypto.createHash("sha256").update(expectedToken).digest();
      const receivedHash = crypto.createHash("sha256").update(receivedAuth).digest();
      let authValid = false;
      try {
        authValid = crypto.timingSafeEqual(expectedHash, receivedHash);
      } catch {
        authValid = false;
      }
      if (!authValid) {
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
      sendError(res, status, code, String(err && err.message ? err.message : err), err?.details);
    }
  });

  const sockets = new Set();
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.once("close", () => sockets.delete(socket));
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      // An idle tour server must not keep its host process alive; in-flight
      // requests still hold the loop open through their accepted sockets.
      server.unref();
      const addr = server.address();
      resolve({
        port: addr.port,
        address: addr.address,
        close: () =>
          new Promise((done) => {
            // close() alone waits forever on a client holding a half-sent request.
            server.close(() => done());
            for (const socket of sockets) socket.destroy();
          }),
      });
    });
  });
}

module.exports = { startServer };
