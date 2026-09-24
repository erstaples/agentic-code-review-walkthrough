const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

test("marketplace declares the kanko plugin from the repo root", () => {
  const m = readJson(".claude-plugin/marketplace.json");
  assert.strictEqual(m.name, "kanko");
  const plugin = m.plugins.find((p) => p.name === "kanko");
  assert.ok(plugin, "kanko plugin missing from marketplace");
  assert.strictEqual(plugin.source, "./");
});

test("plugin.json name matches the marketplace entry", () => {
  assert.strictEqual(readJson(".claude-plugin/plugin.json").name, "kanko");
});

test("Codex uses a portable manifest and MCP configuration", () => {
  const plugin = readJson("plugin.json");
  const mcp = readJson("mcp.json");
  const compatibility = readJson(".codex-plugin/plugin.json");

  assert.strictEqual(
    plugin.$schema,
    "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  );
  assert.strictEqual(plugin.name, "kanko");
  assert.strictEqual(compatibility.name, plugin.name);
  assert.strictEqual(compatibility.skills, "./skills/");

  assert.strictEqual(
    mcp.$schema,
    "https://agent-plugins.org/schemas/1.0.0/mcp.schema.json",
  );
  assert.deepStrictEqual(mcp.mcpServers["kanko"], {
    type: "stdio",
    command: "node",
    args: ["${PLUGIN_ROOT}/mcp/server.js"],
  });
});

test("skill lives in a directory matching its frontmatter name", () => {
  const body = fs.readFileSync(path.join(root, "skills/kanko-tour/SKILL.md"), "utf8");
  assert.match(body, /^name: kanko-tour$/m);
  const development = fs.readFileSync(path.join(root, "skills/kanko-build/SKILL.md"), "utf8");
  assert.match(development, /^name: kanko-build$/m);
});

test("skill is generalized: no personal name, no sibling-skill slash references", () => {
  const body = fs.readFileSync(path.join(root, "skills/kanko-tour/SKILL.md"), "utf8");
  assert.doesNotMatch(body, /\bEric\b/);
  assert.doesNotMatch(body, /\/code-review|address-coderabbit/);
});

test("the old root-level SKILL.md is gone", () => {
  assert.strictEqual(fs.existsSync(path.join(root, "SKILL.md")), false);
});
