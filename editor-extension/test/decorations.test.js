const { test } = require("node:test");
const assert = require("node:assert");
const { createIntentStore } = require("../lib/decorations.js");

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
  assert.deepStrictEqual(s.pendingPaths(), []);
});

test("every stop path starts pending and leaves on markApplied", () => {
  const s = createIntentStore();
  s.setStop(stop);
  assert.deepStrictEqual(s.pendingPaths().sort(), ["a.go", "b.go"]);
  s.markApplied("a.go");
  assert.deepStrictEqual(s.pendingPaths(), ["b.go"]);
});

test("markApplied for an unknown path is harmless", () => {
  const s = createIntentStore();
  s.setStop(stop);
  s.markApplied("nope.go");
  assert.deepStrictEqual(s.pendingPaths().sort(), ["a.go", "b.go"]);
});

test("setFocus without a stop still yields the focus range", () => {
  const s = createIntentStore();
  s.setFocus({ path: "a.go", side: "working", startLine: 4, endLine: 4 });
  assert.deepStrictEqual(s.rangesFor({ path: "a.go", side: "working" }).focus, { startLine: 4, endLine: 4, note: undefined });
});
