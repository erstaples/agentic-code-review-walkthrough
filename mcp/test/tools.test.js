const { test } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const { TOOLS, createCallTool } = require("../lib/tools.js");

function stubBridge(routes) {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      const [status, payload] = routes[`${req.method} ${req.url.split("?")[0]}`] || [400, { ok: false, error: { code: "bad_request", message: "no route" } }];
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ port: server.address().port, seen, close: () => server.close() }))
  );
}

test("the declared tools match the documented surface", () => {
  assert.deepStrictEqual(TOOLS.map((t) => t.name).sort(), ["tour_clear", "tour_focus", "tour_status", "tour_stop"]);
  for (const tool of TOOLS) {
    assert.ok(tool.description, `${tool.name} has no description`);
    assert.strictEqual(tool.inputSchema.type, "object");
  }
});

test("tour_status GETs /status with the lock's bearer token", async () => {
  const b = await stubBridge({ "GET /status": [200, { ok: true, extensionVersion: "0.1.0" }] });
  let resolvedWorkspace;
  const callTool = createCallTool({ resolveLock: (workspace) => {
    resolvedWorkspace = workspace;
    return { port: b.port, authToken: "tok" };
  } });
  assert.deepStrictEqual(await callTool("tour_status", { workspace: "/repo" }), { ok: true, extensionVersion: "0.1.0" });
  assert.strictEqual(resolvedWorkspace, "/repo");
  assert.strictEqual(b.seen[0].auth, "Bearer tok");
  assert.match(b.seen[0].url, /protocolVersion=1/);
  b.close();
});

test("tour_stop POSTs its arguments with the protocol version attached", async () => {
  const b = await stubBridge({ "POST /stop": [200, { ok: true, opened: ["a.go"], deferred: [] }] });
  const callTool = createCallTool({ resolveLock: () => ({ port: b.port, authToken: "tok" }) });
  const args = { workspace: "/repo", stopId: "s1", label: "L", type: "implementation", mode: "file", files: [{ path: "a.go", ranges: [{ side: "working", startLine: 1, endLine: 2 }] }] };
  await callTool("tour_stop", args);
  assert.strictEqual(b.seen[0].body.protocolVersion, 1);
  assert.strictEqual(b.seen[0].body.stopId, "s1");
  assert.strictEqual(b.seen[0].body.workspace, undefined);
  b.close();
});

test("a bridge error becomes a thrown error carrying the code", async () => {
  const b = await stubBridge({ "POST /focus": [400, { ok: false, error: { code: "range_out_of_bounds", message: "too far" } }] });
  const callTool = createCallTool({ resolveLock: () => ({ port: b.port, authToken: "tok" }) });
  await assert.rejects(
    () => callTool("tour_focus", { path: "a.go", side: "working", startLine: 9, endLine: 9 }),
    (err) => err.code === "range_out_of_bounds" && err.message === "too far"
  );
  b.close();
});

test("a discovery failure surfaces its guidance verbatim", async () => {
  const callTool = createCallTool({
    resolveLock: () => { throw Object.assign(new Error("no tour bridge is listening for /repo"), { code: "no_bridge" }); },
  });
  await assert.rejects(() => callTool("tour_status", {}), /no tour bridge is listening/);
});

test("an unknown tool name is rejected", async () => {
  const callTool = createCallTool({ resolveLock: () => ({ port: 1, authToken: "t" }) });
  await assert.rejects(() => callTool("tour_nope", {}), /unknown tool/);
});

test("caller-supplied protocolVersion in args does not override the enforced constant", async () => {
  const b = await stubBridge({ "POST /stop": [200, { ok: true, opened: ["a.go"], deferred: [] }] });
  const callTool = createCallTool({ resolveLock: () => ({ port: b.port, authToken: "tok" }) });
  const args = { stopId: "s1", label: "L", type: "implementation", mode: "file", files: [], protocolVersion: 999 };
  await callTool("tour_stop", args);
  assert.strictEqual(b.seen[0].body.protocolVersion, 1, "protocolVersion must be 1, not 999");
  b.close();
});

test("every phase-1 tool consumes its contract response fixtures", async () => {
  const fixtures = require("../../contract/fixtures.json");
  const { ROUTES } = require("../../contract/protocol.js");
  for (const name of ["tour_status", "tour_stop", "tour_focus", "tour_clear"]) {
    for (const response of fixtures[name].responses) {
      const route = ROUTES[name];
      const b = await stubBridge({ [`${route.method} ${route.path}`]: [response.ok ? 200 : 400, response] });
      const callTool = createCallTool({ resolveLock: () => ({ port: b.port, authToken: "tok" }) });
      const args = fixtures[name].requests[0].body;
      if (response.ok) {
        assert.deepStrictEqual(await callTool(name, args), response, `${name} mangled an ok response`);
      } else {
        await assert.rejects(
          () => callTool(name, args),
          (err) => err.code === response.error.code && err.message === response.error.message,
          `${name} did not surface ${response.error.code} with its message intact`
        );
      }
      b.close();
    }
  }
});

test("tour_stop accepts both modes and requires pinned refs", () => {
  const stop = TOOLS.find((t) => t.name === "tour_stop");
  assert.deepStrictEqual(stop.inputSchema.properties.mode.enum, ["file", "diff"]);
  for (const key of ["base", "head"]) {
    assert.deepStrictEqual(stop.inputSchema.properties[key].required, ["sha", "name"]);
  }
  assert.ok(stop.inputSchema.required.includes("base"));
  assert.ok(stop.inputSchema.required.includes("head"));
});

test("every tool requires an explicit workspace", () => {
  for (const tool of TOOLS) {
    assert.ok(tool.inputSchema.required.includes("workspace"), `${tool.name} does not require workspace`);
    assert.strictEqual(tool.inputSchema.properties.workspace.type, "string");
  }
});

test("the diff-mode fixture round-trips through tour_stop", async () => {
  const fixtures = require("../../contract/fixtures.json");
  const diffRequest = fixtures.tour_stop.requests.find((r) => r.body.mode === "diff");
  assert.ok(diffRequest, "contract has no diff-mode request fixture");
  const b = await stubBridge({ "POST /stop": [200, { ok: true, opened: ["internal/client/do.go"], deferred: [] }] });
  const callTool = createCallTool({ resolveLock: () => ({ port: b.port, authToken: "tok" }) });
  const { protocolVersion, ...args } = diffRequest.body;
  await callTool("tour_stop", args);
  assert.strictEqual(b.seen[0].body.base.sha, diffRequest.body.base.sha);
  assert.strictEqual(b.seen[0].body.head.sha, diffRequest.body.head.sha);
  b.close();
});
