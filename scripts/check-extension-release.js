#!/usr/bin/env node
"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const read = (name) => fs.readFileSync(path.join(root, name), "utf8");
const manifest = JSON.parse(read("editor-extension/package.json"));
const { checkVersions } = require("./version.js");
const version = checkVersions();

assert.equal(
  read("editor-extension/LICENSE"),
  read("LICENSE"),
  "Packaged license differs from repository license",
);
assert.ok(
  read("editor-extension/CHANGELOG.md")
    .split(/\r?\n/)
    .includes(`## ${manifest.version}`),
  "Add a changelog heading for the release version",
);
const tag = process.argv[2];
if (tag !== undefined)
  assert.equal(tag, `v${version}`, "Release tag must match the shared version");
console.log(
  `Validated ${manifest.publisher}.${manifest.name} ${manifest.version}`,
);
