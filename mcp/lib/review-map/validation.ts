import type { StoredEvent, Aggregate } from "./types.js";
import type { buildReceipt } from "./receipt.js";
import { isRecord } from "../input.js";
import { validateEventPayload } from "./readers.js";

import { SCHEMA_VERSION } from "./domain.js";
import { invariant } from "./errors.js";

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

function validateEvent(event: unknown): asserts event is StoredEvent {
  invariant(isRecord(event), "event_schema_invalid", "event must be an object");
  invariant(
    JSON.stringify(Object.keys(event).sort()) === JSON.stringify(EVENT_KEYS),
    "event_schema_invalid",
    "event has missing or unknown properties",
  );
  invariant(
    event.schemaVersion === SCHEMA_VERSION &&
      typeof event.mapId === "string" &&
      /^map_[0-9a-f-]+$/.test(event.mapId),
    "event_schema_invalid",
    "event identity is invalid",
  );
  invariant(
    typeof event.sequence === "number" &&
      Number.isInteger(event.sequence) &&
      event.sequence >= 1 &&
      typeof event.eventId === "string" &&
      /^evt_[0-9a-f-]+$/.test(event.eventId),
    "event_schema_invalid",
    "event sequence or ID is invalid",
  );
  invariant(
    typeof event.eventType === "string" &&
      event.eventType &&
      isRecord(event.actor) &&
      typeof event.actor.kind === "string" &&
      typeof event.actor.id === "string",
    "event_schema_invalid",
    "event type or actor is invalid",
  );
  invariant(
    typeof event.expectedAggregateRevision === "number" &&
      Number.isInteger(event.expectedAggregateRevision) &&
      event.expectedAggregateRevision >= 0,
    "event_schema_invalid",
    "event expected revision is invalid",
  );
  invariant(
    event.payload &&
      typeof event.payload === "object" &&
      typeof event.eventHash === "string" &&
      /^sha256:[0-9a-f]{64}$/.test(event.eventHash),
    "event_schema_invalid",
    "event payload or hash is invalid",
  );
  invariant(
    typeof event.occurredAt === "string" &&
      (event.changeRevisionId === null ||
        typeof event.changeRevisionId === "string") &&
      (event.previousEventHash === null ||
        typeof event.previousEventHash === "string"),
    "event_schema_invalid",
    "event timestamp or revision is invalid",
  );
  validateEventPayload(event);
}

function validateSnapshot(state: Aggregate) {
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

function validateReceipt(receipt: ReturnType<typeof buildReceipt>) {
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
  for (const field of [
    "claims",
    "risks",
    "evidence",
    "stops",
    "questions",
  ] as const)
    invariant(
      Array.isArray(receipt[field]),
      "receipt_schema_invalid",
      `receipt ${field} must be an array`,
    );
  return true;
}

export { validateEvent, validateSnapshot, validateReceipt };
