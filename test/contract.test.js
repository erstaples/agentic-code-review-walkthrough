const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const contract = require("../contract/protocol.js");
const fixtures = require("../contract/fixtures.json");

test("the protocol version is 3", () => {
  assert.strictEqual(contract.PROTOCOL_VERSION, 3);
});

test("every documented error code is declared exactly once", () => {
  const expected = [
    "unauthorized", "protocol_mismatch", "bad_request", "file_not_found",
    "range_out_of_bounds", "git_failed", "no_active_editor", "content_drift",
    "diff_identity_mismatch", "invalid_tour_plan", "no_tour", "stale_presentation", "navigation_boundary",
  ].sort();
  assert.deepStrictEqual([...contract.ERROR_CODES].sort(), expected);
});

test("sides, modes, and stop types are closed sets", () => {
  assert.deepStrictEqual(contract.SIDES, ["base", "head", "working"]);
  assert.deepStrictEqual(contract.MODES, ["diff", "file"]);
  assert.deepStrictEqual(contract.STOP_TYPES, ["context", "implementation", "risk", "evidence", "limitation"]);
});

test("every route maps a tool name to a method and path", () => {
  for (const [tool, route] of Object.entries(contract.ROUTES)) {
    assert.match(tool, /^kanko_[a-z_]+$/);
    assert.ok(["GET", "POST"].includes(route.method), `${tool} has a bad method`);
    assert.match(route.path, /^\/[a-z/]+$/);
  }
});

test("every route has at least one request fixture and one response fixture", () => {
  for (const tool of Object.keys(contract.ROUTES)) {
    const f = fixtures[tool];
    assert.ok(f, `no fixtures for ${tool}`);
    assert.ok(Array.isArray(f.requests) && f.requests.length > 0, `${tool} has no request fixtures`);
    assert.ok(Array.isArray(f.responses) && f.responses.length > 0, `${tool} has no response fixtures`);
  }
});

test("every request fixture carries the protocol version", () => {
  for (const [tool, f] of Object.entries(fixtures)) {
    for (const req of f.requests) {
      if (contract.ROUTES[tool].method === "GET") {
        assert.strictEqual(req.query.protocolVersion, contract.PROTOCOL_VERSION, `${tool} request fixture is missing query.protocolVersion`);
      } else {
        assert.strictEqual(req.body.protocolVersion, contract.PROTOCOL_VERSION, `${tool} request fixture is missing body.protocolVersion`);
      }
    }
  }
});

test("error fixtures only use declared codes", () => {
  for (const [tool, f] of Object.entries(fixtures)) {
    for (const res of f.responses) {
      if (res.ok) continue;
      assert.ok(contract.ERROR_CODES.includes(res.error.code), `${tool} response fixture uses undeclared code ${res.error.code}`);
    }
  }
});

test("line numbers in fixtures are 1-based", () => {
  const scan = (node) => {
    if (Array.isArray(node)) return node.forEach(scan);
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (/^(start|end)Line$/.test(k)) assert.ok(v >= 1, `${k} must be 1-based, got ${v}`);
        else scan(v);
      }
    }
  };
  scan(fixtures);
});

test("the extension's generated contract copy has not drifted", () => {
  const generated = path.join(__dirname, "..", "editor-extension", "lib", "contract.js");
  assert.ok(fs.existsSync(generated), "run: node contract/sync.js");
  const theirs = require(generated);
  assert.deepStrictEqual(
    { v: theirs.PROTOCOL_VERSION, e: theirs.ERROR_CODES, s: theirs.SIDES, m: theirs.MODES, t: theirs.STOP_TYPES },
    { v: contract.PROTOCOL_VERSION, e: contract.ERROR_CODES, s: contract.SIDES, m: contract.MODES, t: contract.STOP_TYPES }
  );
});

for (const name of ["tour", "tour-sources", "narration"]) test(`shared ${name} implementation matches the packaged copy`, () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "contract", `${name}.js`), "utf8").replace('require("./tour.js")', 'require("./tour-contract.js")');
  const copy = fs.readFileSync(path.join(__dirname, "..", "editor-extension", "lib", `${name === "tour" ? "tour-contract" : name}.js`), "utf8");
  assert.equal(copy, source, "run node contract/sync.js");
});
