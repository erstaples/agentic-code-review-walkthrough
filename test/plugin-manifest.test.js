const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

test("marketplace declares the tour-changes plugin from the repo root", () => {
  const m = readJson(".claude-plugin/marketplace.json");
  assert.strictEqual(m.name, "code-review-walkthrough");
  const plugin = m.plugins.find((p) => p.name === "tour-changes");
  assert.ok(plugin, "tour-changes plugin missing from marketplace");
  assert.strictEqual(plugin.source, "./");
});

test("plugin.json name matches the marketplace entry", () => {
  assert.strictEqual(readJson(".claude-plugin/plugin.json").name, "tour-changes");
});

test("skill lives in a directory matching its frontmatter name", () => {
  const body = fs.readFileSync(path.join(root, "skills/tour-changes/SKILL.md"), "utf8");
  assert.match(body, /^name: tour-changes$/m);
});

test("skill is generalized: no personal name, no sibling-skill slash references", () => {
  const body = fs.readFileSync(path.join(root, "skills/tour-changes/SKILL.md"), "utf8");
  assert.doesNotMatch(body, /\bEric\b/);
  assert.doesNotMatch(body, /\/code-review|address-coderabbit/);
});

test("the old root-level SKILL.md is gone", () => {
  assert.strictEqual(fs.existsSync(path.join(root, "SKILL.md")), false);
});
