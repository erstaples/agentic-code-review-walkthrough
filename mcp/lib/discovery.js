"use strict";

const nodePath = require("node:path");

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function contains(folder, cwd) {
  const a = nodePath.resolve(folder);
  const b = nodePath.resolve(cwd);
  return b === a || b.startsWith(a.endsWith(nodePath.sep) ? a : a + nodePath.sep);
}

function defaultIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

function resolveLock({ dir, cwd, fs = require("node:fs"), isAlive = defaultIsAlive, protocolVersion }) {
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
      lock = JSON.parse(fs.readFileSync(full, "utf8"));
    } catch {
      continue;
    }
    if (!isAlive(lock.pid)) {
      try { fs.unlinkSync(full); } catch { /* another process may have won the race */ }
      continue;
    }
    if (lock.protocolVersion !== protocolVersion) {
      mismatch = lock;
      continue;
    }
    for (const folder of lock.workspaceFolders || []) {
      if (contains(folder, cwd)) candidates.push({ lock, depth: nodePath.resolve(folder).length });
    }
  }

  if (candidates.length === 0) {
    if (mismatch) {
      throw fail("protocol_mismatch",
        `tour bridge speaks protocol ${mismatch.protocolVersion}, this plugin speaks ${protocolVersion}. Update whichever is older.`);
    }
    throw fail("no_bridge",
      `folder ${cwd} is not open in any VS Code window with the tour bridge. Install the codewalk extension and open this folder.`);
  }

  const deepest = Math.max(...candidates.map((c) => c.depth));
  const winners = candidates.filter((c) => c.depth === deepest);
  if (winners.length > 1) {
    const folders = winners.map((w) => w.lock.workspaceFolders.join(", ")).join(" | ");
    throw fail("ambiguous_bridge",
      `more than one VS Code window claims ${cwd}: ${folders}. Close one, or run from inside the window you want.`);
  }

  return winners[0].lock;
}

module.exports = { resolveLock, defaultIsAlive };
