const { test } = require("node:test");
const assert = require("node:assert");
const { createIntentStore } = require("./compiled.js")("lib/decorations.js");

const stop = {
  stopId: "s2",
  files: [
    { path: "a.go", ranges: [{ side: "head", startLine: 12, endLine: 48 }, { side: "base", startLine: 3, endLine: 5 }] },
    { path: "b.go", ranges: [{ side: "working", startLine: 1, endLine: 2 }] },
  ],
};

test("returns only the ranges matching the editor's path and side", () => {
  const s = createIntentStore();
  s.setStop(stop);
  assert.deepStrictEqual(s.rangesFor({ path: "a.go", side: "head" }).stop, [{ startLine: 12, endLine: 48 }]);
  assert.deepStrictEqual(s.rangesFor({ path: "a.go", side: "base" }).stop, [{ startLine: 3, endLine: 5 }]);
});

test("an editor not in the stop gets nothing", () => {
  const s = createIntentStore();
  s.setStop(stop);
  assert.deepStrictEqual(s.rangesFor({ path: "z.go", side: "head" }), { stop: [], focus: null });
});

test("focus is returned only for its own path and side", () => {
  const s = createIntentStore();
  s.setStop(stop);
  s.setFocus({ path: "a.go", side: "head", startLine: 31, endLine: 35, note: "capped here" });
  const hit = s.rangesFor({ path: "a.go", side: "head" });
  assert.deepStrictEqual(hit.focus, { startLine: 31, endLine: 35, note: "capped here" });
  assert.strictEqual(s.rangesFor({ path: "a.go", side: "base" }).focus, null);
});

test("a new stop replaces the previous stop and clears focus", () => {
  const s = createIntentStore();
  s.setStop(stop);
  s.setFocus({ path: "a.go", side: "head", startLine: 31, endLine: 35 });
  s.setStop({ stopId: "s3", files: [{ path: "c.go", ranges: [{ side: "head", startLine: 1, endLine: 1 }] }] });
  assert.deepStrictEqual(s.rangesFor({ path: "a.go", side: "head" }), { stop: [], focus: null });
  assert.deepStrictEqual(s.rangesFor({ path: "c.go", side: "head" }).stop, [{ startLine: 1, endLine: 1 }]);
});

test("clear drops everything", () => {
  const s = createIntentStore();
  s.setStop(stop);
  s.clear();
  assert.deepStrictEqual(s.rangesFor({ path: "a.go", side: "head" }), { stop: [], focus: null });
  assert.deepStrictEqual(s.pending(), []);
});

const byKey = (list) => list.map((p) => `${p.side}:${p.path}`).sort();

test("every (path, side) pair the stop asked for starts pending and leaves on markApplied", () => {
  const s = createIntentStore();
  s.setStop(stop);
  assert.deepStrictEqual(byKey(s.pending()), ["base:a.go", "head:a.go", "working:b.go"]);
  s.markApplied("a.go", "head");
  assert.deepStrictEqual(byKey(s.pending()), ["base:a.go", "working:b.go"]);
});

test("markApplied for an unknown path is harmless", () => {
  const s = createIntentStore();
  s.setStop(stop);
  s.markApplied("nope.go", "head");
  assert.deepStrictEqual(byKey(s.pending()), ["base:a.go", "head:a.go", "working:b.go"]);
});

// Regression: a file carrying both a base and a head range must not be
// reported as fully applied just because one of its two sides decorated.
test("a file pending on both sides stays pending on the other side after one side applies", () => {
  const s = createIntentStore();
  s.setStop(stop);
  s.markApplied("a.go", "head");
  assert.deepStrictEqual(byKey(s.pending()), ["base:a.go", "working:b.go"]);
  assert.ok(s.pending().some((p) => p.path === "a.go" && p.side === "base"), "a.go's base side must still be pending");
});

test("setFocus without a stop still yields the focus range", () => {
  const s = createIntentStore();
  s.setFocus({ path: "a.go", side: "working", startLine: 4, endLine: 4 });
  assert.deepStrictEqual(s.rangesFor({ path: "a.go", side: "working" }).focus, { startLine: 4, endLine: 4, note: undefined });
});

test("currentFocus returns null before any setFocus", () => {
  const s = createIntentStore();
  assert.strictEqual(s.currentFocus(), null);
});

test("currentFocus returns the focus fields after setFocus", () => {
  const s = createIntentStore();
  s.setFocus({ path: "a.go", side: "head", startLine: 31, endLine: 35, note: "test note" });
  assert.deepStrictEqual(s.currentFocus(), { path: "a.go", side: "head", startLine: 31, endLine: 35, note: "test note" });
});

test("mutating currentFocus return value does not change subsequent calls", () => {
  const s = createIntentStore();
  s.setFocus({ path: "a.go", side: "head", startLine: 31, endLine: 35, note: "original" });
  const first = s.currentFocus();
  first.note = "mutated";
  const second = s.currentFocus();
  assert.strictEqual(second.note, "original");
});

test("setStop clears currentFocus back to null", () => {
  const s = createIntentStore();
  s.setFocus({ path: "a.go", side: "head", startLine: 31, endLine: 35 });
  assert.notStrictEqual(s.currentFocus(), null);
  s.setStop(stop);
  assert.strictEqual(s.currentFocus(), null);
});
