const { test } = require("node:test");
const assert = require("node:assert");
const { formatCitation, selectedLines, shortRef } = require("../lib/citation.js");

const selection = (startLine, startCharacter, endLine, endCharacter) => ({
  isEmpty: startLine === endLine && startCharacter === endCharacter,
  start: { line: startLine, character: startCharacter },
  end: { line: endLine, character: endCharacter },
});

test("formats a working-tree range without agent-specific syntax", () => {
  assert.strictEqual(
    formatCitation({ path: "editor-extension/lib/editor.js", side: "working", ref: null, selection: selection(55, 0, 69, 1) }),
    "editor-extension/lib/editor.js:56-70"
  );
});

test("formats a single selected line without a redundant range", () => {
  assert.strictEqual(
    formatCitation({ path: "main.go", side: "working", ref: null, selection: selection(11, 2, 11, 8) }),
    "main.go:12"
  );
});

test("excludes the unselected line at a column-zero multiline endpoint", () => {
  assert.deepStrictEqual(selectedLines(selection(2, 0, 5, 0)), { startLine: 3, endLine: 5 });
});

test("includes pinned side and abbreviated revision for a walkthrough diff", () => {
  assert.strictEqual(
    formatCitation({ path: "pkg/review.go", side: "base", ref: "a1b2c3d4e5f6", selection: selection(3, 0, 4, 2) }),
    "pkg/review.go:4-5 [base@a1b2c3d]"
  );
});

test("normalizes Windows separators for portable citations", () => {
  assert.strictEqual(
    formatCitation({ path: "pkg\\review.go", side: "working", ref: null, selection: selection(0, 0, 0, 2) }),
    "pkg/review.go:1"
  );
});

test("preserves a symbolic revision", () => {
  assert.strictEqual(shortRef("HEAD~1"), "HEAD~1");
});

test("rejects an empty selection", () => {
  assert.throws(
    () => formatCitation({ path: "main.go", side: "working", ref: null, selection: selection(2, 4, 2, 4) }),
    (err) => err.code === "no_selection"
  );
});
