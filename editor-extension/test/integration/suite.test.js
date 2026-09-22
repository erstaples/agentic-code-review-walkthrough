"use strict";

const assert = require("node:assert");
const cp = require("node:child_process");
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

  // Diff-mode tests need known A/D/M/R commits, not whatever this project's own
  // history happens to contain when the suite runs (unrelated commits on this
  // branch touch nothing under editor-extension/, which starves that coupling).
  //
  // padCount pads the diff with extra modified files. A 4-file diff of tiny
  // files renders every pane synchronously in this environment, which starves
  // the reactive-materialization test; 30 padding files reliably leaves most
  // panes deferred (observed ~27/34 immediately after /stop).
  function buildDiffFixtureRepo(padCount = 0) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "tour-diff-fixture-"));
    const git = (...args) => cp.execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
    git("init", "-q", "-b", "main");
    git("config", "user.email", "t@example.com");
    git("config", "user.name", "T");

    fs.writeFileSync(path.join(dir, "modified.txt"), "one\n");
    fs.writeFileSync(path.join(dir, "deleted.txt"), "bye\n");
    fs.writeFileSync(path.join(dir, "old-name.txt"), "renamed content\n");
    for (let i = 0; i < padCount; i++) fs.writeFileSync(path.join(dir, `pad${i}.txt`), "x".repeat(200) + "\n".repeat(50));
    git("add", "-A");
    git("commit", "-qm", "base");
    const base = git("rev-parse", "HEAD");

    fs.writeFileSync(path.join(dir, "modified.txt"), "one\ntwo\n");
    fs.rmSync(path.join(dir, "deleted.txt"));
    fs.renameSync(path.join(dir, "old-name.txt"), path.join(dir, "new-name.txt"));
    fs.writeFileSync(path.join(dir, "added.txt"), "brand new\n");
    for (let i = 0; i < padCount; i++) fs.writeFileSync(path.join(dir, `pad${i}.txt`), "y".repeat(200) + "\n".repeat(50));
    git("add", "-A");
    git("commit", "-qm", "head");
    const head = git("rev-parse", "HEAD");

    return { dir, base, head, padCount };
  }

  // updateWorkspaceFolders resolving doesn't mean the git extension has
  // attached a Repository for the new folder; every git: URI read against it
  // 404s until that scan completes. Passively waiting on the extension's own
  // onDidOpenRepository (auto-detection) was tried first and empirically
  // times out on a real fraction of runs, not just slow -- openRepository()'s
  // returned promise is the authoritative "it's open" signal instead.
  async function waitForGitRepository(fsPath, timeoutMs = 10000) {
    const gitExtension = vscode.extensions.getExtension("vscode.git");
    assert.ok(gitExtension, "the vscode.git extension is not available in this test host");
    const exports = await gitExtension.activate();
    const api = exports.getAPI(1);

    const matches = (repo) => repo.rootUri.fsPath === fsPath;
    if (api.repositories.some(matches)) return;

    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms waiting for the git extension to open a repository at ${fsPath}`)), timeoutMs)
    );
    const repo = await Promise.race([api.openRepository(vscode.Uri.file(fsPath)), timeout]);
    assert.ok(repo, `the git extension could not open a repository at ${fsPath}`);
  }

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

  test("a base or head range in file mode is rejected with bad_request", async () => {
    const res = await call("POST", "/stop", {
      stopId: "s1b", index: 1, total: 1, label: "Bad side", type: "implementation", mode: "file",
      files: [{ path: "package.json", ranges: [{ side: "base", startLine: 1, endLine: 1 }] }],
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error.code, "bad_request");
    assert.match(res.error.message, /package\.json/);
    assert.match(res.error.message, /base/);
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

  // decorate()'s git: path exercises describe()'s canonicalPath resolution and
  // sideResolver(ref), neither of which the file-mode test above touches.
  // Asserts both halves of the reactive contract: the correct STOP range
  // reaches setDecorations, and only the materialized side leaves pending.
  test("applyTo decorates a git-scheme pane and clears only its (path, side) pending entry", async () => {
    const rel = "tour-git-pending.tmp";
    const abs = path.join(fixture(), rel);
    fs.writeFileSync(abs, "one\ntwo\nthree\n");
    try {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(abs));
      const gitUri = vscode.Uri.file(abs).with({ scheme: "git", query: JSON.stringify({ path: abs, ref: "headsha" }) });
      const store = createIntentStore();
      store.setStop({
        stopId: "spy1",
        files: [{ path: rel, ranges: [{ side: "head", startLine: 1, endLine: 2 }, { side: "base", startLine: 1, endLine: 1 }] }],
      });
      const byKey = (list) => list.map((p) => `${p.side}:${p.path}`).sort();
      assert.deepStrictEqual(byKey(store.pending()), [`base:${rel}`, `head:${rel}`]);

      const calls = [];
      const stub = {
        document: { uri: gitUri, lineCount: doc.lineCount, lineAt: (n) => doc.lineAt(n) },
        setDecorations: (type, ranges) => calls.push(ranges),
      };
      const sideResolver = (ref) => (ref === "headsha" ? "head" : null);

      assert.strictEqual(editorLib.applyTo(stub, store, sideResolver), true);
      assert.strictEqual(calls.length, 2, "expected a STOP call and a FOCUS call");
      assert.strictEqual(calls[0].length, 1, "only the head-side range belongs to this head-ref pane");
      assert.strictEqual(calls[0][0].start.line, 0);
      assert.strictEqual(calls[0][0].end.line, 1);
      assert.deepStrictEqual(calls[1], [], "no focus was set");

      assert.deepStrictEqual(
        byKey(store.pending()), [`base:${rel}`],
        "the head side must leave pending once decorated; the base side, with no matching editor, stays"
      );
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

  let diff;

  test("swaps in a dedicated fixture repo covering added, modified, deleted, and renamed files", async () => {
    diff = buildDiffFixtureRepo(30);
    diff.originalFolderUri = vscode.workspace.workspaceFolders[0].uri;
    const swapped = vscode.workspace.updateWorkspaceFolders(0, 1, { uri: vscode.Uri.file(diff.dir) });
    assert.ok(swapped, "failed to swap the fixture repo in as the workspace root");
    await sleep(500);
    assert.strictEqual(vscode.workspace.workspaceFolders[0].uri.fsPath, diff.dir);
    await waitForGitRepository(diff.dir);
  });

  test("POST /stop in diff mode opens the multi-file diff editor covering added, modified, deleted, and renamed files", async () => {
    await call("POST", "/clear", {});
    const padFiles = Array.from({ length: diff.padCount }, (_, i) => ({ path: `pad${i}.txt`, ranges: [{ side: "head", startLine: 1, endLine: 1 }] }));
    const res = await call("POST", "/stop", {
      stopId: "d1", index: 1, total: 1, label: "Diff smoke", type: "implementation", mode: "diff",
      base: { sha: diff.base, name: "base" }, head: { sha: diff.head, name: "head" },
      files: [
        { path: "modified.txt", ranges: [{ side: "base", startLine: 1, endLine: 1 }, { side: "head", startLine: 1, endLine: 1 }] },
        { path: "added.txt", ranges: [{ side: "head", startLine: 1, endLine: 1 }] },
        { path: "deleted.txt", ranges: [{ side: "base", startLine: 1, endLine: 1 }] },
        { path: "new-name.txt", ranges: [{ side: "base", startLine: 1, endLine: 1 }, { side: "head", startLine: 1, endLine: 1 }] },
        ...padFiles,
      ],
    });
    assert.strictEqual(res.ok, true, JSON.stringify(res));
    const expectedOpened = ["added.txt", "deleted.txt", "modified.txt", "new-name.txt", ...padFiles.map((f) => f.path)];
    assert.deepStrictEqual(res.opened.sort(), expectedOpened.sort());
    diff.lastRes = res;
    await sleep(1500);

    const multi = vscode.window.tabGroups.all
      .flatMap((g) => g.tabs)
      .find((t) => t.input instanceof vscode.TabInputTextMultiDiff);
    assert.ok(multi, "no multi-diff tab opened");
    assert.strictEqual(multi.input.textDiffs.length, expectedOpened.length);
    diff.multi = multi;
  });

  // window.setDecorations has no public getter, so decoration state itself
  // cannot be observed from the extension host. `revealed` alone proves only
  // that the editor is visible (reveal() does its own independent scan) --
  // it says nothing about decoration, and stays green even with
  // onDidChangeVisibleTextEditors deleted, since reveal()'s scan doesn't need it.
  //
  // GET /status never calls applyAll (unlike /stop and /focus, which always
  // reconcile as a side effect of handling any request), so reading `deferred`
  // there after materializing a pane -- with no other request in between --
  // isolates the reactive subscription specifically: only it could have run
  // markApplied for this pair by the time /status is asked. This runs
  // immediately after the diff opens, before any other test's own /stop or
  // /focus calls get a chance to reconcile the same pending pair first.
  test("a materialized diff pane leaves `deferred` via the reactive subscription alone, observed through GET /status", async () => {
    const deferred = diff.lastRes.deferred;
    assert.ok(Array.isArray(deferred), "deferred must be an array");
    assert.ok(deferred.length > 0, "expected at least one (path, side) pair to be deferred immediately after opening the padded diff");
    assert.ok(
      deferred.every((d) => typeof d.path === "string" && (d.side === "base" || d.side === "head")),
      `deferred entries must be {path, side} pairs, got ${JSON.stringify(deferred)}`
    );

    const target = deferred[0];
    const entry = diff.multi.input.textDiffs.find((t) => {
      const uri = target.side === "base" ? t.original : t.modified;
      return uri && editorLib.describe({ document: { uri } })?.path === target.path;
    });
    assert.ok(entry, `expected a textDiffs entry for ${target.side}:${target.path}`);
    const uri = target.side === "base" ? entry.original : entry.modified;
    assert.ok(uri, `${target.side} side of ${target.path} has no URI to open`);

    await vscode.window.showTextDocument(uri, { preview: false, preserveFocus: true });
    await sleep(300);

    const status = await call("GET", "/status");
    assert.strictEqual(status.ok, true, JSON.stringify(status));
    assert.ok(
      !status.deferred.some((d) => d.path === target.path && d.side === target.side),
      `${target.side}:${target.path} should have left deferred via the reactive subscription alone, still in ${JSON.stringify(status.deferred)}`
    );

    const res = await call("POST", "/focus", { path: target.path, side: target.side, startLine: 1, endLine: 1 });
    assert.strictEqual(res.ok, true, JSON.stringify(res));
    assert.strictEqual(res.revealed, true, `expected the now-open ${target.side} side of ${target.path} to be revealable`);
  });

  // A rejected /stop must not mutate the store: validate, then commit. Proven
  // by pinning a stop to a single file we never materialize (so its (path,
  // side) pair stays deterministically pending), attempting a rejected /stop,
  // then reading pending back through /focus — a corrupted store replaces the
  // whole pending set with the rejected request's own (invalid) file.
  test("a rejected diff-mode /stop leaves the previous stop's pending state intact", async () => {
    await call("POST", "/clear", {});
    const padFiles = Array.from({ length: diff.padCount }, (_, i) => ({ path: `pad${i}.txt`, ranges: [{ side: "head", startLine: 1, endLine: 1 }] }));
    const original = await call("POST", "/stop", {
      stopId: "dB1", index: 1, total: 1, label: "Original", type: "implementation", mode: "diff",
      base: { sha: diff.base, name: "base" }, head: { sha: diff.head, name: "head" },
      files: padFiles,
    });
    assert.strictEqual(original.ok, true, JSON.stringify(original));
    assert.ok(original.deferred.length > 0, "expected some padding files to stay deferred immediately");
    // A git: side pane is never auto-opened by reveal(), so probing this pair
    // through /focus below cannot itself materialize it.
    const guard = original.deferred[0];

    const rejected = await call("POST", "/stop", {
      stopId: "dB2", index: 1, total: 1, label: "Rejected", type: "implementation", mode: "diff",
      base: { sha: diff.base, name: "base" }, head: { sha: diff.head, name: "head" },
      files: [{ path: "added.txt", ranges: [{ side: "base", startLine: 1, endLine: 1 }] }],
    });
    assert.strictEqual(rejected.ok, false);
    assert.strictEqual(rejected.error.code, "bad_request");

    const probe = await call("POST", "/focus", { path: guard.path, side: guard.side, startLine: 1, endLine: 1 });
    assert.strictEqual(probe.ok, true, JSON.stringify(probe));
    assert.ok(
      probe.deferred.some((d) => d.path === guard.path && d.side === guard.side),
      `the rejected /stop must not have replaced the original stop's pending state; guard ${JSON.stringify(guard)} missing from ${JSON.stringify(probe.deferred)}`
    );
  });

  test("a base range on an added file is rejected with bad_request naming the file and side", async () => {
    await call("POST", "/clear", {});
    const res = await call("POST", "/stop", {
      stopId: "d2", index: 1, total: 1, label: "Bad side", type: "implementation", mode: "diff",
      base: { sha: diff.base, name: "base" }, head: { sha: diff.head, name: "head" },
      files: [{ path: "added.txt", ranges: [{ side: "base", startLine: 1, endLine: 1 }] }],
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error.code, "bad_request");
    assert.match(res.error.message, /added\.txt/);
    assert.match(res.error.message, /base/);
  });

  test("a head range on a deleted file is rejected with bad_request naming the file and side", async () => {
    await call("POST", "/clear", {});
    const res = await call("POST", "/stop", {
      stopId: "d3", index: 1, total: 1, label: "Bad side", type: "implementation", mode: "diff",
      base: { sha: diff.base, name: "base" }, head: { sha: diff.head, name: "head" },
      files: [{ path: "deleted.txt", ranges: [{ side: "head", startLine: 1, endLine: 1 }] }],
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error.code, "bad_request");
    assert.match(res.error.message, /deleted\.txt/);
    assert.match(res.error.message, /head/);
  });

  test("a diff-mode range past the end of the pinned blob is rejected with range_out_of_bounds", async () => {
    await call("POST", "/clear", {});
    const res = await call("POST", "/stop", {
      stopId: "d3b", index: 1, total: 1, label: "Out of bounds", type: "implementation", mode: "diff",
      base: { sha: diff.base, name: "base" }, head: { sha: diff.head, name: "head" },
      files: [{ path: "deleted.txt", ranges: [{ side: "base", startLine: 1, endLine: 99999 }] }],
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error.code, "range_out_of_bounds");
    assert.match(res.error.message, /deleted\.txt/);
  });

  test("a diff-mode range with no side is rejected with bad_request, not stored as the literal string \"undefined\"", async () => {
    await call("POST", "/clear", {});
    const res = await call("POST", "/stop", {
      stopId: "d3c", index: 1, total: 1, label: "Missing side", type: "implementation", mode: "diff",
      base: { sha: diff.base, name: "base" }, head: { sha: diff.head, name: "head" },
      files: [{ path: "modified.txt", ranges: [{ startLine: 1, endLine: 1 }] }],
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error.code, "bad_request");
  });

  test("a path absent from the diff is rejected with bad_request", async () => {
    await call("POST", "/clear", {});
    const res = await call("POST", "/stop", {
      stopId: "d4", index: 1, total: 1, label: "Absent path", type: "implementation", mode: "diff",
      base: { sha: diff.base, name: "base" }, head: { sha: diff.head, name: "head" },
      files: [{ path: "never-existed.txt", ranges: [{ side: "head", startLine: 1, endLine: 1 }] }],
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error.code, "bad_request");
    assert.match(res.error.message, /never-existed\.txt/);
  });

  test("a WORKTREE head in diff mode is rejected with bad_request", async () => {
    await call("POST", "/clear", {});
    const res = await call("POST", "/stop", {
      stopId: "d7", index: 1, total: 1, label: "Worktree head", type: "implementation", mode: "diff",
      base: { sha: diff.base, name: "base" }, head: { sha: "WORKTREE", name: "working tree" },
      files: [],
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error.code, "bad_request");
    assert.match(res.error.message, /committed head/);
  });

  test("a second stop with a different base is diff_identity_mismatch", async () => {
    await call("POST", "/clear", {});
    await call("POST", "/stop", {
      stopId: "d5a", index: 1, total: 2, label: "First", type: "implementation", mode: "diff",
      base: { sha: diff.base, name: "base" }, head: { sha: diff.head, name: "head" },
      files: [{ path: "modified.txt", ranges: [{ side: "head", startLine: 1, endLine: 1 }] }],
    });
    const res = await call("POST", "/stop", {
      stopId: "d5b", index: 2, total: 2, label: "Wrong identity", type: "implementation", mode: "diff",
      base: { sha: "0".repeat(40), name: "bogus" }, head: { sha: diff.head, name: "head" },
      files: [],
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error.code, "diff_identity_mismatch");
  });

  test("POST /focus can reach a deleted file's base side, which /stop already blesses", async () => {
    await call("POST", "/clear", {});
    const stop = await call("POST", "/stop", {
      stopId: "d5c", index: 1, total: 1, label: "Deleted file", type: "implementation", mode: "diff",
      base: { sha: diff.base, name: "base" }, head: { sha: diff.head, name: "head" },
      files: [{ path: "deleted.txt", ranges: [{ side: "base", startLine: 1, endLine: 1 }] }],
    });
    assert.strictEqual(stop.ok, true, JSON.stringify(stop));

    // deleted.txt does not exist on disk at head, which is what a normal
    // working tree checked out to head would show.
    const res = await call("POST", "/focus", { path: "deleted.txt", side: "base", startLine: 1, endLine: 1 });
    assert.strictEqual(res.ok, true, JSON.stringify(res));
  });

  test("POST /focus on a base/head side outside an active diff tour is rejected with bad_request", async () => {
    await call("POST", "/clear", {});
    const res = await call("POST", "/focus", { path: "deleted.txt", side: "base", startLine: 1, endLine: 1 });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error.code, "bad_request");
  });

  test("a renamed file's base and head ranges both resolve under the canonical (target) path", async () => {
    await call("POST", "/clear", {});
    const res = await call("POST", "/stop", {
      stopId: "d6", index: 1, total: 1, label: "Rename", type: "implementation", mode: "diff",
      base: { sha: diff.base, name: "base" }, head: { sha: diff.head, name: "head" },
      files: [{ path: "new-name.txt", ranges: [{ side: "base", startLine: 1, endLine: 1 }, { side: "head", startLine: 1, endLine: 1 }] }],
    });
    assert.strictEqual(res.ok, true, JSON.stringify(res));
    assert.deepStrictEqual(res.opened, ["new-name.txt"]);
    await sleep(1500);

    const described = vscode.window.visibleTextEditors
      .filter((e) => e.document.uri.scheme === "git")
      .map((e) => editorLib.describe(e))
      .filter(Boolean);
    assert.ok(described.some((d) => d.path === "new-name.txt"), `expected an editor describing to new-name.txt, saw ${JSON.stringify(described)}`);
    assert.ok(!described.some((d) => d.path === "old-name.txt"), "the base pane must resolve to the canonical (target) name, not the historical source name");
  });

  test("requesting a renamed file by its old (source) name is rejected", async () => {
    await call("POST", "/clear", {});
    const res = await call("POST", "/stop", {
      stopId: "d8", index: 1, total: 1, label: "Old name", type: "implementation", mode: "diff",
      base: { sha: diff.base, name: "base" }, head: { sha: diff.head, name: "head" },
      files: [{ path: "old-name.txt", ranges: [{ side: "base", startLine: 1, endLine: 1 }] }],
    });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.error.code, "bad_request");
  });

  // updateWorkspaceFolders' own single-folder-to-workspace-mode transition makes
  // a second, symmetric call unreliable in this harness (observed returning
  // false even with a valid target), so restoration is best-effort; removing
  // the fixture directory is the outcome this suite can actually verify.
  test("cleans up the fixture repository", async () => {
    vscode.workspace.updateWorkspaceFolders(0, 1, { uri: diff.originalFolderUri });
    await sleep(500);
    fs.rmSync(diff.dir, { recursive: true, force: true });
    assert.strictEqual(fs.existsSync(diff.dir), false, "fixture repo directory should be removed");
  });
};
