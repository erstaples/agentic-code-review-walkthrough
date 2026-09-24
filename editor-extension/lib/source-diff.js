"use strict";
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { parseHunks } = require("./hunks.js");

// Compare captured bytes, including staged-only snapshots and renamed paths.
// Reading the current Git index here could misplace a removal seam after drift.
function sourceHunks({ base, head }) {
  if (base === head) return [];
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kanko-diff-"));
  try {
    const left = path.join(root, "base"), right = path.join(root, "head");
    fs.writeFileSync(left, base ?? ""); fs.writeFileSync(right, head ?? "");
    let output;
    try { output = execFileSync("git", ["diff", "--no-index", "--no-ext-diff", "--no-textconv", "--no-color", "--text", "-U0", "--", left, right], { encoding: "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }); }
    catch (error) { if (error.status !== 1) throw error; output = error.stdout; }
    return parseHunks(output);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}
module.exports = { sourceHunks };
