import { errorFields, isRecord } from "./input.js";
import type { BridgeLock } from "./discovery.js";

import { PROTOCOL_VERSION } from "../../shared/protocol.js";

async function request(
  lock: Pick<BridgeLock, "port" | "authToken">,
  method: string,
  route: string,
  body: Record<string, unknown>,
) {
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
        `tour bridge at port ${lock.port} did not answer: ${errorFields(error).message}`,
      ),
      { code: "no_bridge" },
    );
  }

  const payload: unknown = await response.json().catch(() => ({
    ok: false,
    error: {
      code: "bad_request",
      message: `non-JSON response (HTTP ${response.status})`,
    },
  }));
  if (!isRecord(payload))
    throw Object.assign(
      new Error(`non-JSON response (HTTP ${response.status})`),
      { code: "bad_request" },
    );
  if (!payload.ok) {
    const { code, message, details } = errorFields(payload.error);
    throw Object.assign(
      new Error(
        (isRecord(payload.error) &&
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

export { request, PROTOCOL_VERSION };
