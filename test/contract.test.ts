import { record } from "./assertions.js";
import { test } from "node:test";
import * as assert from "node:assert";
import * as protocol from "../generated/shared/protocol.js";
import fixtures = require("../contract/fixtures.json");

test("the protocol version is 3", () => {
  assert.strictEqual(protocol.PROTOCOL_VERSION, 3);
});

test("every documented error code is declared exactly once", () => {
  const expected = [
    "unauthorized",
    "protocol_mismatch",
    "bad_request",
    "file_not_found",
    "range_out_of_bounds",
    "git_failed",
    "no_active_editor",
    "content_drift",
    "diff_identity_mismatch",
    "invalid_tour_plan",
    "no_tour",
    "stale_presentation",
    "navigation_boundary",
  ].sort();
  assert.deepStrictEqual([...protocol.ERROR_CODES].sort(), expected);
});

test("sides, modes, and stop types are closed sets", () => {
  assert.deepStrictEqual(protocol.SIDES, ["base", "head", "working"]);
  assert.deepStrictEqual(protocol.MODES, ["diff", "file"]);
  assert.deepStrictEqual(protocol.STOP_TYPES, [
    "context",
    "implementation",
    "risk",
    "evidence",
    "limitation",
  ]);
});

test("every route maps a tool name to a method and path", () => {
  for (const [tool, route] of Object.entries(protocol.ROUTES)) {
    assert.match(tool, /^kanko_[a-z_]+$/);
    assert.ok(
      ["GET", "POST"].includes(route.method),
      `${tool} has a bad method`,
    );
    assert.match(route.path, /^\/[a-z/]+$/);
  }
});

test("every route has at least one request fixture and one response fixture", () => {
  for (const tool of Object.keys(protocol.ROUTES)) {
    const f = record(record(fixtures)[tool]);
    assert.ok(f, `no fixtures for ${tool}`);
    assert.ok(
      Array.isArray(f.requests) && f.requests.length > 0,
      `${tool} has no request fixtures`,
    );
    assert.ok(
      Array.isArray(f.responses) && f.responses.length > 0,
      `${tool} has no response fixtures`,
    );
  }
});

test("every request fixture carries the protocol version", () => {
  for (const [tool, f] of Object.entries(fixtures)) {
    for (const req of f.requests) {
      if (record(record(protocol.ROUTES)[tool]).method === "GET") {
        assert.strictEqual(
          record(record(req).query).protocolVersion,
          protocol.PROTOCOL_VERSION,
          `${tool} request fixture is missing query.protocolVersion`,
        );
      } else {
        assert.strictEqual(
          record(req.body).protocolVersion,
          protocol.PROTOCOL_VERSION,
          `${tool} request fixture is missing body.protocolVersion`,
        );
      }
    }
  }
});

test("error fixtures only use declared codes", () => {
  for (const [tool, f] of Object.entries(fixtures)) {
    for (const res of f.responses) {
      if (res.ok) continue;
      assert.ok(
        protocol.ERROR_CODES.some(
          (code) => code === record(record(res).error).code,
        ),
        `${tool} response fixture uses undeclared code ${record(record(res).error).code}`,
      );
    }
  }
});

test("line numbers in fixtures are 1-based", () => {
  const scan = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(scan);
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (/^(start|end)Line$/.test(k))
          assert.ok(
            typeof v === "number" && v >= 1,
            `${k} must be 1-based, got ${v}`,
          );
        else scan(v);
      }
    }
  };
  scan(fixtures);
});
