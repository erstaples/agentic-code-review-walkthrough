// Generated from TypeScript. Run npm run runtime:build in editor-extension.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROTOCOL_VERSION = void 0;
exports.request = request;
const input_js_1 = require("./input.js");
const protocol_js_1 = require("../../shared/protocol.js");
Object.defineProperty(exports, "PROTOCOL_VERSION", {
  enumerable: true,
  get: function () {
    return protocol_js_1.PROTOCOL_VERSION;
  },
});
async function request(lock, method, route, body) {
  const url =
    `http://127.0.0.1:${lock.port}${route}` +
    (method === "GET"
      ? `?protocolVersion=${protocol_js_1.PROTOCOL_VERSION}`
      : "");
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${lock.authToken}`,
      },
      body:
        method === "GET"
          ? undefined
          : JSON.stringify({
              ...body,
              protocolVersion: protocol_js_1.PROTOCOL_VERSION,
            }),
    });
  } catch (error) {
    throw Object.assign(
      new Error(
        `tour bridge at port ${lock.port} did not answer: ${(0, input_js_1.errorFields)(error).message}`,
      ),
      { code: "no_bridge" },
    );
  }
  const payload = await response.json().catch(() => ({
    ok: false,
    error: {
      code: "bad_request",
      message: `non-JSON response (HTTP ${response.status})`,
    },
  }));
  if (!(0, input_js_1.isRecord)(payload))
    throw Object.assign(
      new Error(`non-JSON response (HTTP ${response.status})`),
      { code: "bad_request" },
    );
  if (!payload.ok) {
    const { code, message, details } = (0, input_js_1.errorFields)(
      payload.error,
    );
    throw Object.assign(
      new Error(
        ((0, input_js_1.isRecord)(payload.error) &&
          typeof payload.error.message === "string" &&
          payload.error.message) ||
          `bridge returned HTTP ${response.status}`,
      ),
      {
        code: code || "bad_request",
        ...(details === undefined ? {} : { details }),
      },
    );
  }
  return payload;
}
