"use strict";

const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

test("dossier contracts are versioned JSON Schema Draft 2020-12 documents", () => {
  for (const name of ["dossier", "event", "receipt", "tool-contracts"]) {
    const schema = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "schemas", `${name}.schema.json`), "utf8"));
    assert.strictEqual(schema.$schema, "https://json-schema.org/draft/2020-12/schema");
    assert.match(schema.$id, /^https:\/\//);
  }
});
