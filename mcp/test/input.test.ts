import { test } from "node:test";
import * as assert from "node:assert/strict";
import { createDispatcher } from "../../generated/mcp/lib/rpc.js";
import {
  readCommand,
  readMapRequest,
} from "../../generated/mcp/lib/review-map/readers.js";
import { validateEvent } from "../../generated/mcp/lib/review-map/validation.js";
import { errorFields } from "../../generated/mcp/lib/input.js";

const provenance = [{ kind: "user-stated", source: { type: "test" } }];

test("malformed RPC input never reaches a tool handler", async () => {
  let calls = 0;
  const dispatcher = createDispatcher({
    serverInfo: { name: "test", version: "test" },
    tools: [],
    callTool: () => {
      calls++;
    },
  });
  for (const input of [null, [], "message", 4])
    assert.equal(await dispatcher.handle(input), null);
  for (const params of [
    null,
    [],
    { name: 4 },
    { name: "test", arguments: [] },
    { name: "test", arguments: "args" },
  ]) {
    const response = await dispatcher.handle({
      id: 1,
      method: "tools/call",
      params,
    });
    assert.ok(response && "result" in response && "content" in response.result);
    assert.equal(response.result.isError, true);
    assert.match(response.result.content[0].text, /bad_request/);
  }
  assert.equal(calls, 0);
});

test("request and entity readers reject malformed known fields while retaining extra metadata", () => {
  for (const args of [
    null,
    [],
    { workspace: 4, mapId: "map" },
    { workspace: "/repo", mapId: "map", selector: { kind: 4 } },
  ]) {
    assert.throws(
      () => readMapRequest("get", args),
      (error) => errorFields(error).code === "bad_request",
    );
  }
  for (const entity of [
    { provenance, statement: [] },
    { provenance, evidenceRefs: [4] },
    { provenance, rawOutput: {} },
  ]) {
    assert.throws(
      () => readCommand({ type: "AddClaim", entity }),
      (error) => errorFields(error).code === "invalid_command",
    );
  }
  const command = {
    type: "AddClaim",
    entity: {
      statement: "Checked",
      provenance,
      extra: { authorNote: "Keep this" },
    },
  };
  assert.deepEqual(readCommand(command), command);
  assert.throws(() =>
    readCommand({
      type: "CorrectEntity",
      entityId: "claim",
      provenance,
      changes: { answers: [null] },
    }),
  );
});

test("stored events check payload fields before replay", () => {
  const event = {
    schemaVersion: 2,
    mapId: "map_1234",
    sequence: 1,
    eventId: "evt_1234",
    eventType: "StopReviewStateChanged",
    occurredAt: "2026-09-25T00:00:00Z",
    actor: { kind: "agent", id: "test" },
    changeRevisionId: null,
    expectedAggregateRevision: 0,
    previousEventHash: null,
    eventHash: `sha256:${"a".repeat(64)}`,
    payload: {
      stopId: "stop",
      reviewState: "reviewed",
      changeRevisionId: "revision",
      note: null,
    },
  };
  assert.doesNotThrow(() => validateEvent(event));
  for (const payload of [
    null,
    [],
    { ...event.payload, stopId: 3 },
    { ...event.payload, changeRevisionId: [] },
  ]) {
    assert.throws(
      () => validateEvent({ ...event, payload }),
      (error) => errorFields(error).code === "event_schema_invalid",
    );
  }
});
