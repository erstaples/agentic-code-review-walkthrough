import type { TestContext } from "node:test";
import type { Uri, Tab, TextDocument, TextDocumentShowOptions } from "vscode";
import type { OpenerApi } from "../src/host/native.js";
import { anchor as makeAnchor } from "./factories.js";
import { decorationFixture } from "./decoration-fixture.js";
import { present, record } from "../../test/assertions.js";
type FakeInput = { uri?: Uri; modified?: Uri; original?: Uri };
type FakeTab = Tab & { input: FakeInput };
type FakeGroup = {
  viewColumn: number;
  tabs: FakeTab[];
  activeTab: FakeTab | null;
};
import test = require("node:test");
import assert = require("node:assert/strict");
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { createAnchorOpener } from "../src/host/anchor-opener.js";
import { sourceHunks } from "../src/host/source-diff.js";
import { createDecorationRegistry } from "../src/host/decoration-registry.js";
function fixture(t: TestContext) {
  const workspace = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "kanko-opener-")),
  );
  t.after(() => fs.rmSync(workspace, { recursive: true, force: true }));
  fs.writeFileSync(path.join(workspace, "a.js"), "head\n");
  const uri = (scheme: string, value: string, query = ""): Uri => ({
    with: (changes) => Object.assign(uri(scheme, value, query), changes),
    toJSON: () => ({ scheme, path: value, query }),
    scheme,
    authority: "",
    fragment: "",
    path: value,
    fsPath: value,
    query,
    toString() {
      return `${scheme}:${value}?${query}`;
    },
  });
  const groups: FakeGroup[] = [{ viewColumn: 1, tabs: [], activeTab: null }];
  const textDocuments: Pick<TextDocument, "uri" | "getText">[] = [],
    closed: Tab[] = [],
    handlers: (() => void)[] = [];
  const event = (fn: () => void) => {
    handlers.push(fn);
    return { dispose() {} };
  };
  const emit = () => handlers.forEach((f) => f());
  const vscode = {
    Uri: {
      file: (p: string) => uri("file", p),
      from: (o: { scheme: string; path: string; query?: string }) =>
        uri(o.scheme, o.path, o.query),
    },
    ViewColumn: { Beside: -2 },
    workspace: {
      textDocuments,
      registerTextDocumentContentProvider: () => ({ dispose() {} }),
      openTextDocument: async (uri: Uri) => ({ uri }),
    },
    window: {
      tabGroups: {
        all: groups,
        onDidChangeTabs: event,
        onDidChangeTabGroups: event,
        close: async (tab: Tab) => {
          closed.push(tab);
          for (const g of groups) g.tabs = g.tabs.filter((t) => t !== tab);
          emit();
        },
      },
      showTextDocument: async (
        doc: { uri: Uri },
        options: TextDocumentShowOptions,
      ) => show({ uri: doc.uri }, options),
    },
    commands: {
      executeCommand: async (
        _: string,
        original: Uri,
        modified: Uri,
        _label: string,
        options: TextDocumentShowOptions,
      ) => show({ original, modified }, options),
    },
  };
  function show(input: FakeInput, options: TextDocumentShowOptions) {
    let g = groups.find((g) => g.viewColumn === options.viewColumn);
    if (!g) {
      g = { viewColumn: groups.length + 1, tabs: [], activeTab: null };
      groups.push(g);
    }
    let tab = g.tabs.find(
      (t) =>
        present(t.input.uri || t.input.modified).toString() ===
        present(input.uri || input.modified).toString(),
    );
    if (!tab) {
      const old = g.tabs.find((t) => t.isPreview);
      if (old) g.tabs = g.tabs.filter((t) => t !== old);
      tab = {
        input,
        isPreview: true,
        isPinned: false,
        isDirty: false,
        isActive: true,
        label: "Test",
        group: g as unknown as Tab["group"],
      };
      g.tabs.push(tab);
    }
    g.activeTab = tab;
    emit();
    return { viewColumn: g.viewColumn };
  }
  const opener = createAnchorOpener(vscode as unknown as OpenerApi);
  t.after(() => opener.dispose());
  const anchor = makeAnchor({
    n: 1,
    path: "a.js",
    view: "head",
    rev: { base: "a".repeat(40), head: "b".repeat(40) },
  });
  const state = {
    workspace,
    identity: "snapshot",
    texts: new Map([["a.js", { base: "base\n", head: "head\n" }]]),
  };
  return {
    workspace,
    vscode,
    groups,
    textDocuments,
    opener,
    anchor,
    state,
    closed,
    emit,
    show,
  };
}
test("real head files require matching disk and open buffer; symlinks and drift stay immutable", (t) => {
  const f = fixture(t);
  let r = f.opener.describe(f.state, f.anchor);
  assert.equal(r.head.scheme, "file");
  f.textDocuments.push({ uri: r.head, getText: () => "unsaved\n" });
  assert.equal(f.opener.describe(f.state, f.anchor).head.scheme, "kanko-rev");
  f.textDocuments.length = 0;
  fs.writeFileSync(path.join(f.workspace, "a.js"), "changed\n");
  assert.equal(f.opener.describe(f.state, f.anchor).head.scheme, "kanko-rev");
  fs.renameSync(
    path.join(f.workspace, "a.js"),
    path.join(f.workspace, "target"),
  );
  fs.symlinkSync("target", path.join(f.workspace, "a.js"));
  assert.equal(f.opener.describe(f.state, f.anchor).head.scheme, "kanko-rev");
});
test("existing reviewer tabs are reused in their group and never adopted or closed", async (t) => {
  const f = fixture(t),
    r = f.opener.describe(f.state, f.anchor);
  f.show({ uri: r.head }, { viewColumn: 1 });
  const user = f.groups[0].activeTab;
  const first = present(await f.opener.open(r, 1, { focus: true }));
  const second = present(await f.opener.open(r, 1));
  assert.equal(first.tab, user);
  assert.equal(second.tab, user);
  assert.equal(f.groups.length, 1);
  assert.equal(f.opener.disposable(present(user)), false);
  await f.opener.closeExcept(() => false);
  assert.equal(f.closed.length, 0);
});
test("cleanup closes only untouched owned previews; adoption is permanent", async (t) => {
  const f = fixture(t),
    r = f.opener.describe(f.state, f.anchor);
  let entry = present(await f.opener.open(r, 1));
  await f.opener.closeExcept(() => false);
  assert.deepEqual(f.closed, [entry.tab]);
  for (const kind of ["pin", "dirty", "move"]) {
    entry = present(await f.opener.open(r, 1));
    const tab = entry.tab;
    if (kind === "pin") Object.assign(tab, { isPreview: false });
    if (kind === "dirty") Object.assign(tab, { isDirty: true });
    if (kind === "move") f.groups[0].viewColumn = 9;
    f.emit();
    Object.assign(tab, { isPreview: true });
    Object.assign(tab, { isDirty: false });
    f.groups[0].viewColumn = 1;
    await f.opener.closeExcept(() => false);
    assert.ok(!f.closed.includes(tab));
    f.groups[0].tabs = [];
    f.groups[0].activeTab = null;
    f.emit();
  }
});
test("opener rejects a protected preview and an unallocated group", async (t) => {
  const f = fixture(t);
  f.show(
    { uri: f.vscode.Uri.file(path.join(f.workspace, "reviewer.js")) },
    { viewColumn: 1 },
  );
  const user = f.groups[0].activeTab,
    r = f.opener.describe(f.state, f.anchor);
  assert.equal(await f.opener.open(r, 1), null);
  assert.ok(f.groups[0].tabs.includes(present(user)));
  const next = {
    ...r,
    target: f.vscode.Uri.file(path.join(f.workspace, "other.js")),
    head: f.vscode.Uri.file(path.join(f.workspace, "other.js")),
  };
  assert.equal(await f.opener.open(next, 4), null);
  assert.equal(f.groups.length, 1);
});
test("captured-text hunks place removed-code seams independent of repository changes", () => {
  assert.deepEqual(
    sourceHunks({ base: "one\nremoved\nthree\n", head: "one\nthree\n" }),
    [{ baseStart: 2, baseLen: 1, headStart: 1, headLen: 0 }],
  );
});
test("the registry reuses six palette sets, keeps distinct colors, and disposes them", () => {
  const { api: vscode, created, decoration } = decorationFixture();
  const registry = createDecorationRegistry(vscode),
    first = registry.forAnchor(1);
  assert.equal(registry.forAnchor(7), first);
  assert.equal(
    record(decoration(first.types.rail).options.borderColor).id,
    "kanko.anchor1",
  );
  assert.equal(
    record(decoration(registry.forAnchor(2).types.boxOne).options.borderColor)
      .id,
    "kanko.anchor2",
  );
  for (let n = 1; n <= 99; n++) registry.forAnchor(n);
  assert.equal(created.length, Object.keys(first.types).length * 6);
  registry.dispose();
  assert.ok(created.every((t) => t.disposed));
});
test("a removed-code companion uses a new third column, never the occupied adjacent one", async (t) => {
  const f = fixture(t),
    r = f.opener.describe(f.state, f.anchor);
  f.groups.push(
    { viewColumn: 2, tabs: [], activeTab: null },
    { viewColumn: 3, tabs: [], activeTab: null },
  );
  await f.opener.open(r, 1);
  const otherUri = f.vscode.Uri.file(path.join(f.workspace, "other.js"));
  await f.opener.open({ ...r, target: otherUri, head: otherUri }, 2);
  const result = present(await f.opener.open(r, 3, { companion: true }));
  assert.equal(result.column, 3);
  assert.equal(f.groups.length, 3);
  assert.ok(
    f.groups[1].tabs.some(
      (t) => present(t.input.uri).toString() === otherUri.toString(),
    ),
  );
});
