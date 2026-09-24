"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { McpClient } = require("../e2e/lib/mcp-client.js");
const { startHeadlessEditor } = require("../e2e/lib/headless-editor.js");
const { loadTour, listTours } = require("../sim/lib/tour.js");
const { prepareFixture } = require("../sim/lib/workspace.js");
const { SimAgent } = require("../sim/lib/agent.js");
const { STATES } = require("../sim/lib/states.js");

// Drives the simulator the way the terminal does, with a recording io and
// the headless editor on the bridge.
async function session(tourName, answers = []) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kanko-sim-test-"));
  const tour = loadTour(tourName);
  const ws = prepareFixture(tour, { root });
  const lockDir = path.join(root, "locks");
  const events = [];
  const editor = await startHeadlessEditor({ workspace: ws.workspace, lockDir, onEvent: (e) => events.push(e) });
  const client = new McpClient({ cwd: ws.workspace, env: { TOUR_CHANGES_STATE_DIR: ws.stateDir, TOUR_CHANGES_LOCK_DIR: lockDir } });
  await client.initialize();
  const said = [];
  const errors = [];
  const noop = () => {};
  const io = {
    say: async (t) => { said.push(t); }, tool: noop, toolResult: (n, isError, v) => { if (isError) errors.push(`${n}: ${v.code}`); },
    banner: noop, stopHeader: noop, notice: noop, hint: noop, block: noop, receipt: (md) => said.push(md),
    galleryHeader: noop, look: noop, setSpeed: noop, pause: async () => {},
    ask: async () => answers.shift() ?? null,
  };
  const agent = new SimAgent({ tour, ws, client, io });
  return {
    agent, said, errors, events, ws,
    async close() { await client.close(); await editor.close(); fs.rmSync(root, { recursive: true, force: true }); },
  };
}

test("bundled tours load and reference only their own stops", () => {
  for (const tour of listTours()) {
    assert.ok(tour.stops.length > 0, `${tour.name} has no stops`);
    const keys = new Set(Object.values(tour.entities).flat().map((e) => e.key));
    for (const stop of tour.stops) for (const k of stop.covers) assert.ok(keys.has(k), `${tour.name}/${stop.id} covers unknown entity ${k}`);
  }
});

test("a full simulated review reaches an emitted receipt", async () => {
  const s = await session("retry-backoff", ["2", "y"]);
  try {
    await s.agent.start();
    await s.agent.handle("why cap at 2s?");
    assert.match(s.said.at(-1), /two seconds keeps the worst case/);
    await s.agent.handle("next");
    await s.agent.handle("is anything still calling it positionally?");
    await s.agent.handle("src/retry.js:14 what is this?");
    assert.match(s.said.at(-1), /skips the sleep after the final attempt/);
    await s.agent.handle("next");
    await s.agent.handle("next");
    await s.agent.handle("concern the guide should link to backoff.js");
    await s.agent.handle("next");
    assert.strictEqual(await s.agent.handle("next"), "exit");

    assert.deepStrictEqual(s.errors, []);
    assert.strictEqual(s.events.filter((e) => e.kind === "stop").length, 5);
    assert.ok(s.said.some((t) => /Outcome: \*\*changes-requested\*\*/.test(t)), "receipt preview not shown");
    assert.ok(s.said.some((t) => /^Saved\./.test(t)), "receipt not emitted");
    assert.strictEqual(s.events.at(-1).kind, "clear");
  } finally { await s.close(); }
});

test("every gallery state sets up against the headless editor and cleans up", async () => {
  const s = await session("retry-backoff");
  try {
    await s.agent.start();
    for (const state of STATES) {
      await s.agent.handle(`states ${state.key}`);
      assert.ok(!s.said.some((t) => /Couldn't set up/.test(t)), `${state.key}: ${s.said.at(-1)}`);
    }
    await s.agent.handle("tour");
    const expected = ["diff_identity_mismatch", "range_out_of_bounds"]; // from the "errors" state, on purpose
    assert.deepStrictEqual(s.errors.filter((e) => !expected.some((x) => e.endsWith(x))), []);
    assert.strictEqual(cp.execFileSync("git", ["status", "--porcelain"], { cwd: s.ws.workspace, encoding: "utf8" }), "", "the gallery left the fixture dirty");
    assert.ok(!fs.existsSync(path.join(s.ws.workspace, ".vscode", "settings.json")), "gallery settings were not removed");
  } finally { await s.close(); }
});

test("editing the working tree mid-review refreshes the dossier and revisits invalidated stops", async () => {
  const s = await session("timeout-config");
  try {
    await s.agent.start();
    await s.agent.handle("next");
    fs.writeFileSync(path.join(s.ws.workspace, "src/config.js"), "\"use strict\";\n\nmodule.exports = {\n  timeoutMs: 3000,\n  retries: 3,\n};\n");
    await s.agent.handle("next");
    assert.ok(s.said.some((t) => /^Refreshed: modified src\/config\.js/.test(t)), s.said.join("\n"));
    assert.match(s.said.at(-3) + s.said.at(-2) + s.said.at(-1), /Going back to stop 1/);
    assert.strictEqual(s.agent.current, 0);
  } finally { await s.close(); }
});

test("pausing and restarting resumes from the dossier", async () => {
  const s = await session("retry-backoff");
  try {
    await s.agent.start();
    await s.agent.handle("next");
    assert.strictEqual(await s.agent.handle("pause"), "exit");
    const again = new SimAgent({ tour: s.agent.tour, ws: s.ws, client: s.agent.client, io: s.agent.io });
    await again.start();
    assert.ok(s.said.some((t) => /^Resuming your review from the dossier.*1 of 5 stops done/.test(t)));
    assert.strictEqual(again.current, 1);
  } finally { await s.close(); }
});
