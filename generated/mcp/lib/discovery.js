// Generated from TypeScript. Run npm run runtime:build in editor-extension.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveLock = resolveLock;
exports.defaultIsAlive = defaultIsAlive;
const nodeFs = require("node:fs");
const input_js_1 = require("./input.js");
function isLock(value) {
  return (
    (0, input_js_1.isRecord)(value) &&
    typeof value.pid === "number" &&
    typeof value.port === "number" &&
    typeof value.authToken === "string" &&
    typeof value.protocolVersion === "number" &&
    Array.isArray(value.workspaceFolders) &&
    value.workspaceFolders.every((folder) => typeof folder === "string")
  );
}
const nodePath = require("node:path");
function fail(code, message) {
  const err = Object.assign(new Error(message), { code });
  return err;
}
function contains(folder, cwd) {
  const a = nodePath.resolve(folder);
  const b = nodePath.resolve(cwd);
  return (
    b === a || b.startsWith(a.endsWith(nodePath.sep) ? a : a + nodePath.sep)
  );
}
function defaultIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (0, input_js_1.errorFields)(err).code === "EPERM";
  }
}
function resolveLock({
  dir,
  cwd,
  fs = nodeFs,
  isAlive = defaultIsAlive,
  protocolVersion,
}) {
  let names;
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith(".lock"));
  } catch {
    names = [];
  }
  const candidates = [];
  let mismatch = null;
  for (const name of names) {
    const full = nodePath.join(dir, name);
    let lock;
    try {
      const parsed = JSON.parse(fs.readFileSync(full, "utf8"));
      if (!isLock(parsed)) continue;
      lock = parsed;
    } catch {
      continue;
    }
    if (!isAlive(lock.pid)) {
      try {
        fs.unlinkSync(full);
      } catch {
        /* another process may have won the race */
      }
      continue;
    }
    if (lock.protocolVersion !== protocolVersion) {
      mismatch = lock;
      continue;
    }
    for (const folder of lock.workspaceFolders || []) {
      if (contains(folder, cwd))
        candidates.push({ lock, depth: nodePath.resolve(folder).length });
    }
  }
  if (candidates.length === 0) {
    if (mismatch) {
      throw fail(
        "protocol_mismatch",
        `tour bridge speaks protocol ${mismatch.protocolVersion}, this plugin speaks ${protocolVersion}. Update whichever is older.`,
      );
    }
    throw fail(
      "no_bridge",
      `folder ${cwd} is not open in any VS Code window with the tour bridge. Install the Kankō extension and open this folder.`,
    );
  }
  const deepest = Math.max(...candidates.map((c) => c.depth));
  const winners = candidates.filter((c) => c.depth === deepest);
  if (winners.length > 1) {
    const folders = winners
      .map((w) => w.lock.workspaceFolders.join(", "))
      .join(" | ");
    throw fail(
      "ambiguous_bridge",
      `more than one VS Code window claims ${cwd}: ${folders}. Close one, or run from inside the window you want.`,
    );
  }
  return winners[0].lock;
}
