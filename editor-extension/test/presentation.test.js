"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createPresentation } = require("./legacy/presentation.js");
const { createIntentStore } = require("./legacy/decorations.js");
const { hashText } = require("./legacy/anchors.js");

function fixture({ sideBySide = false, settings = {} } = {}) {
  class Uri {
    constructor(fsPath, scheme = "file", query = "") { Object.assign(this, { fsPath, scheme, query }); }
    with(change) { return Object.assign(new Uri(this.fsPath, this.scheme, this.query), change); }
    toString() { return `${this.scheme}:${this.fsPath}?${this.query}`; }
    static file(p) { return new Uri(p); }
  }
  const event = () => {
    const handlers = new Set();
    return { listen(fn) { handlers.add(fn); return { dispose: () => handlers.delete(fn) }; }, fire(value) { for (const fn of handlers) fn(value); } };
  };
  const visible = event(), config = event(), edits = event(), selection = event();
  const calls = [], closed = [], docs = new Map(), providers = new Map();
  const document = (uri) => {
    if (!docs.has(uri.toString())) {
      const ref = uri.query && JSON.parse(uri.query).ref;
      const text = ref === "base" ? "a\nremoved\nlast" : "a\nlast";
      docs.set(uri.toString(), { uri, text, getText() { return this.text; }, get lineCount() { return this.text.split("\n").length; }, lineAt(n) { return { text: this.text.split("\n")[n] }; } });
    }
    return docs.get(uri.toString());
  };
  const makeEditor = (uri, viewColumn = 1) => ({ document: document(uri), viewColumn, revealRange() { calls.push("reveal"); } });
  const vscode = {
    Uri, ViewColumn: { Beside: 2 }, TextEditorRevealType: { InCenterIfOutsideViewport: 1 },
    Position: class { constructor(line, character) { Object.assign(this, { line, character }); } },
    Range: class { constructor(start, c, end, ec) { this.start = { line: start, character: c }; this.end = { line: end, character: ec }; } },
    Location: class { constructor(uri, range) { Object.assign(this, { uri, range }); } },
    MarkdownString: class { constructor() { this.value = ""; } appendText(t) { this.value += t; } appendMarkdown(t) { this.value += t; } },
    workspace: {
      getConfiguration: (section) => ({ get: (key, fallback) => section === "diffEditor" && key === "useInlineViewWhenSpaceIsLimited" ? !sideBySide : settings[key] ?? fallback }),
      registerTextDocumentContentProvider(scheme, provider) { providers.set(scheme, provider); return { dispose() {} }; },
      openTextDocument: async (uri) => document(uri),
      onDidChangeConfiguration: config.listen, onDidChangeTextDocument: edits.listen,
    },
    window: {
      visibleTextEditors: [], onDidChangeVisibleTextEditors: visible.listen, onDidChangeTextEditorSelection: selection.listen,
      showWarningMessage: (message) => { throw new Error(message); },
      tabGroups: { all: [{ viewColumn: 2, tabs: [] }], async close(tab) { closed.push(tab); this.all[0].tabs = this.all[0].tabs.filter((t) => t !== tab); vscode.window.visibleTextEditors = vscode.window.visibleTextEditors.filter((e) => e.document.uri.toString() !== tab.input.uri.toString()); } },
      async showTextDocument(doc, options) {
        calls.push({ show: doc.uri, options });
        const ed = makeEditor(doc.uri, 2);
        this.visibleTextEditors.push(ed);
        this.tabGroups.all[0].tabs.push({ input: { uri: doc.uri }, isPreview: options.preview });
        return ed;
      },
    },
    commands: { async executeCommand(name, base, head) {
      calls.push(name);
      vscode.window.visibleTextEditors = [makeEditor(head), ...(sideBySide ? [makeEditor(base)] : [])];
    } },
  };
  const store = createIntentStore();
  const editor = { workspaceRoot: () => "/repo", absolute: (p) => `/repo/${p}`, applyAll() {}, reveal: async () => true,
    describe: (e) => ({ path: e.document.uri.fsPath.slice(6) }) };
  const git = { changedFiles: async () => [{ targetPath: "a.js", sourcePath: "old.js", status: "R" }],
    diffHunks: async () => [{ baseStart: 2, baseLen: 1, headStart: 1, headLen: 0 }],
    blobText: async (_, ref) => ref === "base" ? "a\nremoved\nlast" : "a\nlast" };
  const presentation = createPresentation(vscode, editor, store, () => null, git);
  const stop = { base: { sha: "base" }, head: { sha: "head" }, label: "change" };
  const anchor = { path: "a.js", side: "head", context: { startLine: 1, endLine: 2 }, contentHash: hashText("a\nlast"),
    focus: [{ side: "base", range: { startLine: 2, endLine: 2 } }, { side: "head", range: { startLine: 2, endLine: 2 } }] };
  return { presentation, store, vscode, calls, closed, anchor, stop, settings, visible, selection, edits, document, Uri };
}

