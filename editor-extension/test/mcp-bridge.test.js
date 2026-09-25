"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createCallTool } = require("../../mcp/lib/tools.js");
const { startServer } = require("./compiled.js")("src/host/httpserver.js");

test("load validates the authored review map before sending it to the extension", async (t) => {
  const seen = [], payload = { workspace: "/repo", tourId: "map", plan: { presentationVersion: 2 } };
  const server = await startServer({ authToken: "test", protocolVersion: 3, handlers: {
    "POST /tour/load": async body => { seen.push(body); return { snapshot: { loaded: true }, findings: [] }; },
  } }); t.after(() => server.close());
  const call = createCallTool({ resolveLock: workspace => { assert.equal(workspace, "/repo"); return { port: server.port, authToken: "test" }; }, mapService: { loadTour: args => { assert.equal(args.mapId, "map"); return payload; } } });
  assert.equal((await call("kanko_tour_load", { workspace: "/repo", mapId: "map" })).snapshot.loaded, true);
  assert.deepEqual(seen, [{ ...payload, protocolVersion: 3 }]);
});
test("navigation and presentation state go through the authenticated bridge", async (t) => {
  const seen = [];
  const handlers = Object.fromEntries(["/tour/navigate", "/tour/state", "/clear"].map(route => [`POST ${route}`, async body => { seen.push([route, body]); return { snapshot: { revision: seen.length } }; }]));
  handlers["GET /status"] = async () => ({ snapshot: { revision: seen.length } });
  const server = await startServer({ authToken: "test", protocolVersion: 3, handlers }); t.after(() => server.close());
  const call = createCallTool({ resolveLock: () => ({ port: server.port, authToken: "test" }) });
  await call("kanko_tour_navigate", { workspace: "/repo", action: "nextBeat", protocolVersion: 999 });
  await call("kanko_tour_set_state", { workspace: "/repo", mode: "exploring" });
  await call("kanko_tour_clear", { workspace: "/repo" });
  assert.equal(seen[0][1].protocolVersion, 3); assert.equal(seen[0][1].workspace, "/repo");
  assert.equal((await call("kanko_tour_status", { workspace: "/repo" })).snapshot.revision, 3);
});
test("extension findings survive HTTP and MCP error propagation", async (t) => {
  const details = { findings: [{ code: "content_mismatch", location: "stops[0].anchors[0]" }] };
  const server = await startServer({ authToken: "test", protocolVersion: 3, handlers: { "POST /tour/navigate": () => { throw Object.assign(new Error("Fix anchor"), { code: "invalid_tour_plan", details }); } } }); t.after(() => server.close());
  const call = createCallTool({ resolveLock: () => ({ port: server.port, authToken: "test" }) });
  await assert.rejects(call("kanko_tour_navigate", { workspace: "/repo", action: "nextBeat" }), e => e.code === "invalid_tour_plan" && JSON.stringify(e.details) === JSON.stringify(details));
});