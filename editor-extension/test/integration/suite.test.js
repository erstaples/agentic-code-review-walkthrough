"use strict";

const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vscode = require("vscode");
const editorLib = require("../../lib/editor.js");
const { createIntentStore } = require("../../lib/decorations.js");

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
    const target = () => vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath.endsWith("package.json"));
    const snapshot = (s) => [s.start.line, s.start.character, s.end.line, s.end.character];
    target().selection = new vscode.Selection(0, 0, 0, 4);
    // VS Code clamps a selection to the line's real length asynchronously, so the
    // baseline is only trustworthy once that round trip has landed.
    await sleep(200);
    const before = snapshot(target().selection);
    const res = await call("POST", "/focus", { path: "package.json", side: "working", startLine: 2, endLine: 2, note: "here" });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.revealed, true, "focus fell back to opening a new editor");
    await sleep(200);
    assert.deepStrictEqual(snapshot(target().selection), before);
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

  test("a path escaping the workspace is file_not_found", async () => {
    const res = await call("POST", "/focus", {
      path: "../".repeat(12) + "etc/passwd", side: "working", startLine: 1, endLine: 1,
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error.code, "file_not_found");
  });

  // A stop range recorded before the reviewer shortened the file must not escape
  // applyAll and fail the next unrelated request.
  test("a stop range left stale by an edit does not fail later requests", async () => {
    const rel = "tour-stale-range.tmp";
    const abs = path.join(fixture(), rel);
    fs.writeFileSync(abs, "a\nb\nc\nd\ne\n");
    try {
      const stop = await call("POST", "/stop", {
        stopId: "s2", index: 1, total: 1, label: "Stale", type: "implementation", mode: "file",
        files: [{ path: rel, ranges: [{ side: "working", startLine: 1, endLine: 5 }] }],
      });
      assert.strictEqual(stop.ok, true);

      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs));
      const edit = new vscode.WorkspaceEdit();
      edit.replace(doc.uri, new vscode.Range(0, 0, doc.lineCount, 0), "a\n");
      assert.strictEqual(await vscode.workspace.applyEdit(edit), true);
      await doc.save();

      const res = await call("POST", "/focus", { path: rel, side: "working", startLine: 1, endLine: 1 });
      assert.strictEqual(res.ok, true, JSON.stringify(res));
    } finally {
      fs.rmSync(abs, { force: true });
    }
  });

  // decorate() cannot be observed through the HTTP surface, so this drives
  // lib/editor.js directly against a real document and a spy editor.
  test("the focus note decoration is anchored on the range's first line", async () => {
    const rel = "tour-focus-note.tmp";
    const abs = path.join(fixture(), rel);
    fs.writeFileSync(abs, "one\ntwo\nthree\nfour\nfive\n");
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs));
      const store = createIntentStore();
      store.setFocus({ path: rel, side: "working", startLine: 2, endLine: 4, note: "landed here" });

      const calls = [];
      const stub = { document: doc, setDecorations: (type, options) => calls.push(options) };
      assert.strictEqual(editorLib.applyTo(stub, store, () => null), true);

      const focusOptions = calls.find((options) => options.length > 0 && "range" in options[0]);
      assert.strictEqual(focusOptions.length, 2, "expected one option for the noted line and one for the rest of the block");

      const [noted, rest] = focusOptions;
      assert.strictEqual(noted.range.start.line, 1, "note range should start on wire line 2 (0-based line 1)");
      assert.strictEqual(noted.range.end.line, 1, "note range should not extend past the first line");
      assert.strictEqual(noted.renderOptions.after.contentText, "  landed here");

      assert.strictEqual(rest.range.start.line, 2);
      assert.strictEqual(rest.range.end.line, 3);
      assert.strictEqual(rest.renderOptions, undefined, "only the first line's option carries the note");
    } finally {
      fs.rmSync(abs, { force: true });
    }
  });

  test("POST /clear succeeds without closing tabs", async () => {
    const openTabs = () => vscode.window.tabGroups.all.flatMap((g) => g.tabs).length;
    const before = openTabs();
    assert.strictEqual((await call("POST", "/clear", {})).ok, true);
    assert.strictEqual(openTabs(), before);
  });
};
