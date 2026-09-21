"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vscode = require("vscode");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// index.js supplies test/before/after so it can observe outcomes; the suite runs
// inside the extension host, where node:test's own runner cannot finish a run.
module.exports = function register({ test, before, after }) {
  let lock;
  let base;

  before(async () => {
    await vscode.extensions.getExtension("estaples.claude-tour").activate();
    const dir = path.join(os.homedir(), ".claude", "tour");
    for (let i = 0; i < 40 && !lock; i++) {
      const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith(".lock")) : [];
      const mine = names
        .map((n) => JSON.parse(fs.readFileSync(path.join(dir, n), "utf8")))
        .find((l) => l.pid === process.pid);
      if (mine) lock = mine;
      else await sleep(250);
    }
    assert.ok(lock, "extension did not write a lockfile for this process");
    base = `http://127.0.0.1:${lock.port}`;
  });

  after(() => {
    const p = path.join(os.homedir(), ".claude", "tour", `${lock.port}.lock`);
    assert.strictEqual(fs.existsSync(p), true, "lock should still exist while active");
  });

  const call = (method, route, body) =>
    fetch(base + route + (method === "GET" ? "?protocolVersion=1" : ""), {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${lock.authToken}` },
      body: method === "GET" ? undefined : JSON.stringify({ protocolVersion: 1, ...body }),
    }).then((r) => r.json());

  const fixture = () => vscode.workspace.workspaceFolders[0].uri.fsPath;

  test("GET /status reports the workspace this window owns", async () => {
    const res = await call("GET", "/status");
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.protocolVersion, 1);
    assert.strictEqual(res.ideName, "Visual Studio Code");
    assert.deepStrictEqual(res.workspaceFolders, [fixture()]);
  });

  test("POST /stop in file mode opens the listed files", async () => {
    const res = await call("POST", "/stop", {
      stopId: "s1", index: 1, total: 1, label: "Smoke", type: "implementation", mode: "file",
      files: [{ path: "package.json", ranges: [{ side: "working", startLine: 1, endLine: 3 }] }],
    });
    assert.strictEqual(res.ok, true);
    assert.deepStrictEqual(res.opened, ["package.json"]);
    assert.deepStrictEqual(res.deferred, []);
    const open = vscode.window.visibleTextEditors.map((e) => e.document.uri.fsPath);
    assert.ok(open.some((p) => p.endsWith("package.json")), `package.json not open, saw ${open.join(", ")}`);
  });

  test("POST /focus succeeds and leaves the reviewer's selection alone", async () => {
    const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath.endsWith("package.json"));
    editor.selection = new vscode.Selection(0, 0, 0, 4);
    // VS Code clamps a selection to the line's real length asynchronously, so the
    // baseline is only trustworthy once that round trip has landed.
    await sleep(200);
    const before = editor.selection;
    const res = await call("POST", "/focus", { path: "package.json", side: "working", startLine: 2, endLine: 2, note: "here" });
    assert.strictEqual(res.ok, true);
    await sleep(200);
    assert.strictEqual(editor.selection.start.line, before.start.line);
    assert.strictEqual(editor.selection.start.character, before.start.character);
    assert.strictEqual(editor.selection.end.line, before.end.line);
    assert.strictEqual(editor.selection.end.character, before.end.character);
  });

  test("a range past the end of the file is range_out_of_bounds", async () => {
    const res = await call("POST", "/focus", { path: "package.json", side: "working", startLine: 99999, endLine: 99999 });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error.code, "range_out_of_bounds");
  });

  test("an unknown path is file_not_found", async () => {
    const res = await call("POST", "/focus", { path: "does/not/exist.go", side: "working", startLine: 1, endLine: 1 });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error.code, "file_not_found");
  });

  test("POST /clear succeeds without closing tabs", async () => {
    const openTabs = () => vscode.window.tabGroups.all.flatMap((g) => g.tabs).length;
    const before = openTabs();
    assert.strictEqual((await call("POST", "/clear", {})).ok, true);
    assert.strictEqual(openTabs(), before);
  });
};
