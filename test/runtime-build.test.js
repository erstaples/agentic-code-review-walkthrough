const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

test("runtime generation detects modified, missing and obsolete output without rewriting it", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kanko-runtime-"));
  const script = path.resolve(__dirname, "../scripts/build-runtime.mjs");
  const run = (mode) =>
    spawnSync(process.execPath, [script, mode, "--output-dir", directory], {
      encoding: "utf8",
    });
  try {
    const written = run("--write");
    assert.equal(written.status, 0, written.stderr);
    assert.equal(run("--check").status, 0);
    const filename = path.join(directory, "shared/protocol.js");
    const original = fs.readFileSync(filename, "utf8");
    fs.writeFileSync(filename, original + "// stale\n");
    assert.equal(run("--check").status, 1);
    assert.equal(fs.readFileSync(filename, "utf8"), original + "// stale\n");
    fs.unlinkSync(filename);
    assert.equal(run("--check").status, 1);
    assert.equal(fs.existsSync(filename), false);
    fs.writeFileSync(filename, original);
    fs.writeFileSync(path.join(directory, "obsolete.js"), "");
    assert.equal(run("--check").status, 1);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
