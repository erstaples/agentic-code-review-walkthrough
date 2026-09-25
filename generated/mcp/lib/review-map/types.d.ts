// Generated from TypeScript. Run npm run runtime:build in editor-extension.
import type { TourStop, ChangeManifest } from "../../../shared/types.js";
export interface Actor {
  kind: string;
  id: string;
  displayName?: string;
}
export interface Provenance {
  kind: string;
  source: {
    type: string;
    [key: string]: unknown;
  };
  capturedAt?: string;
  actor?: Actor;
  [key: string]: unknown;
}
export interface Selection {
  kind?: string;
  base?: string;
  head?: string;
  diffMode?: string;
  baseline?: string;
  includeStaged?: boolean;
  includeUnstaged?: boolean;
  includeUntracked?: boolean;
}
export interface Manifest extends ChangeManifest {
  kind: "committed" | "working-tree";
  baseCommit?: string;
  diffMode?: string;
  includeStaged?: boolean;
  includeUnstaged?: boolean;
  includeUntracked?: boolean;
}
export interface ChangeRevision {
  id: string;
  state: string;
  createdAt: string;
  kind: "committed" | "working-tree";
  labels: {
    base?: string;
    head?: string;
    baseline?: string;
  };
  manifest: Manifest;
  manifestDigest: string;
  previousChangeRevisionId?: string;
}
export type EntityKind =
  | "requirement"
  | "claim"
  | "decision"
  | "assumption"
  | "invariant"
  | "risk"
  | "evidence"
  | "codeReference"
  | "question"
  | "concern";
export type Collection =
  | "requirements"
  | "claims"
  | "decisions"
  | "assumptions"
  | "invariants"
  | "risks"
  | "evidence"
  | "codeReferences"
  | "questions"
  | "concerns";
export interface EntityInput {
  id?: string;
  provenance: Provenance[];
  statement?: string;
  chosen?: string;
  concern?: string;
  observation?: string;
  question?: string;
  disposition?: string;
  freshness?: string;
  changeRevisionId?: string;
  truthStatus?: string;
  category?: string;
  impact?: string;
  result?: unknown;
  limitations?: unknown;
  mitigation?: unknown;
  relatedEntityIds?: string[];
  requirementRefs?: string[];
  claimRefs?: string[];
  codeRefs?: string[];
  evidenceRefs?: string[];
  decisionRefs?: string[];
  riskRefs?: string[];
  path?: string;
  side?: string;
  startLine?: number;
  endLine?: number;
  revision?: string;
  contentDigest?: string;
  rawOutput?: string;
  rawBytesBase64?: string;
  blobRef?: {
    digest: string;
    size: number;
    encoding: string;
  };
  answers?: {
    answer: unknown;
    provenance: Provenance[];
    recordedAt: string;
  }[];
  [key: string]: unknown;
}
export interface Entity extends EntityInput {
  id: string;
  entityType: EntityKind;
  version: number;
  createdAt: string;
  updatedAt: string;
  createdBy: Actor;
  status: string;
}
export interface Thesis {
  summary: string;
  provenance: Provenance[];
  [key: string]: unknown;
}
export interface Relationship {
  id: string;
  from: string;
  to: string;
  type: string;
  provenance: Provenance[];
  [key: string]: unknown;
}
export interface StoredStop extends TourStop {
  index: number;
  coveredEntityIds: string[];
  reviewState: string;
  reviewedAtChangeRevisionId: string | null;
  note?: unknown;
}
export interface StoredPlan {
  id: string;
  version: number;
  presentationVersion: 2;
  title: string;
  createdAt: string;
  createdBy: Actor;
  stops: StoredStop[];
}
export interface ReviewSession {
  id: string;
  reviewer: Actor;
  state: string;
  outcome: string | null;
  tourPlanId: string;
  tourPlanVersion: number;
  changeRevisionId: string;
  currentStopId: string | null;
  startedAt: string;
  updatedAt: string;
}
export interface ReceiptRef {
  id: string;
  digest: string;
  jsonPath: string;
  markdownPath: string;
  reviewSessionId: string;
  changeRevisionId: string;
  createdAt: string;
}
export interface NewMap {
  producerVersion?: string;
  mapId: string;
  title: string;
  repository: {
    key: string;
    workspace: string;
    commonDir: string;
  };
  changeRevision: ChangeRevision;
  actor: Actor;
  occurredAt: string;
}
export interface Aggregate {
  schemaVersion: number;
  producerVersion: string;
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  phase: "draft" | "prepared" | "archived";
  aggregateRevision: number;
  repository: NewMap["repository"];
  changeRevisions: ChangeRevision[];
  currentChangeRevisionId: string;
  thesis: Thesis | null;
  entities: Record<Collection, Record<string, Entity>>;
  relationships: Record<string, Relationship>;
  tourPlans: Record<string, StoredPlan>;
  currentTourPlanId: string | null;
  reviewSessions: Record<string, ReviewSession>;
  receipts: ReceiptRef[];
  createdBy: Actor;
  archivedAt: string | null;
  lastEventHash?: string;
}
export interface MadeEntity {
  kind: EntityKind;
  collection: Collection;
  entity: Entity;
}
export type EntityEvent =
  `${Capitalize<EntityKind>}Added` | "QuestionRecorded" | "ConcernRecorded";
