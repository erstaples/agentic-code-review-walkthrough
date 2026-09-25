import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

test("runtime generation detects modified, missing and obsolete output without rewriting it", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "kanko-runtime-"));
  const script = path.resolve(__dirname, "../scripts/build-runtime.mjs");
  const run = (mode: string) =>
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
