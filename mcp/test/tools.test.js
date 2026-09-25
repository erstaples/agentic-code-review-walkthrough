"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { TOOLS, createCallTool } = require("../lib/tools.js");

test("the public tools use the complete-tour workflow", () => {
  assert.deepEqual(TOOLS.map(t => t.name).sort(), ["kanko_map_apply", "kanko_map_check", "kanko_map_delete", "kanko_map_get", "kanko_map_open", "kanko_map_receipt", "kanko_map_refresh", "kanko_tour_load", "kanko_tour_navigate", "kanko_tour_set_state", "kanko_tour_clear", "kanko_tour_status"].sort());
  for (const tool of TOOLS) { assert.ok(tool.description); assert.ok(tool.inputSchema.required.includes("workspace")); }
});
test("invalid authored tours never discover or contact an editor", async () => {
  let discovered = false;
  const call = createCallTool({ resolveLock: () => { discovered = true; }, mapService: { loadTour: () => { throw Object.assign(new Error("invalid"), { code: "invalid_tour_plan", details: { findings: [{ code: "missing_anchor" }] } }); } } });
  await assert.rejects(call("kanko_tour_load", { workspace: "/repo", mapId: "x" }), e => e.details.findings[0].code === "missing_anchor");
  assert.equal(discovered, false);
});
test("retired stop/focus tools are rejected", async () => {
  const call = createCallTool({ resolveLock: () => { throw new Error("should not discover"); } });
  for (const name of ["tour_stop", "tour_focus"]) await assert.rejects(call(name, {}), /unknown tool/);
});
