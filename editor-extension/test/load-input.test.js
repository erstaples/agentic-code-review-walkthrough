"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { isReviewChange, isClaimSummary } = require("./compiled.js")(
  "src/host/load-input.js",
);
const { tabInput } = require("./compiled.js")("src/host/native.js");

test("load metadata is checked before it reaches source readers", () => {
  const change = {
    manifestDigest: "digest",
    manifest: {
      kind: "working-tree",
      baselineCommit: "base",
      currentHead: "head",
      files: [
        {
          path: "a.ts",
          staged: true,
          indexEntry: { stage: 0, blob: "blob" },
          working: { digest: "bytes" },
        },
      ],
    },
  };
  assert.equal(isReviewChange(change), true);
  for (const value of [
    null,
    [],
    {},
    { ...change, manifest: null },
    { ...change, manifestDigest: 3 },
    { ...change, manifest: { files: [null] } },
  ]) {
    assert.equal(isReviewChange(value), false);
  }
  for (const field of [
    { path: 4 },
    { path: "a.ts", working: [] },
    { path: "a.ts", indexEntry: { stage: "0" } },
    { path: "a.ts", staged: "yes" },
  ]) {
    assert.equal(
      isReviewChange({
        ...change,
        manifest: { ...change.manifest, files: [field] },
      }),
      false,
    );
  }
  assert.equal(
    isClaimSummary({
      id: "claim",
      truthStatus: "observed",
      extra: { kept: true },
    }),
    true,
  );
  for (const value of [
    null,
    [],
    "claim",
    { id: 1 },
    { id: "claim", truthStatus: false },
  ])
    assert.equal(isClaimSummary(value), false);
});

test("tab inputs distinguish text and diff URIs from other editors", () => {
  const uri = { toString: () => "file:a.ts" };
  assert.deepEqual(tabInput(undefined), {});
  assert.deepEqual(tabInput({ input: { viewType: "custom" } }), {});
  assert.equal(tabInput({ input: { uri } }).uri, uri);
  const diff = { original: uri, modified: uri };
  assert.equal(tabInput({ input: diff }).original, uri);
  assert.equal(tabInput({ input: diff }).modified, uri);
});
