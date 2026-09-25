"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createPresenter } = require("./compiled.js")("lib/presenter.js");
const { normalizeAnchor, checkAnchor, hashText } = require("./compiled.js")("lib/anchors.js");
const { parseHunks, seamLineFor, removedBaseLines0, mapRange } = require("./compiled.js")("lib/hunks.js");

function fixture() {
  const vscode = {
    ThemeColor: class { constructor(id) { this.id = id; } },
    Range: class { constructor(start, c, end, ec) { this.start = { line: start, character: c }; this.end = { line: end, character: ec }; } },
    OverviewRulerLane: { Left: 1 },
    window: { createTextEditorDecorationType(options) { return { options, disposed: false, dispose() { this.disposed = true; } }; } },
  };
  const calls = new Map();
  const texts = ["long first line", "x", "third", "outside", "last"];
  const editor = { document: { lineCount: texts.length, lineAt: (i) => ({ text: texts[i] }) }, setDecorations: (t, rs) => calls.set(t, rs) };
  return { presenter: createPresenter(vscode), calls, editor };
}

test("presenter preserves diff backgrounds and uses text-only dimming", () => {
  const { presenter: p, calls, editor } = fixture();
  for (const [name, t] of Object.entries(p.types)) if (name !== "companionRemoved") assert.equal(t.options.backgroundColor, undefined);
  assert.equal(p.types.companionRemoved.options.backgroundColor.id, "diffEditor.removedLineBackground");
  p.paint(editor, { context: [{ startLine: 1, endLine: 5 }], focus: [{ startLine: 1, endLine: 3 }], label: "claim", state: "following" });
  assert.deepEqual(calls.get(p.types.dim).map((r) => r.start.line), [3, 4]);
  assert.equal(calls.get(p.types.label)[0].range.start.line, 1);
  assert.equal(calls.get(p.types.boxTop)[0].range.start.line, 0);
  assert.equal(calls.get(p.types.boxMid)[0].range.start.line, 1);
  assert.equal(calls.get(p.types.boxBot)[0].range.start.line, 2);
});

test("state changes clear old paint, retain rails, and suppress stale focus", () => {
  const { presenter: p, calls, editor } = fixture();
  const paint = { context: [{ startLine: 1, endLine: 5 }], focus: [{ startLine: 2, endLine: 2 }], label: "claim" };
  for (const state of ["following", "exploring", "paused", "detour", "stale"]) {
    p.paint(editor, { ...paint, state });
    assert.equal(calls.get(p.types.dim).length > 0, state === "following");
    assert.equal(calls.get(p.types.label).length > 0, state !== "exploring");
    assert.equal(calls.get(p.types.boxOne).length, state === "stale" ? 0 : 1);
    assert.equal(calls.get(state === "stale" ? p.types.railStale : p.types.rail).length, 5);
  }
  p.paint(editor, { context: paint.context, state: "following" });
  assert.equal(calls.get(p.types.dim).length, 0);
  assert.equal(calls.get(p.types.label).length, 0);
});

test("EOF seams use bottom borders; configuration replaces and disposes dim", () => {
  const { presenter: p, calls, editor } = fixture();
  const old = p.types.dim;
  p.configure(1);
  assert.ok(old.disposed);
  p.paint(editor, { state: "following", context: [{ startLine: 1, endLine: 5 }], focus: [{ startLine: 1, endLine: 1 }], seams: [{ line: 5, label: "removed" }] });
  assert.equal(calls.get(p.types.seam).length, 0);
  assert.equal(calls.get(p.types.seamBottom)[0].range.start.line, 4);
  assert.equal(calls.get(p.types.dim).length, 0);
  p.dispose();
  assert.ok(Object.values(p.types).every((t) => t.disposed));
});

test("zero-context hunks map deletions, replacements, insertions, and renames", () => {
  const hunks = parseHunks("diff --git a/old b/new\n@@ -2,2 +1,0 @@\n-old\n@@ -6 +4,2 @@\n@@ -9,0 +9 @@\n");
  assert.equal(seamLineFor(1, hunks), 1);
  assert.equal(seamLineFor(5, hunks), 3);
  assert.equal(seamLineFor(0, hunks), undefined);
  assert.deepEqual(removedBaseLines0(hunks), [1, 2, 5]);
  assert.deepEqual(mapRange({ startLine: 4, endLine: 5 }, hunks, "base"), { startLine: 2, endLine: 3 });
  assert.deepEqual(mapRange({ startLine: 2, endLine: 3 }, hunks, "head"), { startLine: 4, endLine: 5 });
});

test("legacy anchors become rail-only context without altering their hash", () => {
  const a = { path: "a.js", side: "head", range: { startLine: 1, endLine: 2 }, contentHash: hashText("a\nb") };
  const result = normalizeAnchor(a);
  assert.deepEqual(result.context, a.range);
  assert.deepEqual(result.focus, []);
  assert.equal(result.contentHash, a.contentHash);
  assert.equal(result.range, undefined);
  assert.ok(a.range);
});

test("focus hashes detect drift independently from unchanged context", async () => {
  const a = { path: "a.js", side: "head", context: { startLine: 1, endLine: 1 }, contentHash: hashText("same"), focus: [{ side: "base", range: { startLine: 1, endLine: 1 } }] };
  const first = await checkAnchor(a, async (side) => side === "head" ? "same" : "old");
  assert.equal(first.stale, false);
  const next = await checkAnchor(a, async (side) => side === "head" ? "same" : "changed", first.focusHashes);
  assert.equal(next.stale, true);
  assert.equal((await checkAnchor({ ...a, context: { startLine: 1, endLine: 3 } }, async () => "short")).stale, true);
});
