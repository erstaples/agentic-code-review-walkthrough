import { test } from "node:test";
import * as assert from "node:assert/strict";
import fixture = require("./fixtures/javascript-events.json");
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
