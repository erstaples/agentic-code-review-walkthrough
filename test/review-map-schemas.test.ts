import { test } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";

test("review map contracts are versioned JSON Schema Draft 2020-12 documents", () => {
  for (const name of [
    "review-map",
    "event",
    "receipt",
    "tool-contracts",
    "presentation-anchor",
    "tour-plan",
  ]) {
    const schema = JSON.parse(
      fs.readFileSync(
        path.join(__dirname, "..", "schemas", `${name}.schema.json`),
        "utf8",
      ),
    );
    assert.strictEqual(
      schema.$schema,
      "https://json-schema.org/draft/2020-12/schema",
    );
    assert.match(schema.$id, /^https:\/\//);
  }
});
