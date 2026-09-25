"use strict";

const { createHash } = require("node:crypto");
const hashText = (text) =>
  `sha256:${createHash("sha256").update(text).digest("hex")}`;
const validRange = (r) =>
  r &&
  Number.isInteger(r.startLine) &&
  Number.isInteger(r.endLine) &&
  r.startLine > 0 &&
  r.endLine >= r.startLine;

function normalizeAnchor(anchor) {
  const context = anchor.context || anchor.range;
  if (!validRange(context))
    throw new Error("anchor context must be a 1-based inclusive range");
  if (!["base", "head", "worktree", "working"].includes(anchor.side))
    throw new Error("invalid anchor side");
  const focus = anchor.focus || [];
  if (
    !Array.isArray(focus) ||
    focus.some(
      (f) => !["base", "head"].includes(f.side) || !validRange(f.range),
    )
  )
    throw new Error("invalid focus span");
  const { range, ...rest } = anchor;
  return {
    ...rest,
    context: { ...context },
    focus: focus.map((f) => ({ ...f, range: { ...f.range } })),
  };
}

function rangeText(text, range) {
  const lines = text.split("\n");
  return range.endLine > lines.length
    ? null
    : lines.slice(range.startLine - 1, range.endLine).join("\n");
}

// Focus baselines belong to the presentation session, not the review map's
// context hash. Call again on activation and after worktree edits.
async function checkAnchor(anchor, readText, baseline = []) {
  const a = normalizeAnchor(anchor);
  const texts = new Map();
  for (const side of new Set([a.side, ...a.focus.map((f) => f.side)]))
    texts.set(side, await readText(side, a.rev));
  const context = rangeText(texts.get(a.side), a.context);
  const hashes = a.focus.map((f) => {
    const text = rangeText(texts.get(f.side), f.range);
    return text === null ? null : hashText(text);
  });
  const stale =
    context === null ||
    (a.contentHash && hashText(context) !== a.contentHash) ||
    hashes.some(
      (h, i) =>
        h === null ||
        ((a.focus[i].contentHash || baseline[i]) &&
          h !== (a.focus[i].contentHash || baseline[i])),
    );
  return { anchor: a, stale: Boolean(stale), focusHashes: hashes };
}

module.exports = { normalizeAnchor, checkAnchor, hashText, rangeText };
