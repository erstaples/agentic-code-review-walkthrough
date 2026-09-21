const { test } = require("node:test");
const assert = require("node:assert");
const { startServer } = require("../lib/httpserver.js");

const TOKEN = "secret-token";

async function withServer(handlers, fn) {
  const server = await startServer({ handlers, authToken: TOKEN, protocolVersion: 1 });
  try {
    await fn(`http://127.0.0.1:${server.port}`, server);
  } finally {
    await server.close();
  }
}

const post = (base, path, body, headers = {}) =>
  fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}`, ...headers },
    body: JSON.stringify({ protocolVersion: 1, ...body }),
  });

test("binds loopback only", async () => {
  await withServer({}, async (_base, server) => {
    assert.strictEqual(server.address, "127.0.0.1");
  });
});

test("routes a GET to its handler and wraps the result in ok:true", async () => {
  await withServer({ "GET /status": async () => ({ extensionVersion: "0.1.0" }) }, async (base) => {
    const res = await fetch(`${base}/status?protocolVersion=1`, { headers: { authorization: `Bearer ${TOKEN}` } });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { ok: true, extensionVersion: "0.1.0" });
  });
});

test("routes a POST body to its handler", async () => {
  await withServer({ "POST /focus": async (body) => ({ got: body.path }) }, async (base) => {
    const res = await post(base, "/focus", { path: "a.go" });
    assert.deepStrictEqual(await res.json(), { ok: true, got: "a.go" });
  });
});

test("a missing or wrong bearer token is unauthorized", async () => {
  await withServer({ "GET /status": async () => ({}) }, async (base) => {
    const bare = await fetch(`${base}/status?protocolVersion=1`);
    assert.strictEqual(bare.status, 401);
    assert.strictEqual((await bare.json()).error.code, "unauthorized");

    const wrong = await fetch(`${base}/status?protocolVersion=1`, { headers: { authorization: "Bearer nope" } });
    assert.strictEqual(wrong.status, 401);
  });
});

test("a request carrying an Origin header is rejected", async () => {
  await withServer({ "GET /status": async () => ({}) }, async (base) => {
    const res = await fetch(`${base}/status?protocolVersion=1`, {
      headers: { authorization: `Bearer ${TOKEN}`, origin: "https://evil.example" },
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual((await res.json()).error.code, "unauthorized");
  });
});

test("a protocol version mismatch is rejected before the handler runs", async () => {
  let called = false;
  await withServer({ "POST /focus": async () => { called = true; return {}; } }, async (base) => {
    const res = await fetch(`${base}/focus`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ protocolVersion: 99 }),
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).error.code, "protocol_mismatch");
    assert.strictEqual(called, false);
  });
});

test("an unknown route is bad_request", async () => {
  await withServer({}, async (base) => {
    assert.strictEqual((await post(base, "/nope", {})).status, 400);
  });
});

test("a handler error carrying a code becomes that error code", async () => {
  const boom = Object.assign(new Error("gone"), { code: "file_not_found" });
  await withServer({ "POST /focus": async () => { throw boom; } }, async (base) => {
    const res = await post(base, "/focus", {});
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.error.code, "file_not_found");
    assert.strictEqual(body.error.message, "gone");
  });
});

test("an unexpected handler error does not leak as a crash", async () => {
  await withServer({ "POST /focus": async () => { throw new Error("kaboom"); } }, async (base) => {
    const res = await post(base, "/focus", {});
    assert.strictEqual(res.status, 500);
    assert.strictEqual((await res.json()).error.code, "bad_request");
  });
});

test("recognised error codes come from the shared contract, not a local copy", async () => {
  const { ERROR_CODES } = require("../lib/contract.js");
  for (const code of ERROR_CODES) {
    const err = Object.assign(new Error(`synthetic ${code}`), { code });
    await withServer({ "POST /focus": async () => { throw err; } }, async (base) => {
      const body = await (await post(base, "/focus", {})).json();
      assert.strictEqual(body.error.code, code, `${code} was not passed through`);
    });
  }
});

test("a request body over 1 MiB is rejected with a proper error response, not connection reset", async () => {
  await withServer({ "POST /upload": async () => ({}) }, async (base) => {
    const oversized = Buffer.alloc(1024 * 1024 + 1, "x").toString();
    const res = await fetch(`${base}/upload`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
      body: oversized,
    });
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.error.code, "bad_request");
  });
});
