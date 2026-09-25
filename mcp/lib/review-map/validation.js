"use strict";

const { SCHEMA_VERSION } = require("./domain.js");
const { invariant } = require("./errors.js");

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
  invariant(
    event && typeof event === "object" && !Array.isArray(event),
    "event_schema_invalid",
    "event must be an object",
  );
  invariant(
    JSON.stringify(Object.keys(event).sort()) === JSON.stringify(EVENT_KEYS),
    "event_schema_invalid",
    "event has missing or unknown properties",
  );
  invariant(
    event.schemaVersion === SCHEMA_VERSION &&
      /^map_[0-9a-f-]+$/.test(event.mapId),
    "event_schema_invalid",
    "event identity is invalid",
  );
  invariant(
    Number.isInteger(event.sequence) &&
      event.sequence >= 1 &&
      /^evt_[0-9a-f-]+$/.test(event.eventId),
    "event_schema_invalid",
    "event sequence or ID is invalid",
  );
  invariant(
    typeof event.eventType === "string" &&
      event.eventType &&
      event.actor &&
      typeof event.actor.kind === "string" &&
      typeof event.actor.id === "string",
    "event_schema_invalid",
    "event type or actor is invalid",
  );
  invariant(
    Number.isInteger(event.expectedAggregateRevision) &&
      event.expectedAggregateRevision >= 0,
    "event_schema_invalid",
    "event expected revision is invalid",
  );
  invariant(
    event.payload &&
      typeof event.payload === "object" &&
      /^sha256:[0-9a-f]{64}$/.test(event.eventHash),
    "event_schema_invalid",
    "event payload or hash is invalid",
  );
  return true;
}

function validateSnapshot(state) {
  invariant(
    state?.schemaVersion === SCHEMA_VERSION &&
      /^map_[0-9a-f-]+$/.test(state.id),
    "snapshot_schema_invalid",
    "review map snapshot identity is invalid",
  );
  invariant(
    ["draft", "prepared", "archived"].includes(state.phase) &&
      Number.isInteger(state.aggregateRevision) &&
      state.aggregateRevision >= 1,
    "snapshot_schema_invalid",
    "review map phase or revision is invalid",
  );
  invariant(
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
  invariant(
    receipt?.schemaVersion === SCHEMA_VERSION &&
      /^rcp_[0-9a-f-]+$/.test(receipt.id) &&
      /^map_[0-9a-f-]+$/.test(receipt.mapId),
    "receipt_schema_invalid",
    "receipt identity is invalid",
  );
  invariant(
    /^sha256:[0-9a-f]{64}$/.test(receipt.digest) &&
      Number.isInteger(receipt.aggregateRevision),
    "receipt_schema_invalid",
    "receipt digest or revision is invalid",
  );
  for (const field of ["claims", "risks", "evidence", "stops", "questions"])
    invariant(
      Array.isArray(receipt[field]),
      "receipt_schema_invalid",
      `receipt ${field} must be an array`,
    );
  return true;
}

module.exports = { validateEvent, validateSnapshot, validateReceipt };
