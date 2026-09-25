#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function validateVersion(version) {
  if (
    typeof version !== "string" ||
    version.trim() !== version ||
    !stable.test(version) ||
    !version.split(".").every((part) => Number.isSafeInteger(Number(part)))
  )
    throw new Error("Use a stable major.minor.patch version");
  return version;
}

function currentVersion() {
  return validateVersion(JSON.parse(read("plugin.json")).version);
}

function nextVersion(current, bump) {
  const parts = validateVersion(current).split(".").map(Number);
  const index = ["major", "minor", "patch"].indexOf(bump);
  if (index >= 0) {
    parts[index] += 1;
    parts.fill(0, index + 1);
    return validateVersion(parts.join("."));
  }
  validateVersion(bump);
  const next = bump.split(".").map(Number);
  const changed = next.findIndex((value, i) => value !== parts[i]);
  if (changed < 0 || next[changed] < parts[changed])
    throw new Error("New version must be greater than the current version");
  return bump;
}

function metadata(version) {
  const updates = new Map();
  for (const file of [
    "plugin.json",
    ".codex-plugin/plugin.json",
    ".claude-plugin/plugin.json",
    ".claude-plugin/marketplace.json",
    "editor-extension/package.json",
    "editor-extension/package-lock.json",
  ]) {
    const original = read(file);
    const data = JSON.parse(original);
    if (file.endsWith("marketplace.json")) {
      data.metadata.version = version;
      const plugin = data.plugins.find((entry) => entry.name === "kanko");
      if (!plugin) throw new Error("Marketplace is missing the kanko plugin");
      plugin.version = version;
    } else {
      data.version = version;
      if (file.endsWith("package-lock.json"))
        data.packages[""].version = version;
    }
    // Leave dependency versions and schema URLs untouched. Only rewrite files
    // whose managed fields changed.
    if (JSON.stringify(JSON.parse(original)) !== JSON.stringify(data))
      updates.set(file, JSON.stringify(data, null, 2) + "\n");
  }
  return updates;
}

function checkVersions() {
  const version = currentVersion();
  const stale = [...metadata(version).keys()];
  if (stale.length)
    throw new Error(
      `Release versions differ from plugin.json (${version}): ${stale.join(", ")}. Run node scripts/version.js sync.`,
    );
  return version;
}

function main(args) {
  const [command, bump] = args;
  if ((command === "check" || command === "sync") && args.length === 1) {
    if (command === "check") {
      console.log(checkVersions());
      return;
    }
  } else if (command !== "bump" || args.length !== 2) {
    throw new Error(
      "Usage: node scripts/version.js check|sync|bump <patch|minor|major|X.Y.Z>",
    );
  }
  const version =
    command === "bump" ? nextVersion(currentVersion(), bump) : currentVersion();
  const updates = metadata(version);
  if (command === "bump") {
    const changelog = read("editor-extension/CHANGELOG.md");
    const match = /^## Unreleased\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/m.exec(
      changelog,
    );
    if (!match || !match[1].trim())
      throw new Error(
        "Add release notes under ## Unreleased in editor-extension/CHANGELOG.md before bumping",
      );
    if (changelog.split(/\r?\n/).includes(`## ${version}`))
      throw new Error(`Changelog already contains ${version}`);
    updates.set(
      "editor-extension/CHANGELOG.md",
      changelog.replace(/^## Unreleased\r?$/m, `## ${version}`),
    );
  }
  // Fail before changing metadata if the runtime build tools are unavailable.
  for (const dependency of ["typescript", "prettier"])
    require.resolve(dependency, {
      paths: [path.join(root, "editor-extension")],
    });
  for (const [file, contents] of updates)
    fs.writeFileSync(path.join(root, file), contents);
  execFileSync(
    process.execPath,
    [path.join(root, "scripts/build-runtime.mjs"), "--write"],
    { stdio: "inherit" },
  );
  console.log(
    `Kankō ${version}: synchronized manifests and runtime. Review and commit these changes; release tag: v${version}`,
  );
}

module.exports = { checkVersions, currentVersion, nextVersion };
if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
