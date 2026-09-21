"use strict";

const fs = require("node:fs");
const path = require("node:path");

function writeLock(dir, info) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${info.port}.lock`);
  fs.writeFileSync(file, JSON.stringify(info), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return file;
}

function removeLock(file) {
  try {
    fs.unlinkSync(file);
  } catch {
    // Already gone, or never written. Deactivation must not throw.
  }
}

module.exports = { writeLock, removeLock };
