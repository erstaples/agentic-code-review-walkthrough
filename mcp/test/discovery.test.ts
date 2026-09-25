import { errorFields } from "../../generated/mcp/lib/input.js";
import { test } from "node:test";
import * as assert from "node:assert";
import { resolveLock } from "../../generated/mcp/lib/discovery.js";

const lock = (over = {}) => ({
  protocolVersion: 1,
  port: 53411,
  authToken: "tok",
  pid: 100,
  ideName: "Visual Studio Code",
  extensionVersion: "0.1.0",
  workspaceFolders: ["/repo"],
  ...over,
});

function fakeFs(files: Record<string, unknown>) {
  const unlinked: string[] = [];
  return {
    unlinked,
    readdirSync: () => Object.keys(files),
    readFileSync: (p: string) => {
      const name = p.split("/").pop() || "";
      if (!(name in files)) {
        const e = Object.assign(new Error("ENOENT"), { code: "ENOENT" });
        throw e;
      }
      return JSON.stringify(files[name]);
    },
    unlinkSync: (p: string) => {
      unlinked.push(p.split("/").pop() || "");
      delete files[p.split("/").pop() || ""];
    },
  };
}

const alive = () => true;
const call = (
  files: Record<string, unknown>,
  cwd: string,
  isAlive: (pid: number) => boolean = alive,
) =>
  resolveLock({
    dir: "/locks",
    cwd,
    fs: fakeFs(files),
    isAlive,
    protocolVersion: 1,
  });

test("resolves the single lock whose workspace contains cwd", () => {
  const r = call({ "53411.lock": lock() }, "/repo/internal/retry");
  assert.strictEqual(r.port, 53411);
  assert.strictEqual(r.authToken, "tok");
});

test("cwd equal to the workspace root resolves", () => {
  assert.strictEqual(call({ "53411.lock": lock() }, "/repo").port, 53411);
});

test("a sibling directory sharing a name prefix does not match", () => {
  assert.throws(
    () => call({ "53411.lock": lock() }, "/repo-other/src"),
    (err) => errorFields(err).code === "no_bridge",
  );
});

test("nested workspaces resolve to the longest matching prefix", () => {
  const files = {
    "1.lock": lock({ port: 1, workspaceFolders: ["/repo"] }),
    "2.lock": lock({ port: 2, workspaceFolders: ["/repo/sub"] }),
  };
  assert.strictEqual(call(files, "/repo/sub/pkg").port, 2);
});

test("two equally specific matches are ambiguous and never guessed", () => {
  const files = {
    "1.lock": lock({ port: 1, workspaceFolders: ["/repo"] }),
    "2.lock": lock({ port: 2, workspaceFolders: ["/repo"] }),
  };
  assert.throws(
    () => call(files, "/repo"),
    (err) => {
      assert.strictEqual(errorFields(err).code, "ambiguous_bridge");
      return true;
    },
  );
});

test("locks whose process is dead are skipped and unlinked", () => {
  const files = {
    "1.lock": lock({ port: 1, pid: 999 }),
    "2.lock": lock({ port: 2, pid: 100 }),
  };
  const fs = fakeFs(files);
  const r = resolveLock({
    dir: "/locks",
    cwd: "/repo",
    fs,
    isAlive: (pid) => pid === 100,
    protocolVersion: 1,
  });
  assert.strictEqual(r.port, 2);
  assert.deepStrictEqual(fs.unlinked, ["1.lock"]);
});

test("no locks at all reports no_bridge", () => {
  assert.throws(
    () => call({}, "/repo"),
    (err) => {
      assert.strictEqual(errorFields(err).code, "no_bridge");
      return true;
    },
  );
});

test("a protocol version mismatch names both versions", () => {
  assert.throws(
    () => call({ "1.lock": lock({ protocolVersion: 2 }) }, "/repo"),
    (err) => {
      assert.strictEqual(errorFields(err).code, "protocol_mismatch");
      assert.match(errorFields(err).message, /2/);
      assert.match(errorFields(err).message, /1/);
      return true;
    },
  );
});

test("unparseable lock files are ignored rather than fatal", () => {
  const fs = fakeFs({ "1.lock": lock() });
  const orig = fs.readFileSync;
  fs.readdirSync = () => ["bad.lock", "1.lock"];
  fs.readFileSync = (p: string) => (p.endsWith("bad.lock") ? "{{{" : orig(p));
  assert.strictEqual(
    resolveLock({
      dir: "/locks",
      cwd: "/repo",
      fs,
      isAlive: alive,
      protocolVersion: 1,
    }).port,
    53411,
  );
});
