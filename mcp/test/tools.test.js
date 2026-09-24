"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { TOOLS, createCallTool } = require("../lib/tools.js");
const { startServer } = require("../../editor-extension/lib/httpserver.js");

test("the public tools use the complete-tour workflow", () => {
  assert.deepEqual(TOOLS.map(t => t.name).sort(), ["dossier_apply", "dossier_check", "dossier_delete", "dossier_get", "dossier_open", "dossier_receipt", "dossier_refresh", "relay_load_tour", "relay_navigate", "relay_set_state", "tour_clear", "tour_status"]);
  for (const tool of TOOLS) { assert.ok(tool.description); assert.ok(tool.inputSchema.required.includes("workspace")); }
});
test("load validates the authored dossier before sending it to the extension", async (t) => {
  const seen = [], payload = { workspace: "/repo", tourId: "dossier", plan: { presentationVersion: 2 } };
  const server = await startServer({ authToken: "test", protocolVersion: 2, handlers: {
    "POST /tour/load": async body => { seen.push(body); return { snapshot: { loaded: true }, findings: [] }; },
  } }); t.after(() => server.close());
  const call = createCallTool({ resolveLock: workspace => { assert.equal(workspace, "/repo"); return { port: server.port, authToken: "test" }; }, dossierService: { loadTour: args => { assert.equal(args.dossierId, "dossier"); return payload; } } });
  assert.equal((await call("relay_load_tour", { workspace: "/repo", dossierId: "dossier" })).snapshot.loaded, true);
  assert.deepEqual(seen, [{ ...payload, protocolVersion: 2 }]);
});
test("invalid authored tours never discover or contact an editor", async () => {
  let discovered = false;
  const call = createCallTool({ resolveLock: () => { discovered = true; }, dossierService: { loadTour: () => { throw Object.assign(new Error("invalid"), { code: "invalid_tour_plan", details: { findings: [{ code: "missing_anchor" }] } }); } } });
  await assert.rejects(call("relay_load_tour", { workspace: "/repo", dossierId: "x" }), e => e.details.findings[0].code === "missing_anchor");
  assert.equal(discovered, false);
});
test("navigation and presentation state go through the authenticated bridge", async (t) => {
  const seen = [];
  const handlers = Object.fromEntries(["/tour/navigate", "/tour/state", "/clear"].map(route => [`POST ${route}`, async body => { seen.push([route, body]); return { snapshot: { revision: seen.length } }; }]));
  handlers["GET /status"] = async () => ({ snapshot: { revision: seen.length } });
  const server = await startServer({ authToken: "test", protocolVersion: 2, handlers }); t.after(() => server.close());
  const call = createCallTool({ resolveLock: () => ({ port: server.port, authToken: "test" }) });
  await call("relay_navigate", { workspace: "/repo", action: "nextBeat", protocolVersion: 999 });
  await call("relay_set_state", { workspace: "/repo", mode: "exploring" });
  await call("tour_clear", { workspace: "/repo" });
  assert.equal(seen[0][1].protocolVersion, 2); assert.equal(seen[0][1].workspace, "/repo");
  assert.equal((await call("tour_status", { workspace: "/repo" })).snapshot.revision, 3);
});
test("extension findings survive HTTP and MCP error propagation", async (t) => {
  const details = { findings: [{ code: "content_mismatch", location: "stops[0].anchors[0]" }] };
  const server = await startServer({ authToken: "test", protocolVersion: 2, handlers: { "POST /tour/navigate": () => { throw Object.assign(new Error("Fix anchor"), { code: "invalid_tour_plan", details }); } } }); t.after(() => server.close());
  const call = createCallTool({ resolveLock: () => ({ port: server.port, authToken: "test" }) });
  await assert.rejects(call("relay_navigate", { workspace: "/repo", action: "nextBeat" }), e => e.code === "invalid_tour_plan" && JSON.stringify(e.details) === JSON.stringify(details));
});
test("retired stop/focus tools are rejected", async () => {
  const call = createCallTool({ resolveLock: () => { throw new Error("should not discover"); } });
  for (const name of ["tour_stop", "tour_focus"]) await assert.rejects(call(name, {}), /unknown tool/);
});
