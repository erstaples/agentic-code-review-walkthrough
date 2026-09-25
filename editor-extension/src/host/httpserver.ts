import type { Socket } from "node:net";
import type { ErrorCode } from "../shared/tour.js";
import { isRecord, errorMessage, errorDetails } from "./requests.js";
interface ServerOptions {
  handlers: Record<
    string,
    (body: unknown, query: URLSearchParams) => Promise<object> | object
  >;
  authToken: string;
  protocolVersion: number;
}
export interface ServerHandle {
  port: number;
  address: string;
  close(): Promise<void>;
}
function isErrorCode(value: string): value is ErrorCode {
  return KNOWN_CODES.has(value);
}

import * as http from "node:http";
import * as crypto from "node:crypto";
import { ERROR_CODES } from "../../lib/contract.js";

const KNOWN_CODES: ReadonlySet<string> = new Set(ERROR_CODES);

const STATUS_FOR: Partial<Record<ErrorCode, number>> = {
  unauthorized: 401,
  protocol_mismatch: 400,
};

function send(res: http.ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

const sendError = (
  res: http.ServerResponse,
  status: number,
  code: ErrorCode,
  message: string,
  details?: unknown,
) =>
  send(res, status, {
    ok: false,
    error: { code, message, ...(details === undefined ? {} : { details }) },
  });

function readBody(req: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let limitExceeded = false;
    req.on("data", (c) => {
      size += c.length;
      // A tour payload is kilobytes. Anything larger is a bug or an attack.
      if (size > 1024 * 1024) {
        limitExceeded = true;
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (limitExceeded)
        return reject(
          Object.assign(new Error("request too large"), {
            code: "bad_request",
          }),
        );
      if (chunks.length === 0) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(
          Object.assign(new Error("body is not valid JSON"), {
            code: "bad_request",
          }),
        );
      }
    });
    req.on("error", reject);
  });
}

function startServer({
  handlers,
  authToken,
  protocolVersion,
}: ServerOptions): Promise<ServerHandle> {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers.origin !== undefined) {
        return sendError(
          res,
          403,
          "unauthorized",
          "browser-originated requests are not accepted",
        );
      }

      const expectedToken = `Bearer ${authToken}`;
      const receivedAuth = req.headers.authorization || "";
      const expectedHash = crypto
        .createHash("sha256")
        .update(expectedToken)
        .digest();
      const receivedHash = crypto
        .createHash("sha256")
        .update(receivedAuth)
        .digest();
      let authValid = false;
      try {
        authValid = crypto.timingSafeEqual(expectedHash, receivedHash);
      } catch {
        authValid = false;
      }
      if (!authValid) {
        return sendError(
          res,
          401,
          "unauthorized",
          "missing or invalid bearer token",
        );
      }

      const url = new URL(req.url || "/", "http://127.0.0.1");
      const body = req.method === "GET" ? {} : await readBody(req);
      const claimed =
        req.method === "GET"
          ? Number(url.searchParams.get("protocolVersion"))
          : isRecord(body)
            ? body.protocolVersion
            : undefined;
      if (claimed !== protocolVersion) {
        return sendError(
          res,
          400,
          "protocol_mismatch",
          `extension speaks protocol ${protocolVersion}, caller sent ${claimed === undefined || Number.isNaN(claimed) ? "nothing" : claimed}`,
        );
      }

      const handler = handlers[`${req.method} ${url.pathname}`];
      if (!handler)
        return sendError(
          res,
          400,
          "bad_request",
          `no such endpoint: ${req.method} ${url.pathname}`,
        );

      send(res, 200, { ok: true, ...(await handler(body, url.searchParams)) });
    } catch (err) {
      const known =
        isRecord(err) && typeof err.code === "string" && isErrorCode(err.code);
      const code =
        isRecord(err) && typeof err.code === "string" && isErrorCode(err.code)
          ? err.code
          : "bad_request";
      const status =
        STATUS_FOR[code] || (code === "bad_request" && !known ? 500 : 400);
      sendError(res, status, code, errorMessage(err), errorDetails(err));
    }
  });

  const sockets = new Set<Socket>();
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
      if (!addr || typeof addr === "string")
        return reject(new Error("Server did not bind a TCP port."));
      resolve({
        port: addr.port,
        address: addr.address,
        close: () =>
          new Promise<void>((done) => {
            // close() alone waits forever on a client holding a half-sent request.
            server.close(() => done());
            for (const socket of sockets) socket.destroy();
          }),
      });
    });
  });
}

export { startServer };
