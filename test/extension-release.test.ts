import type { TestContext } from "node:test";
import { record } from "./assertions.js";

import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

function fixture(t: TestContext) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "extension-release-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const file of [
    "scripts/check-extension-release.js",
    "scripts/version.js",
    "plugin.json",
    ".codex-plugin/plugin.json",
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    "LICENSE",
    "editor-extension/package.json",
    "editor-extension/package-lock.json",
    "editor-extension/LICENSE",
    "editor-extension/CHANGELOG.md",
  ]) {
    const dest = path.join(root, file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(__dirname, "..", file), dest);
  }
  return {
    root,
    read: (file: string) => fs.readFileSync(path.join(root, file), "utf8"),
    write: (file: string, value: string) =>
      fs.writeFileSync(path.join(root, file), value),
    run: (...args: string[]) =>
      spawnSync(
        process.execPath,
        [path.join(root, "scripts/check-extension-release.js"), ...args],
        { encoding: "utf8" },
      ),
    version: record(
      JSON.parse(
        fs.readFileSync(
          path.join(root, "editor-extension/package.json"),
          "utf8",
        ),
      ),
    ).version,
  };
}

test("release validation accepts matching metadata and versioned tag", (t) => {
  const f = fixture(t);
  assert.equal(f.run().status, 0);
  assert.equal(f.run(`v${f.version}`).status, 0);
});

test("release validation rejects unrelated or mismatched tags", (t) => {
  const f = fixture(t);
  for (const tag of [
    "main",
    `extension-v${f.version}`,
    "v999.0.0",
    "v0.1.0-beta.1",
  ]) {
    const result = f.run(tag);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Release tag must match/);
  }
});

test("release validation rejects a stale lockfile", (t) => {
  const f = fixture(t);
  f.write(
    "editor-extension/package-lock.json",
    JSON.stringify({
      version: "999.0.0",
      packages: { "": { version: f.version } },
    }),
  );
  const result = f.run();
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /Release versions differ/);
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

test("release validation rejects drift in every distributed manifest", (t) => {
  const f = fixture(t);
  for (const file of [
    ".codex-plugin/plugin.json",
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    "editor-extension/package.json",
    "editor-extension/package-lock.json",
  ]) {
    const original = f.read(file);
    // Exercise each version independently, including both lockfile fields and
    // the marketplace's metadata and plugin entry.
    const matches = [...original.matchAll(/"version": "[^"]+"/g)];
    const count = file.endsWith("package-lock.json") ? 2 : matches.length;
    for (const match of matches.slice(0, count)) {
      const index = match.index!;
      f.write(
        file,
        original.slice(0, index) +
          '"version": "999.0.0"' +
          original.slice(index + match[0].length),
      );
      const result = f.run();
      assert.notEqual(result.status, 0, file);
      assert.ok(result.stderr.includes(file), result.stderr);
      f.write(file, original);
    }
  }
});

test("bump uses SemVer ordering and rejects invalid or non-increasing versions", () => {
  const { nextVersion } = require(
    path.join(__dirname, "../scripts/version.js"),
  ) as {
    nextVersion: (current: string, bump: string) => string;
  };
  for (const [bump, expected] of [
    ["patch", "1.2.10"],
    ["minor", "1.3.0"],
    ["major", "2.0.0"],
    ["1.10.0", "1.10.0"],
  ])
    assert.equal(nextVersion("1.2.9", bump), expected);
  for (const bump of [
    "1.2.9",
    "1.2.8",
    "0.9.99",
    "v2.0.0",
    "2.0.0-beta.1",
    "02.0.0",
    "2.0.0\n",
    "nope",
    "9007199254740992.0.0",
  ])
    assert.throws(() => nextVersion("1.2.9", bump));
});

test("bump synchronizes distributable metadata and runtime without changing dependencies or history", (t) => {
  const f = fixture(t);
  const source = path.resolve(__dirname, "..");
  for (const file of [
    "scripts/build-runtime.mjs",
    ".prettierrc.json",
    "editor-extension/tsconfig.runtime.json",
    "mcp",
    "shared",
    "schemas",
  ])
    fs.cpSync(path.join(source, file), path.join(f.root, file), {
      recursive: true,
    });
  fs.symlinkSync(
    path.join(source, "editor-extension/node_modules"),
    path.join(f.root, "editor-extension/node_modules"),
    "dir",
  );
  const originalNotes = f.read("editor-extension/CHANGELOG.md");
  const lock = record(JSON.parse(f.read("editor-extension/package-lock.json")));
  const run = (...args: string[]) =>
    spawnSync(
      process.execPath,
      [path.join(f.root, "scripts/version.js"), ...args],
      { encoding: "utf8" },
    );
  const unchanged = f.read("plugin.json");
  assert.notEqual(
    run("bump", "patch").status,
    0,
    "notes required before mutation",
  );
  assert.equal(f.read("plugin.json"), unchanged);
  f.write(
    "editor-extension/CHANGELOG.md",
    originalNotes.replace(
      "# Changelog",
      "# Changelog\n\n## Unreleased\n\n- Release workflow fixture.",
    ),
  );
  const result = run("bump", "patch");
  assert.equal(result.status, 0, result.stderr);
  const version = record(JSON.parse(f.read("plugin.json"))).version;
  assert.notEqual(version, f.version);
  assert.equal(f.run(`v${version}`).status, 0);
  assert.equal(
    record(JSON.parse(f.read("generated/plugin.json"))).version,
    version,
  );
  const domain = require(
    path.join(f.root, "generated/mcp/lib/review-map/domain.js"),
  ) as { PRODUCER_VERSION: string };
  assert.equal(domain.PRODUCER_VERSION, version);
  const runtime = spawnSync(
    process.execPath,
    [path.join(f.root, "generated/mcp/server.js")],
    {
      input:
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {},
        }) + "\n",
      encoding: "utf8",
    },
  );
  assert.equal(runtime.status, 0, runtime.stderr);
  const response = record(JSON.parse(runtime.stdout));
  assert.equal(record(record(response.result).serverInfo).version, version);
  const updatedLock = record(
    JSON.parse(f.read("editor-extension/package-lock.json")),
  );
  const dependencies = (value: Record<string, unknown>) => {
    const packages = { ...record(value.packages) };
    delete packages[""];
    return packages;
  };
  assert.deepEqual(dependencies(updatedLock), dependencies(lock));
  assert.ok(
    f
      .read("editor-extension/CHANGELOG.md")
      .includes(originalNotes.slice("# Changelog".length)),
  );
  assert.ok(!f.read("editor-extension/CHANGELOG.md").includes("## Unreleased"));
  const checked = spawnSync(
    process.execPath,
    [path.join(f.root, "scripts/build-runtime.mjs"), "--check"],
    { encoding: "utf8" },
  );
  assert.equal(checked.status, 0, checked.stderr);
  const synchronized = run("sync");
  assert.equal(synchronized.status, 0, synchronized.stderr);
  assert.equal(record(JSON.parse(f.read("plugin.json"))).version, version);
});