export interface EventPayloads {
  ReviewMapCreated: NewMap;
  ThesisSet: {
    thesis: Thesis;
  };
  RelationshipAdded: {
    relationship: Relationship;
  };
  TourPlanCreated: {
    plan: StoredPlan;
  };
  ReviewMapPrepared: Record<string, never>;
  ReviewSessionStarted: {
    session: ReviewSession;
  };
  StopStarted: {
    sessionId: string;
    stopId: string;
  };
  ClaimDispositionChanged: {
    entityId: string;
    disposition: string;
    rationale: unknown;
  };
  RiskDispositionChanged: {
    entityId: string;
    disposition: string;
    rationale: unknown;
  };
  StopReviewStateChanged: {
    stopId: string;
    reviewState: string;
    changeRevisionId: string;
    note: unknown;
  };
  AnswerRecorded: {
    entityId: string;
    answer: unknown;
    provenance: Provenance[];
    disposition: string;
  };
  PauseReviewSession: {
    sessionId: string;
    outcome: string | null;
  };
  ResumeReviewSession: {
    sessionId: string;
    outcome: string | null;
  };
  CompleteReviewSession: {
    sessionId: string;
    outcome: string | null;
  };
  EntityCorrected: {
    collection: Collection;
    entityId: string;
    changes: Partial<EntityInput>;
    provenance: Provenance[];
  };
  ChangeRevisionAdded: {
    changeRevision: ChangeRevision;
    previousManifestDigest: string;
  };
  DriftDetected: Record<string, never>;
  ReceiptEmitted: {
    receiptRef: ReceiptRef;
  };
  ReviewMapArchived: Record<string, never>;
}
export type Payloads = EventPayloads & Record<EntityEvent, MadeEntity>;
export type EventSpec = {
  [K in keyof Payloads]: {
    eventType: K;
    payload: Payloads[K];
    occurredAt?: string;
    changeRevisionId?: string | null;
  };
}[keyof Payloads];
export type AppliedEvent = EventSpec & {
  sequence: number;
  occurredAt: string;
  eventHash?: string;
  changeRevisionId?: string | null;
};
export type StoredEvent = EventSpec & {
  schemaVersion: number;
  mapId: string;
  sequence: number;
  eventId: string;
  occurredAt: string;
  actor: Actor;
  changeRevisionId: string | null;
  expectedAggregateRevision: number;
  previousEventHash: string | null;
  eventHash: string;
};
export type AddEntityCommand = {
  type: `Add${Capitalize<EntityKind>}` | "RecordQuestion" | "RecordConcern";
  entity?: EntityInput;
} & Partial<Record<EntityKind, EntityInput>>;
export type Command =
  | AddEntityCommand
  | {
      type: "SetThesis";
      thesis: Thesis;
    }
  | {
      type: "AddRelationship";
      relationship: {
        id?: string;
        from: string;
        to: string;
        type: string;
        provenance: Provenance[];
      };
    }
  | {
      type: "CreateTourPlan";
      presentationVersion: number;
      id?: string;
      title?: string;
      stops: TourStop[];
    }
  | {
      type: "MarkPrepared" | "ArchiveReviewMap";
    }
  | {
      type: "StartReviewSession";
      sessionId?: string;
      reviewer?: Actor;
    }
  | {
      type: "StartStop";
      sessionId: string;
      stopId: string;
    }
  | {
      type: "SetClaimDisposition";
      claimId: string;
      disposition: string;
      rationale?: unknown;
    }
  | {
      type: "SetRiskDisposition";
      riskId: string;
      disposition: string;
      rationale?: unknown;
    }
  | {
      type: "SetStopReviewState";
      sessionId: string;
      stopId: string;
      reviewState: string;
      note?: unknown;
    }
  | {
      type: "RecordAnswer";
      questionId: string;
      answer: unknown;
      provenance: Provenance[];
      disposition?: string;
    }
  | {
      type:
        "PauseReviewSession" | "ResumeReviewSession" | "CompleteReviewSession";
      sessionId: string;
      outcome?: string;
    }
  | {
      type: "CorrectEntity";
      entityId: string;
      changes: Partial<EntityInput>;
      provenance: Provenance[];
    };
export interface MapMeta {
  schemaVersion: number;
  id: string;
  title: string;
  phase: string;
  aggregateRevision: number;
  manifestDigest: string;
  changeRevisionId: string;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}
export interface MapLocation {
  workspace: string;
  mapId: string;
}
export interface Mutation extends MapLocation {
  expectedRevision: number;
  actor: Actor;
}
export interface Selector {
  kind: string;
  id?: string;
  type?: string;
  stopId?: string;
  sessionId?: string;
}
export interface MapRequests {
  open: {
    workspace: string;
    selection: Selection;
    actor: Actor;
    title?: string;
    forceNew?: boolean;
    createIfMissing?: boolean;
  };
  loadTour: MapLocation;
  get: MapLocation & {
    selector?: Selector;
  };
  apply: Mutation & {
    commands: unknown[];
  };
  check: MapLocation;
  refresh: Mutation & {
    selection: Selection;
  };
  receipt: MapLocation & {
    sessionId: string;
    mode: string;
    actor: Actor;
    expectedRevision?: number;
    supersedesReceiptId?: string;
  };
  delete: MapLocation & {
    confirmMapId: string;
    actor: Actor;
  };
}
