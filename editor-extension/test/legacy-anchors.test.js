const test = require("node:test");
const assert = require("node:assert/strict");
const {
  normalizeAnchor,
  checkAnchor,
  hashText,
} = require("./legacy/anchors.js");
test("legacy anchors become rail-only context without altering their hash", () => {
  const a = {
    path: "a.js",
    side: "head",
    range: { startLine: 1, endLine: 2 },
    contentHash: hashText("a\nb"),
  };
  const result = normalizeAnchor(a);
  assert.deepEqual(result.context, a.range);
  assert.deepEqual(result.focus, []);
  assert.equal(result.contentHash, a.contentHash);
  assert.equal(result.range, undefined);
  assert.ok(a.range);
});

test("focus hashes detect drift independently from unchanged context", async () => {
  const a = {
    path: "a.js",
    side: "head",
    context: { startLine: 1, endLine: 1 },
    contentHash: hashText("same"),
    focus: [{ side: "base", range: { startLine: 1, endLine: 1 } }],
  };
  const first = await checkAnchor(a, async (side) =>
    side === "head" ? "same" : "old",
  );
  assert.equal(first.stale, false);
  const next = await checkAnchor(
    a,
    async (side) => (side === "head" ? "same" : "changed"),
    first.focusHashes,
  );
  assert.equal(next.stale, true);
  assert.equal(
    (
      await checkAnchor(
        { ...a, context: { startLine: 1, endLine: 3 } },
        async () => "short",
      )
    ).stale,
    true,
  );
});
