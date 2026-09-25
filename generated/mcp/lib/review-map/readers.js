// Generated from TypeScript. Run npm run runtime:build in editor-extension.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateEventPayload = validateEventPayload;
exports.readActor = readActor;
exports.readSelection = readSelection;
exports.readEntityInput = readEntityInput;
exports.readCommand = readCommand;
exports.readMeta = readMeta;
exports.readMapRequest = readMapRequest;
const input_js_1 = require("../input.js");
const errors_js_1 = require("./errors.js");
const string = (value) => typeof value === "string";
const number = (value) => typeof value === "number" && Number.isFinite(value);
const boolean = (value) => typeof value === "boolean";
const anything = () => true;
const optional = (check) => (value) => value === undefined || check(value);
const nullable = (check) => (value) => value === null || check(value);
const array = (check) => (value) => Array.isArray(value) && value.every(check);
const object = (fields) => (value) =>
  (0, input_js_1.isRecord)(value) &&
  Object.entries(fields).every(([key, check]) => check(value[key]));
const oneOf =
  (...values) =>
  (value) =>
    values.includes(value);
const dictionary = (check) => (value) =>
  (0, input_js_1.isRecord)(value) && Object.values(value).every(check);
const strings = array(string);
const actor = object({
  kind: string,
  id: string,
  displayName: optional(string),
});
const provenance = array(
  object({
    kind: string,
    source: object({ type: string }),
    actor: optional(actor),
    capturedAt: optional(string),
  }),
);
const entityFields = {
  provenance,
  answers: optional(
    array(object({ answer: anything, provenance, recordedAt: string })),
  ),
  blobRef: optional(object({ digest: string, size: number, encoding: string })),
};
for (const key of [
  "id",
  "statement",
  "chosen",
  "concern",
  "observation",
  "question",
  "disposition",
  "freshness",
  "changeRevisionId",
  "truthStatus",
  "category",
  "impact",
  "path",
  "side",
  "revision",
  "contentDigest",
  "rawOutput",
  "rawBytesBase64",
])
  entityFields[key] = optional(string);
for (const key of [
  "relatedEntityIds",
  "requirementRefs",
  "claimRefs",
  "codeRefs",
  "evidenceRefs",
  "decisionRefs",
  "riskRefs",
])
  entityFields[key] = optional(strings);
for (const key of ["startLine", "endLine"])
  entityFields[key] = optional(number);
const entityInput = object(entityFields);
const entityKind = oneOf(
  "requirement",
  "claim",
  "decision",
  "assumption",
  "invariant",
  "risk",
  "evidence",
  "codeReference",
  "question",
  "concern",
);
const collection = oneOf(
  "requirements",
  "claims",
  "decisions",
  "assumptions",
  "invariants",
  "risks",
  "evidence",
  "codeReferences",
  "questions",
  "concerns",
);
const entity = object({
  ...entityFields,
  id: string,
  entityType: entityKind,
  version: number,
  createdAt: string,
  updatedAt: string,
  createdBy: actor,
  status: string,
});
const thesis = object({ summary: string, provenance });
const relationshipFields = {
  id: optional(string),
  from: string,
  to: string,
  type: string,
  provenance,
};
const range = object({ startLine: number, endLine: number });
const side = oneOf("base", "head");
const hash = (value) =>
  typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);
const anchor = object({
  n: number,
  role: oneOf(
    "change",
    "evidence",
    "callee",
    "caller",
    "config",
    "schema",
    "context",
  ),
  label: string,
  path: string,
  view: oneOf("diff", "head", "base"),
  change: oneOf("modified", "added", "deleted", "unchanged"),
  rev: object({ base: string, head: string }),
  side,
  context: range,
  contentHash: hash,
  symbol: optional(string),
  focus: array(
    object({
      side,
      range,
      contentHash: optional(hash),
      kind: optional(oneOf("added", "removed", "unchanged")),
    }),
  ),
  claimRefs: strings,
});
const stopFields = {
  id: string,
  title: string,
  risk: oneOf("low", "medium", "high"),
  anchors: array(anchor),
  beats: array(
    object({ id: string, narration: string, active: array(number) }),
  ),
};
const storedStop = object({
  ...stopFields,
  index: number,
  coveredEntityIds: strings,
  reviewState: string,
  reviewedAtChangeRevisionId: nullable(string),
});
const plan = object({
  id: string,
  version: number,
  presentationVersion: oneOf(2),
  title: string,
  createdAt: string,
  createdBy: actor,
  stops: array(storedStop),
});
const session = object({
  id: string,
  reviewer: actor,
  state: string,
  outcome: nullable(string),
  tourPlanId: string,
  tourPlanVersion: number,
  changeRevisionId: string,
  currentStopId: nullable(string),
  startedAt: string,
  updatedAt: string,
});
const manifestFileFields = {
  path: string,
  oldPath: optional(nullable(string)),
  renamedFrom: optional(nullable(string)),
  indexEntry: optional(
    nullable(object({ stage: number, blob: optional(string) })),
  ),
  working: optional(nullable(object({ digest: nullable(string) }))),
};
for (const key of ["kind", "index", "worktree"])
  manifestFileFields[key] = optional(string);
