import { test } from "node:test";
import assert = require("node:assert");
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { writeLock, removeLock } from "../src/host/lockfile.js";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "tourlock-"));

test("writes <port>.lock containing the pairing fields", () => {
  const dir = tmp();
  const info = {
    protocolVersion: 1,
    port: 53411,
    authToken: "tok",
    pid: 7,
    ideName: "Visual Studio Code",
    extensionVersion: "0.1.0",
    workspaceFolders: ["/repo"],
  };
  const p = writeLock(dir, info);
  assert.strictEqual(path.basename(p), "53411.lock");
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(p, "utf8")), info);
});

test("creates the directory when it does not exist", () => {
  const dir = path.join(tmp(), "nested", "deeper");
  writeLock(dir, {
    port: 1,
    authToken: "t",
    pid: 1,
    protocolVersion: 1,
    workspaceFolders: [],
    ideName: "test",
    extensionVersion: "test",
  });
  assert.ok(fs.existsSync(dir));
});

test("the lock is not readable by other users", () => {
  const p = writeLock(tmp(), {
    port: 2,
    authToken: "t",
    pid: 1,
    protocolVersion: 1,
    workspaceFolders: [],
    ideName: "test",
    extensionVersion: "test",
  });
  assert.strictEqual(fs.statSync(p).mode & 0o077, 0);
});

test("removeLock is idempotent", () => {
  const p = writeLock(tmp(), {
    port: 3,
    authToken: "t",
    pid: 1,
    protocolVersion: 1,
    workspaceFolders: [],
    ideName: "test",
    extensionVersion: "test",
  });
  removeLock(p);
  removeLock(p);
  assert.strictEqual(fs.existsSync(p), false);
});
