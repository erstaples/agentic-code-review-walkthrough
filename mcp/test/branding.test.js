"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const { createInterface } = require("node:readline");
const { stateRoot } = require("../lib/review-map/file-store.js");
const {
  createFixture,
} = require("../../editor-extension/test/tour-fixture/create.js");

test("state directories use the product namespace on every platform", () => {
  assert.equal(
    stateRoot({ KANKO_STATE_DIR: "custom-state" }),
    path.resolve("custom-state"),
  );
  assert.equal(
    stateRoot({}, "darwin"),
    path.join(os.homedir(), "Library", "Application Support", "kanko"),
  );
  assert.equal(
    stateRoot({ LOCALAPPDATA: "/local" }, "win32"),
    path.join("/local", "kanko"),
  );
  assert.equal(
    stateRoot({ XDG_STATE_HOME: "/state" }, "linux"),
    path.join("/state", "kanko"),
  );
  assert.equal(
    stateRoot({}, "linux"),
    path.join(os.homedir(), ".local", "state", "kanko"),
  );
});

test(
  "the stdio server opens, updates, and reloads a review map through its advertised names",
  { timeout: 15000 },
  async (t) => {
    const fixture = createFixture();
    const child = spawn(
      process.execPath,
      [path.join(__dirname, "../server.js")],
      {
        env: { ...process.env, KANKO_STATE_DIR: fixture.stateRoot },
        stdio: ["pipe", "pipe", "inherit"],
      },
    );
    const exited = once(child, "exit");
    const lines = createInterface({ input: child.stdout });
    t.after(async () => {
      lines.close();
      child.kill();
      await exited;
      fs.rmSync(fixture.root, { recursive: true, force: true });
    });
    let id = 0;
    async function rpc(method, params) {
      const response = once(lines, "line");
      child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) + "\n",
      );
      const message = JSON.parse((await response)[0]);
      assert.equal(message.id, id);
      assert.equal(message.error, undefined);
      return message.result;
    }
    async function call(name, args) {
      const result = await rpc("tools/call", {
        name,
        arguments: { workspace: fixture.workspace, ...args },
      });
      assert.ok(!result.isError, result.content?.[0]?.text);
      return JSON.parse(result.content[0].text);
    }
    assert.equal((await rpc("initialize", {})).serverInfo.name, "kanko");
    const advertised = (await rpc("tools/list", {})).tools;
    assert.equal(advertised.length, 12);
    assert.ok(advertised.every((tool) => /^kanko_(map|tour)_/.test(tool.name)));
    const actor = { kind: "agent", id: "branding-test" };
    const opened = await call("kanko_map_open", {
      actor,
      selection: { kind: "committed", base: fixture.base, head: fixture.head },
    });
    assert.equal(opened.mapId, fixture.mapId);
    assert.match(opened.mapId, /^map_/);
    const updated = await call("kanko_map_apply", {
      actor,
      mapId: opened.mapId,
      expectedRevision: opened.aggregateRevision,
      commands: [
        {
          type: "SetThesis",
          thesis: {
            summary: "The new names reach a durable review map.",
            provenance: [
              { kind: "execution-observed", source: { type: "test" } },
            ],
          },
        },
      ],
    });
    const loaded = await call("kanko_map_get", {
      mapId: opened.mapId,
      selector: { kind: "overview" },
    });
    assert.equal(
      loaded.thesis.summary,
      "The new names reach a durable review map.",
    );
    assert.equal(loaded.aggregateRevision, updated.aggregateRevision);
    assert.equal(
      (await call("kanko_map_check", { mapId: opened.mapId })).eventChainValid,
      true,
    );
  },
);
