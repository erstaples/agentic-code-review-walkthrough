"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { TOOLS, createCallTool } = require("../lib/tools.js");
const { startServer } = require("../../editor-extension/lib/httpserver.js");

test("the public tools use the complete-tour workflow", () => {
  assert.deepEqual(TOOLS.map(t => t.name).sort(), ["kanko_notes_apply", "kanko_notes_check", "kanko_notes_delete", "kanko_notes_get", "kanko_notes_open", "kanko_notes_receipt", "kanko_notes_refresh", "kanko_tour_load", "kanko_tour_navigate", "kanko_tour_set_state", "kanko_tour_clear", "kanko_tour_status"].sort());
  for (const tool of TOOLS) { assert.ok(tool.description); assert.ok(tool.inputSchema.required.includes("workspace")); }
});
test("load validates the authored record before sending it to the extension", async (t) => {
  const seen = [], payload = { workspace: "/repo", tourId: "record", plan: { presentationVersion: 2 } };
  const server = await startServer({ authToken: "test", protocolVersion: 3, handlers: {
    "POST /tour/load": async body => { seen.push(body); return { snapshot: { loaded: true }, findings: [] }; },
  } }); t.after(() => server.close());
  const call = createCallTool({ resolveLock: workspace => { assert.equal(workspace, "/repo"); return { port: server.port, authToken: "test" }; }, recordService: { loadTour: args => { assert.equal(args.recordId, "record"); return payload; } } });
  assert.equal((await call("kanko_tour_load", { workspace: "/repo", recordId: "record" })).snapshot.loaded, true);
  assert.deepEqual(seen, [{ ...payload, protocolVersion: 3 }]);
});
test("invalid authored tours never discover or contact an editor", async () => {
  let discovered = false;
  const call = createCallTool({ resolveLock: () => { discovered = true; }, recordService: { loadTour: () => { throw Object.assign(new Error("invalid"), { code: "invalid_tour_plan", details: { findings: [{ code: "missing_anchor" }] } }); } } });
  await assert.rejects(call("kanko_tour_load", { workspace: "/repo", recordId: "x" }), e => e.details.findings[0].code === "missing_anchor");
  assert.equal(discovered, false);
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
test("retired stop/focus tools are rejected", async () => {
  const call = createCallTool({ resolveLock: () => { throw new Error("should not discover"); } });
  for (const name of ["tour_stop", "tour_focus"]) await assert.rejects(call(name, {}), /unknown tool/);
});
