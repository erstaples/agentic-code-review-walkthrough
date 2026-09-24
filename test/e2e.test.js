"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { listScenarios, loadScenario, runScenario, render, lookup, validateSchema } = require("../e2e/lib/scenario.js");

function describeFailure(result) {
  if (!result.failure) return "";
  const { index, id, call, errors } = result.failure;
  return `step ${index + 1}${id ? ` #${id}` : ""} ${call || ""}: ${errors.join("; ")}`;
}

for (const file of listScenarios()) {
  const scenario = loadScenario(file);
  const name = path.basename(file, ".json");

  test(`scenario ${name} completes against the headless editor`, async () => {
    const result = await runScenario(scenario, { editor: "headless" });
    assert.ok(result.passed, describeFailure(result));
    if (scenario.steps.some((s) => s.call === "tour_stop")) {
      assert.ok(result.editorEvents.some((e) => e.kind === "stop"), "no stop reached the editor");
    }
  });

  test(`scenario ${name} completes as a text tour without an editor`, async () => {
    const result = await runScenario(scenario, { editor: "none" });
    assert.ok(result.passed, describeFailure(result));
  });
}

const tiny = (steps) => ({ name: "inline", repo: { base: { "a.txt": ["one", "two"] } }, steps });

test("a wrong expectation fails the run at that step", async () => {
  const result = await runScenario(tiny([
    { call: "tour_status", args: { workspace: "{{ repo.workspace }}" }, match: { workspaceFolders: ["/not/this/one"] } },
    { call: "tour_clear", args: { workspace: "{{ repo.workspace }}" } },
  ]));
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.failure.index, 0);
  assert.match(result.failure.errors[0], /workspaceFolders\[0\]: expected "\/not\/this\/one"/);
  assert.strictEqual(result.outcomes.length, 1, "later steps must not run after a failure");
});

test("an unexpected tool error fails the run", async () => {
  const result = await runScenario(tiny([
    { call: "tour_focus", args: { workspace: "{{ repo.workspace }}", path: "a.txt", side: "working", startLine: 9, endLine: 9 } },
  ]));
  assert.strictEqual(result.passed, false);
  assert.match(result.failure.errors[0], /unexpected error range_out_of_bounds/);
});

test("arguments that drift from the advertised schema are caught before the call", async () => {
  const result = await runScenario(tiny([
    { call: "tour_stop", args: { workspace: "{{ repo.workspace }}", stopId: "s", label: "L", type: "sideways", base: { sha: "x", name: "x" }, head: { sha: "y", name: "y" }, files: [] } },
  ]));
  assert.strictEqual(result.passed, false);
  assert.strictEqual(result.failure.result, undefined, "the server must not be called with invalid arguments");
  assert.ok(result.failure.errors.some((e) => /\$\.mode: required/.test(e)), result.failure.errors.join("\n"));
  assert.ok(result.failure.errors.some((e) => /\$\.type: "sideways" is not one of/.test(e)), result.failure.errors.join("\n"));
});

test("a tool the server no longer advertises fails the run", async () => {
  const result = await runScenario(tiny([{ call: "tour_teleport", args: {} }]));
  assert.strictEqual(result.passed, false);
  assert.match(result.failure.errors[0], /does not advertise a tool named tour_teleport/);
});

test("templates resolve whole values, interpolate strings, and filter lists", () => {
  const ctx = { rev: 3, actor: { kind: "agent", id: "a" }, steps: { claims: { entities: [{ id: "c1", statement: "Delay is capped", disposition: "open" }, { id: "c2", statement: "Sleeps between attempts", disposition: "supported" }] } } };
  assert.deepStrictEqual(render({ r: "{{ rev }}", who: "{{ actor }}", msg: "rev {{ rev }} by {{ actor.id }}" }, ctx), { r: 3, who: { kind: "agent", id: "a" }, msg: "rev 3 by a" });
  assert.strictEqual(lookup(ctx, "steps.claims.entities[statement~capped].id"), "c1");
  assert.strictEqual(lookup(ctx, "steps.claims.entities[disposition=supported].id"), "c2");
  assert.strictEqual(lookup(ctx, "steps.claims.entities[-1].id"), "c2");
  assert.throws(() => render("{{ steps.nope.id }}", ctx), /resolved to nothing/);
});

test("schema validation follows oneOf discriminators to the matching command", () => {
  const schema = { type: "object", properties: { commands: { type: "array", items: { oneOf: [
    { type: "object", required: ["type", "thesis"], properties: { type: { const: "SetThesis" }, thesis: { type: "object" } } },
    { type: "object", required: ["type"], properties: { type: { const: "MarkPrepared" } } },
  ] } } } };
  assert.deepStrictEqual(validateSchema(schema, { commands: [{ type: "MarkPrepared" }] }), []);
  assert.deepStrictEqual(validateSchema(schema, { commands: [{ type: "SetThesis" }] }), ["$.commands[0].thesis: required"]);
});
