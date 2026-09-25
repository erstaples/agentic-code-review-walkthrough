import { test } from "node:test";
import * as assert from "node:assert/strict";
import fixture = require("./fixtures/javascript-events.json");
import { record } from "../../test/assertions.js";
import { replay } from "../../generated/mcp/lib/review-map/domain.js";
import { digest } from "../../generated/mcp/lib/review-map/canonical.js";
import { eventHash } from "../../generated/mcp/lib/review-map/file-store.js";
import { validateEvent } from "../../generated/mcp/lib/review-map/validation.js";
import { buildReceipt } from "../../generated/mcp/lib/review-map/receipt.js";

test("saved JavaScript events produce the same state and receipt after conversion", () => {
  const events = fixture.events.map((value: unknown) => {
    validateEvent(value);
    assert.equal(eventHash(value), value.eventHash);
    return value;
  });
  const state = replay(events);
  assert.equal(digest(state), fixture.stateDigest);
  assert.equal(
    digest(buildReceipt(state, "session", fixture.receiptOptions)),
    fixture.receiptDigest,
  );
});

test("replay preserves the recorded producer version across runtime upgrades", () => {
  const event = structuredClone(fixture.events[0]);
  record(event.payload).producerVersion = "0.0.7";
  event.eventHash = eventHash(event);
  validateEvent(event);
  assert.equal(replay([event]).producerVersion, "0.0.7");
  record(event.payload).producerVersion = 42;
  assert.throws(() => validateEvent(event));
});

test("receipt producer metadata follows the map rather than the installed runtime", () => {
  const events = fixture.events.map((event: unknown) => {
    validateEvent(event);
    return event;
  });
  const state = replay(events);
  state.producerVersion = "0.0.7";
  assert.equal(
    buildReceipt(state, "session", fixture.receiptOptions).producerVersion,
    "0.0.7",
  );
});