for (const key of ["staged", "unstaged", "untracked"])
  manifestFileFields[key] = optional(boolean);
const manifestFields = {
  kind: oneOf("committed", "working-tree"),
  files: array(object(manifestFileFields)),
};
for (const key of [
  "baseCommit",
  "effectiveBase",
  "baselineCommit",
  "headCommit",
  "currentHead",
  "diffMode",
])
  manifestFields[key] = optional(string);
for (const key of ["includeStaged", "includeUnstaged", "includeUntracked"])
  manifestFields[key] = optional(boolean);
const changeRevision = object({
  id: string,
  state: string,
  createdAt: string,
  kind: oneOf("committed", "working-tree"),
  labels: object({
    base: optional(string),
    head: optional(string),
    baseline: optional(string),
  }),
  manifest: object(manifestFields),
  manifestDigest: string,
  previousChangeRevisionId: optional(string),
});
const receiptRef = object({
  id: string,
  digest: string,
  jsonPath: string,
  markdownPath: string,
  reviewSessionId: string,
  changeRevisionId: string,
  createdAt: string,
});
const madeEntity = object({ kind: entityKind, collection, entity });
const disposition = object({ entityId: string, disposition: string });
const sessionChange = object({ sessionId: string, outcome: nullable(string) });
const correctionFields = { ...entityFields, provenance: optional(provenance) };
const payloadChecks = {
  ReviewMapCreated: object({
    mapId: string,
    title: string,
    repository: object({ key: string, workspace: string, commonDir: string }),
    changeRevision,
    actor,
    occurredAt: string,
  }),
  ThesisSet: object({ thesis }),
  RequirementAdded: madeEntity,
  ClaimAdded: madeEntity,
  DecisionAdded: madeEntity,
  AssumptionAdded: madeEntity,
  InvariantAdded: madeEntity,
  RiskAdded: madeEntity,
  EvidenceAdded: madeEntity,
  CodeReferenceAdded: madeEntity,
  QuestionAdded: madeEntity,
  ConcernAdded: madeEntity,
  QuestionRecorded: madeEntity,
  ConcernRecorded: madeEntity,
  RelationshipAdded: object({
    relationship: object({ ...relationshipFields, id: string }),
  }),
  TourPlanCreated: object({ plan }),
  ReviewMapPrepared: input_js_1.isRecord,
  ReviewSessionStarted: object({ session }),
  StopStarted: object({ sessionId: string, stopId: string }),
  ClaimDispositionChanged: disposition,
  RiskDispositionChanged: disposition,
  StopReviewStateChanged: object({
    stopId: string,
    reviewState: string,
    changeRevisionId: string,
  }),
  AnswerRecorded: object({ entityId: string, provenance, disposition: string }),
  PauseReviewSession: sessionChange,
  ResumeReviewSession: sessionChange,
  CompleteReviewSession: sessionChange,
  EntityCorrected: object({
    collection,
    entityId: string,
    changes: object(correctionFields),
    provenance,
  }),
  ChangeRevisionAdded: object({
    changeRevision,
    previousManifestDigest: string,
  }),
  DriftDetected: input_js_1.isRecord,
  ReceiptEmitted: object({ receiptRef }),
  ReviewMapArchived: input_js_1.isRecord,
};
function validateEventPayload(value) {
  (0, errors_js_1.invariant)(
    (0, input_js_1.isRecord)(value) &&
      typeof value.eventType === "string" &&
      Object.hasOwn(payloadChecks, value.eventType),
    "unknown_event",
    `unknown event type: ${(0, input_js_1.isRecord)(value) ? value.eventType : undefined}`,
  );
  const check = payloadChecks[value.eventType];
  (0, errors_js_1.invariant)(
    check(value.payload),
    "event_schema_invalid",
    `invalid payload for ${value.eventType}`,
  );
}
function readActor(value) {
  (0, errors_js_1.invariant)(
    actor(value),
    "invalid_actor",
    "actor requires kind and id",
  );
  return value;
}
function readSelection(value) {
  const fields = {};
  for (const key of ["kind", "base", "head", "baseline", "diffMode"])
    fields[key] = optional(string);
  for (const key of ["includeStaged", "includeUnstaged", "includeUntracked"])
    fields[key] = optional(boolean);
  (0, errors_js_1.invariant)(
    object(fields)(value),
    "invalid_selection",
    "selection must contain valid Git refs and options",
  );
  return value;
}
function readEntityInput(value) {
  (0, errors_js_1.invariant)(
    entityInput(value),
    "invalid_command",
    "entity fields have invalid types",
  );
  return value;
}
function readCommand(value) {
  (0, errors_js_1.invariant)(
    (0, input_js_1.isRecord)(value) && typeof value.type === "string",
    "invalid_command",
    "every command requires a type",
  );
  if (
    /^Add(Requirement|Claim|Decision|Assumption|Invariant|Risk|Evidence|CodeReference|Question|Concern)$/.test(
      value.type,
    ) ||
    value.type === "RecordQuestion" ||
    value.type === "RecordConcern"
  ) {
    const noun = value.type.replace(/^(Add|Record)/, "");
    const key = noun[0].toLowerCase() + noun.slice(1);
    const entity = readEntityInput(value.entity || value[key]);
    return { type: value.type, entity };
  }
  const checks = {
    SetThesis: object({ thesis }),
    AddRelationship: object({ relationship: object(relationshipFields) }),
    CreateTourPlan: object({
      presentationVersion: number,
      id: optional(string),
      title: optional(string),
      stops: array(object(stopFields)),
    }),
    MarkPrepared: input_js_1.isRecord,
    ArchiveReviewMap: input_js_1.isRecord,
    StartReviewSession: object({
      sessionId: optional(string),
      reviewer: optional(actor),
    }),
    StartStop: object({ sessionId: string, stopId: string }),
    SetClaimDisposition: object({ claimId: string, disposition: string }),
    SetRiskDisposition: object({ riskId: string, disposition: string }),
    SetStopReviewState: object({
      sessionId: string,
      stopId: string,
      reviewState: string,
    }),
    RecordAnswer: object({
      questionId: string,
      provenance,
      disposition: optional(string),
    }),
    PauseReviewSession: object({
      sessionId: string,
      outcome: optional(string),
    }),
    ResumeReviewSession: object({
      sessionId: string,
      outcome: optional(string),
    }),
    CompleteReviewSession: object({
      sessionId: string,
      outcome: optional(string),
    }),
    CorrectEntity: object({
      entityId: string,
      changes: object(correctionFields),
      provenance,
    }),
  };
  (0, errors_js_1.invariant)(
    Object.hasOwn(checks, value.type),
    "unknown_command",
    `unknown review map command: ${value.type}`,
  );
  (0, errors_js_1.invariant)(
    checks[value.type](value),
    "invalid_command",
    `invalid fields for ${value.type}`,
  );
  return value;
}
function readMeta(value) {
  (0, errors_js_1.invariant)(
    object({
      schemaVersion: number,
      id: string,
      title: string,
      phase: string,
      aggregateRevision: number,
      manifestDigest: string,
      changeRevisionId: string,
      createdAt: string,
      updatedAt: string,
      archivedAt: nullable(string),
    })(value),
    "invalid_metadata",
    "review map metadata is invalid",
  );
  return value;
}
function readMapRequest(method, value) {
  (0, errors_js_1.invariant)(
    (0, input_js_1.isRecord)(value),
    "bad_request",
    "tool arguments must be an object",
  );
  const fields = { workspace: string };
  if (method !== "open") fields.mapId = string;
  if (["open", "apply", "refresh", "receipt", "delete"].includes(method))
    readActor(value.actor);
  if (method === "open" || method === "refresh") readSelection(value.selection);
  if (method === "open")
    Object.assign(fields, {
      title: optional(string),
      forceNew: optional(boolean),
      createIfMissing: optional(boolean),
    });
  if (method === "apply" || method === "refresh")
    fields.expectedRevision = number;
  if (method === "apply") fields.commands = array(anything);
  if (method === "get")
    fields.selector = optional(
      object({
        kind: string,
        id: optional(string),
        type: optional(string),
        stopId: optional(string),
        sessionId: optional(string),
      }),
    );
  if (method === "receipt")
    Object.assign(fields, {
      sessionId: string,
      mode: string,
      expectedRevision: optional(number),
      supersedesReceiptId: optional(string),
    });
  if (method === "delete") fields.confirmMapId = string;
  (0, errors_js_1.invariant)(
    object(fields)(value),
    "bad_request",
    `invalid arguments for ${method}`,
  );
  return value;
}
