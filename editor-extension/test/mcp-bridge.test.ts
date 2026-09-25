import { record } from "../../test/assertions.js";
import { ReviewMapService } from "../../generated/mcp/lib/review-map/service.js";
import type { MapRequests } from "../../generated/mcp/lib/review-map/types.js";
import { errorFields } from "../../generated/mcp/lib/input.js";
import { test } from "node:test";
import assert = require("node:assert/strict");
import { createCallTool } from "../../generated/mcp/lib/tools.js";
import { startServer } from "../src/host/httpserver.js";

test("load validates the authored review map before sending it to the extension", async (t) => {
  const seen: unknown[] = [],
    payload = {
      workspace: "/repo",
      tourId: "map",
      plan: { presentationVersion: 2 },
    };
  const server = await startServer({
    authToken: "test",
    protocolVersion: 3,
    handlers: {
      "POST /tour/load": async (body: unknown) => {
        seen.push(body);
        return { snapshot: { loaded: true }, findings: [] };
      },
    },
  });
  t.after(() => server.close());
  const call = createCallTool({
    resolveLock: (workspace) => {
      assert.equal(workspace, "/repo");
      return { port: server.port, authToken: "test" };
    },
    mapService: Object.assign(new ReviewMapService(), {
      loadTour: (args: MapRequests["loadTour"]) => {
        assert.equal(args.mapId, "map");
        return payload;
      },
    }),
  });
  assert.equal(
    record(
      record(
        await call("kanko_tour_load", { workspace: "/repo", mapId: "map" }),
      ).snapshot,
    ).loaded,
    true,
  );
  assert.deepEqual(seen, [{ ...payload, protocolVersion: 3 }]);
});
test("navigation and presentation state go through the authenticated bridge", async (t) => {
  const seen: [string, Record<string, unknown>][] = [];
  const handlers = Object.fromEntries(
    ["/tour/navigate", "/tour/state", "/clear"].map((route) => [
      `POST ${route}`,
      async (body: unknown) => {
        seen.push([route, record(body)]);
        return { snapshot: { revision: seen.length } };
      },
    ]),
  );
  handlers["GET /status"] = async () => ({
    snapshot: { revision: seen.length },
  });
  const server = await startServer({
    authToken: "test",
    protocolVersion: 3,
    handlers,
  });
  t.after(() => server.close());
  const call = createCallTool({
    resolveLock: () => ({ port: server.port, authToken: "test" }),
  });
  await call("kanko_tour_navigate", {
    workspace: "/repo",
    action: "nextBeat",
    protocolVersion: 999,
  });
  await call("kanko_tour_set_state", { workspace: "/repo", mode: "exploring" });
  await call("kanko_tour_clear", { workspace: "/repo" });
  assert.equal(seen[0][1].protocolVersion, 3);
  assert.equal(seen[0][1].workspace, "/repo");
  assert.equal(
    record(
      record(await call("kanko_tour_status", { workspace: "/repo" })).snapshot,
    ).revision,
    3,
  );
});
test("extension findings survive HTTP and MCP error propagation", async (t) => {
  const details = {
    findings: [{ code: "content_mismatch", location: "stops[0].anchors[0]" }],
  };
  const server = await startServer({
    authToken: "test",
    protocolVersion: 3,
    handlers: {
      "POST /tour/navigate": () => {
        throw Object.assign(new Error("Fix anchor"), {
          code: "invalid_tour_plan",
          details,
        });
      },
    },
  });
  t.after(() => server.close());
  const call = createCallTool({
    resolveLock: () => ({ port: server.port, authToken: "test" }),
  });
  await assert.rejects(
    call("kanko_tour_navigate", { workspace: "/repo", action: "nextBeat" }),
    (e) =>
      errorFields(e).code === "invalid_tour_plan" &&
      JSON.stringify(errorFields(e).details) === JSON.stringify(details),
  );
});
