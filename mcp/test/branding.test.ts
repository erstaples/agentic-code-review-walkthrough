import { record, records, string } from "../../test/assertions.js";

import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { stateRoot } from "../../generated/mcp/lib/review-map/file-store.js";
import { createFixture } from "../../editor-extension/test/tour-fixture/create.js";

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
  "the shipped server runs without installed dependencies or TypeScript sources",
  { timeout: 15000 },
  async (t) => {
    const fixture = createFixture();
    const plugin = path.join(fixture.root, "plugin");
    fs.mkdirSync(path.join(plugin, "mcp"), { recursive: true });
    fs.copyFileSync(
      path.join(__dirname, "../server.js"),
      path.join(plugin, "mcp/server.js"),
    );
    fs.cpSync(
      path.join(__dirname, "../../generated"),
      path.join(plugin, "generated"),
      { recursive: true },
    );
    assert.equal(fs.existsSync(path.join(plugin, "node_modules")), false);
    assert.equal(fs.existsSync(path.join(plugin, "shared")), false);
    const child = spawn(
      process.execPath,
      [path.join(plugin, "mcp/server.js")],
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
    async function rpc(method: string, params: Record<string, unknown>) {
      const response = once(lines, "line");
      child.stdin.write(
        JSON.stringify({ jsonrpc: "2.0", id: ++id, method, params }) + "\n",
      );
      const message = record(JSON.parse((await response)[0]));
      assert.equal(message.id, id);
      assert.equal(message.error, undefined);
      return record(message.result);
    }
    async function call(name: string, args: Record<string, unknown>) {
      const result = await rpc("tools/call", {
        name,
        arguments: { workspace: fixture.workspace, ...args },
      });
      const content = records(result.content);
      assert.ok(!result.isError, string(content[0].text));
      return record(JSON.parse(string(content[0].text)));
    }
    assert.equal(
      record((await rpc("initialize", {})).serverInfo).name,
      "kanko",
    );
    const advertised = records((await rpc("tools/list", {})).tools);
    assert.equal(advertised.length, 12);
    assert.ok(
      advertised.every((tool) => /^kanko_(map|tour)_/.test(string(tool.name))),
    );
    const actor = { kind: "agent", id: "branding-test" };
    const opened = await call("kanko_map_open", {
      actor,
      selection: { kind: "committed", base: fixture.base, head: fixture.head },
    });
    assert.equal(opened.mapId, fixture.mapId);
    assert.match(string(opened.mapId), /^map_/);
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
      record(loaded.thesis).summary,
      "The new names reach a durable review map.",
    );
    assert.equal(loaded.aggregateRevision, updated.aggregateRevision);
    assert.equal(
      (await call("kanko_map_check", { mapId: opened.mapId })).eventChainValid,
      true,
    );
  },
);
