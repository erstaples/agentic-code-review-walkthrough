// Generated from TypeScript. Run npm run runtime:build in editor-extension.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEvent = validateEvent;
exports.validateSnapshot = validateSnapshot;
exports.validateReceipt = validateReceipt;
const input_js_1 = require("../input.js");
const readers_js_1 = require("./readers.js");
const domain_js_1 = require("./domain.js");
const errors_js_1 = require("./errors.js");
const EVENT_KEYS = [
  "actor",
  "changeRevisionId",
  "mapId",
  "eventHash",
  "eventId",
  "eventType",
  "expectedAggregateRevision",
  "occurredAt",
  "payload",
  "previousEventHash",
  "schemaVersion",
  "sequence",
].sort();
function validateEvent(event) {
  (0, errors_js_1.invariant)(
    (0, input_js_1.isRecord)(event),
    "event_schema_invalid",
    "event must be an object",
  );
  (0, errors_js_1.invariant)(
    JSON.stringify(Object.keys(event).sort()) === JSON.stringify(EVENT_KEYS),
    "event_schema_invalid",
    "event has missing or unknown properties",
  );
  (0, errors_js_1.invariant)(
    event.schemaVersion === domain_js_1.SCHEMA_VERSION &&
      typeof event.mapId === "string" &&
      /^map_[0-9a-f-]+$/.test(event.mapId),
    "event_schema_invalid",
    "event identity is invalid",
  );
  (0, errors_js_1.invariant)(
    typeof event.sequence === "number" &&
      Number.isInteger(event.sequence) &&
      event.sequence >= 1 &&
      typeof event.eventId === "string" &&
      /^evt_[0-9a-f-]+$/.test(event.eventId),
    "event_schema_invalid",
    "event sequence or ID is invalid",
  );
  (0, errors_js_1.invariant)(
    typeof event.eventType === "string" &&
      event.eventType &&
      (0, input_js_1.isRecord)(event.actor) &&
      typeof event.actor.kind === "string" &&
      typeof event.actor.id === "string",
    "event_schema_invalid",
    "event type or actor is invalid",
  );
  (0, errors_js_1.invariant)(
    typeof event.expectedAggregateRevision === "number" &&
      Number.isInteger(event.expectedAggregateRevision) &&
      event.expectedAggregateRevision >= 0,
    "event_schema_invalid",
    "event expected revision is invalid",
  );
  (0, errors_js_1.invariant)(
    event.payload &&
      typeof event.payload === "object" &&
      typeof event.eventHash === "string" &&
      /^sha256:[0-9a-f]{64}$/.test(event.eventHash),
    "event_schema_invalid",
    "event payload or hash is invalid",
  );
  (0, errors_js_1.invariant)(
    typeof event.occurredAt === "string" &&
      (event.changeRevisionId === null ||
        typeof event.changeRevisionId === "string") &&
      (event.previousEventHash === null ||
        typeof event.previousEventHash === "string"),
    "event_schema_invalid",
    "event timestamp or revision is invalid",
  );
  (0, readers_js_1.validateEventPayload)(event);
}
function validateSnapshot(state) {
  (0, errors_js_1.invariant)(
    state?.schemaVersion === domain_js_1.SCHEMA_VERSION &&
      /^map_[0-9a-f-]+$/.test(state.id),
    "snapshot_schema_invalid",
    "review map snapshot identity is invalid",
  );
  (0, errors_js_1.invariant)(
    ["draft", "prepared", "archived"].includes(state.phase) &&
      Number.isInteger(state.aggregateRevision) &&
      state.aggregateRevision >= 1,
    "snapshot_schema_invalid",
    "review map phase or revision is invalid",
  );
  (0, errors_js_1.invariant)(
    state.repository &&
      Array.isArray(state.changeRevisions) &&
      state.changeRevisions.length > 0 &&
      state.entities &&
      state.relationships &&
      state.tourPlans &&
      state.reviewSessions &&
      Array.isArray(state.receipts),
    "snapshot_schema_invalid",
    "review map snapshot is incomplete",
  );
  return true;
}
function validateReceipt(receipt) {
  (0, errors_js_1.invariant)(
    receipt?.schemaVersion === domain_js_1.SCHEMA_VERSION &&
      /^rcp_[0-9a-f-]+$/.test(receipt.id) &&
      /^map_[0-9a-f-]+$/.test(receipt.mapId),
    "receipt_schema_invalid",
    "receipt identity is invalid",
  );
  (0, errors_js_1.invariant)(
    /^sha256:[0-9a-f]{64}$/.test(receipt.digest) &&
      Number.isInteger(receipt.aggregateRevision),
    "receipt_schema_invalid",
    "receipt digest or revision is invalid",
  );
  for (const field of ["claims", "risks", "evidence", "stops", "questions"])
    (0, errors_js_1.invariant)(
      Array.isArray(receipt[field]),
      "receipt_schema_invalid",
      `receipt ${field} must be an array`,
    );
  return true;
}
