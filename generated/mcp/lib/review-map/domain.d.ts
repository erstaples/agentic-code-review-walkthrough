// Generated from TypeScript. Run npm run runtime:build in editor-extension.
import type {
  Actor,
  EntityKind,
  Collection,
  Entity,
  Aggregate,
  NewMap,
  EventSpec,
  AppliedEvent,
  StoredEvent,
} from "./types.js";
declare const SCHEMA_VERSION = 2;
declare const PRODUCER_VERSION: string;
declare function validateActor(actor: unknown): asserts actor is Actor;
declare function newAggregate({
  producerVersion,
  mapId,
  title,
  repository,
  changeRevision,
  actor,
  occurredAt,
}: NewMap): Aggregate;
declare function findEntity(
  state: Aggregate,
  entityId: string,
): {
  kind: EntityKind;
  collection: Collection;
  entity: Entity;
} | null;
declare function eventForCommand(
  state: Aggregate,
  input: unknown,
  actor: Actor,
  occurredAt?: string,
): EventSpec;
declare function applyEvent(
  state: Aggregate | null,
  event: AppliedEvent,
): Aggregate;
declare function currentRevision(
  state: Aggregate,
): import("./types.js").ChangeRevision;
declare function replay(events: StoredEvent[]): Aggregate;
declare function projectionOverview(state: Aggregate): {
  mapId: string;
  title: string;
  phase: "draft" | "prepared" | "archived";
  aggregateRevision: number;
  changeRevision: import("./types.js").ChangeRevision;
  thesis: import("./types.js").Thesis | null;
  counts: {
    requirements: number;
    claims: number;
    decisions: number;
    risks: number;
    evidence: number;
    questions: number;
    concerns: number;
    stops: number;
  };
  claimDispositions: any;
  riskDispositions: any;
  evidenceFreshness: any;
  stopStates: any;
};
export {
  SCHEMA_VERSION,
  PRODUCER_VERSION,
  eventForCommand,
  applyEvent,
  replay,
  newAggregate,
  projectionOverview,
  findEntity,
  validateActor,
  currentRevision,
};
