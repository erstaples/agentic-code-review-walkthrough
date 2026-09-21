"use strict";

const PROTOCOL_VERSION = 1;

async function request(lock, method, route, body) {
  const url = `http://127.0.0.1:${lock.port}${route}` + (method === "GET" ? `?protocolVersion=${PROTOCOL_VERSION}` : "");
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${lock.authToken}` },
      body: method === "GET" ? undefined : JSON.stringify({ ...body, protocolVersion: PROTOCOL_VERSION }),
    });
  } catch (err) {
    throw Object.assign(new Error(`tour bridge at port ${lock.port} did not answer: ${err.message}`), { code: "no_bridge" });
  }

  const payload = await res.json().catch(() => ({ ok: false, error: { code: "bad_request", message: `non-JSON response (HTTP ${res.status})` } }));
  if (!payload.ok) {
    const { code, message } = payload.error || {};
    throw Object.assign(new Error(message || `bridge returned HTTP ${res.status}`), { code: code || "bad_request" });
  }
  return payload;
}

module.exports = { request, PROTOCOL_VERSION };
