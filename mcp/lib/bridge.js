"use strict";

const { PROTOCOL_VERSION } = require("../../generated/shared/protocol.js");

async function request(lock, method, route, body) {
  const url =
    `http://127.0.0.1:${lock.port}${route}` +
    (method === "GET" ? `?protocolVersion=${PROTOCOL_VERSION}` : "");
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
          : JSON.stringify({ ...body, protocolVersion: PROTOCOL_VERSION }),
    });
  } catch (error) {
    throw Object.assign(
      new Error(
        `tour bridge at port ${lock.port} did not answer: ${error.message}`,
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
  if (!payload.ok) {
    const { code, message, details } = payload.error || {};
    throw Object.assign(
      new Error(message || `bridge returned HTTP ${response.status}`),
      {
        code: code || "bad_request",
        ...(details === undefined ? {} : { details }),
      },
    );
  }
  return payload;
}

module.exports = { request, PROTOCOL_VERSION };
