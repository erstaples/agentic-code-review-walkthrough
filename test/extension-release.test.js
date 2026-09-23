"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "extension-release-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const file of ["scripts/check-extension-release.js", "LICENSE",
    "editor-extension/package.json", "editor-extension/package-lock.json",
    "editor-extension/LICENSE", "editor-extension/CHANGELOG.md"]) {
    const dest = path.join(root, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(__dirname, "..", file), dest);
  }
  return {
    write: (file, value) => fs.writeFileSync(path.join(root, file), value),
    run: (...args) => spawnSync(process.execPath, [path.join(root, "scripts/check-extension-release.js"), ...args], { encoding: "utf8" }),
    version: JSON.parse(fs.readFileSync(path.join(root, "editor-extension/package.json"))).version,
  };
}

test("release validation accepts matching metadata and versioned tag", (t) => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  assert.equal(f.run(`extension-v${f.version}`).status, 0);
});

test("release validation rejects unrelated or mismatched tags", (t) => {
  const f = fixture(t);
  for (const tag of ["main", `v${f.version}`, "extension-v999.0.0", "extension-v0.1.0-beta.1"]) {
    const result = f.run(tag);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Release tag must match/);
  }
});

test("release validation rejects a stale lockfile", (t) => {
  const f = fixture(t);
  f.write("editor-extension/package-lock.json", JSON.stringify({ version: "999.0.0", packages: { "": { version: f.version } } }));
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Lockfile version differs/);
});

test("release validation requires release notes for the exact version", (t) => {
  const f = fixture(t);
  f.write("editor-extension/CHANGELOG.md", "# Changelog\n\n## Unreleased\n");
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Add a changelog heading/);
});

test("release validation rejects a stale packaged license", (t) => {
  const f = fixture(t);
  f.write("editor-extension/LICENSE", "outdated license");
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Packaged license differs/);
});