test("inline focus opens a diff plus a marked companion with mapped rails and removed backgrounds", async (t) => {
  const f = fixture(); t.after(() => f.presentation.dispose());
  await f.presentation.activate(f.anchor, f.stop, "removed claim");
  assert.ok(f.calls.includes("vscode.diff"));
  const shown = f.calls.find((c) => c.show);
  assert.equal(JSON.parse(shown.show.query).kanko, "companion");
  assert.equal(JSON.parse(shown.show.query).path, "/repo/old.js");
  assert.equal(shown.options.preserveFocus, true);
  assert.deepEqual(f.store.paintFor("a.js", "base").context, [{ startLine: 1, endLine: 3 }]);
  assert.deepEqual(f.store.paintFor("a.js", "base").removedLines, [1]);
  assert.equal(f.store.paintFor("a.js", "head").seams[0].line, 1);
  assert.deepEqual(f.store.paintFor("other.js", "head").context, []);
  await f.presentation.reset(true);
  assert.equal(f.closed.length, 1);
});

test("side-by-side layout paints both sides without opening a companion", async (t) => {
  const f = fixture({ sideBySide: true }); t.after(() => f.presentation.dispose());
  await f.presentation.activate(f.anchor, f.stop, "claim", { claimIds: ["clm_1"] });
  assert.equal(f.calls.filter((c) => c.show).length, 0);
  assert.equal(f.store.paintFor("a.js", "head").seams.length, 0);
  assert.equal(f.store.paintFor("a.js", "base").focus.length, 1);
  assert.match(f.store.paintFor("a.js", "base").hover.value, /command:kanko.presentation.openClaim/);
  assert.deepEqual(f.store.paintFor("a.js", "base").hover.isTrusted.enabledCommands, ["kanko.presentation.openClaim"]);
});

test("seam preference uses an allowlisted peek link and no companion", async (t) => {
  const f = fixture({ settings: { removedCode: "seam" } }); t.after(() => f.presentation.dispose());
  await f.presentation.activate(f.anchor, f.stop, "claim");
  assert.equal(f.calls.filter((c) => c.show).length, 0);
  const seam = f.store.paintFor("a.js", "head").seams[0];
  assert.match(seam.hover.value, /command:editor.action.showReferences/);
  assert.deepEqual(seam.hover.isTrusted.enabledCommands, ["editor.action.showReferences"]);
});

test("pinned or moved companions are not closed and lifetime preferences are respected", async (t) => {
  for (const mode of ["pinned", "moved", "never", "onTourEnd"]) {
    const settings = { closeCompanion: ["never", "onTourEnd"].includes(mode) ? mode : "onBeatChange" };
    const f = fixture({ settings }); t.after(() => f.presentation.dispose());
    await f.presentation.activate(f.anchor, f.stop, "claim");
    if (mode === "pinned") f.vscode.window.tabGroups.all[0].tabs[0].isPreview = false;
    if (mode === "moved") f.vscode.window.tabGroups.all[0].viewColumn = 3;
    await f.presentation.reset();
    assert.equal(f.closed.length, 0, mode);
    await f.presentation.reset(true);
    assert.equal(f.closed.length, mode === "onTourEnd" ? 1 : 0, mode);
  }
});

test("detour replaces the beat, Return restores it, and stale context suppresses fallback", async (t) => {
  const f = fixture({ sideBySide: true }); t.after(() => f.presentation.dispose());
  await f.presentation.activate(f.anchor, f.stop, "claim");
  const detour = { ...f.anchor, focus: [], context: { startLine: 1, endLine: 1 }, contentHash: hashText("a") };
  await f.presentation.detour(detour, f.stop, "detour");
  assert.equal(f.store.state(), "detour");
  assert.equal(f.store.paintFor("a.js", "head").focus.length, 0);
  await f.presentation.returnFromDetour();
  assert.equal(f.store.state(), "following");
  assert.equal(f.store.paintFor("a.js", "head").label, "claim");
  await f.presentation.activate({ ...f.anchor, contentHash: hashText("wrong") }, f.stop, "stale");
  assert.equal(f.presentation.status().stale, true);
  assert.equal(f.store.state(), "stale");
});

test("worktree edits are rehashed after debounce, even when line counts stay the same", async (t) => {
  const f = fixture(); t.after(() => f.presentation.dispose());
  const a = { path: "a.js", side: "worktree", context: { startLine: 1, endLine: 2 }, contentHash: hashText("a\nlast"), focus: [{ side: "head", range: { startLine: 2, endLine: 2 } }] };
  await f.presentation.activate(a, null, "claim");
  const doc = f.document(f.Uri.file("/repo/a.js"));
  doc.text = "a\nedit";
  f.edits.fire({ document: doc });
  await new Promise((r) => setTimeout(r, 350));
  assert.equal(f.store.state(), "stale");
});
