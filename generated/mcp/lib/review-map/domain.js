// Generated from TypeScript. Run npm run runtime:build in editor-extension.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRODUCER_VERSION = exports.SCHEMA_VERSION = void 0;
exports.eventForCommand = eventForCommand;
exports.applyEvent = applyEvent;
exports.replay = replay;
exports.newAggregate = newAggregate;
exports.projectionOverview = projectionOverview;
exports.findEntity = findEntity;
exports.validateActor = validateActor;
exports.currentRevision = currentRevision;
const readers_js_1 = require("./readers.js");
const canonical_js_1 = require("./canonical.js");
const errors_js_1 = require("./errors.js");
const plugin_json_1 = require("../../../plugin.json");
const SCHEMA_VERSION = 2;
exports.SCHEMA_VERSION = SCHEMA_VERSION;
const PRODUCER_VERSION = plugin_json_1.version;
exports.PRODUCER_VERSION = PRODUCER_VERSION;
const PROVENANCE_KINDS = new Set([
  "user-stated",
  "source-document",
  "session-recorded",
  "repository-observed",
  "execution-observed",
  "reviewer-stated",
  "model-inferred",
]);
const ENTITY_COLLECTIONS = {
  requirement: "requirements",
  claim: "claims",
  decision: "decisions",
  assumption: "assumptions",
  invariant: "invariants",
  risk: "risks",
  evidence: "evidence",
  codeReference: "codeReferences",
  question: "questions",
  concern: "concerns",
};
const PREFIXES = {
  requirement: "req",
  claim: "clm",
  decision: "dec",
  assumption: "asm",
  invariant: "inv",
  risk: "rsk",
  evidence: "evd",
  codeReference: "cod",
  question: "qst",
  concern: "con",
};
const CLAIM_DISPOSITIONS = new Set([
  "unexamined",
  "partially-supported",
  "supported",
  "contradicted",
  "accepted-risk",
  "needs-change",
  "deferred",
  "obsolete",
]);
const RISK_DISPOSITIONS = new Set([
  "open",
  "mitigated",
  "accepted",
  "needs-change",
  "deferred",
  "obsolete",
]);
const STOP_STATES = new Set([
  "not-visited",
  "presented",
  "reviewed",
  "reviewed-with-concern",
  "skipped",
  "blocked",
  "invalidated",
]);
const QUESTION_STATES = new Set([
  "open",
  "answered",
  "resolved",
  "accepted-risk",
  "deferred",
  "obsolete",
]);
const RELATIONSHIP_TYPES = new Set([
  "motivates",
  "implements",
  "affects",
  "supports",
  "contradicts",
  "mitigates",
  "depends_on",
  "supersedes",
  "covers",
]);
function now() {
  return new Date().toISOString();
}
function clone(value) {
  return structuredClone(value);
}
function validateActor(actor) {
  (0, readers_js_1.readActor)(actor);
}
function validateProvenance(provenance, required = true) {
  (0, errors_js_1.invariant)(
    Array.isArray(provenance) && (!required || provenance.length > 0),
    "invalid_provenance",
    "at least one provenance record is required",
  );
  for (const item of provenance) {
    (0, errors_js_1.invariant)(
      item && PROVENANCE_KINDS.has(item.kind),
      "invalid_provenance",
      `unknown provenance kind: ${item?.kind}`,
    );
    (0, errors_js_1.invariant)(
      item.source &&
        typeof item.source === "object" &&
        typeof item.source.type === "string",
      "invalid_provenance",
      "provenance source must be a structured locator",
    );
  }
}
function newAggregate({
  // Events written before producerVersion was stored always used 0.1.0.
  // Keep this historical default fixed so upgrades preserve state/receipt hashes.
  producerVersion = "0.1.0",
  mapId,
  title,
  repository,
  changeRevision,
  actor,
  occurredAt,
}) {
  return {
    schemaVersion: SCHEMA_VERSION,
    producerVersion,
    id: mapId,
    title,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    phase: "draft",
    aggregateRevision: 0,
    repository,
    changeRevisions: [changeRevision],
    currentChangeRevisionId: changeRevision.id,
    thesis: null,
    entities: {
      requirements: {},
      claims: {},
      decisions: {},
      assumptions: {},
      invariants: {},
      risks: {},
      evidence: {},
      codeReferences: {},
      questions: {},
      concerns: {},
    },
    relationships: {},
    tourPlans: {},
    currentTourPlanId: null,
    reviewSessions: {},
    receipts: [],
    createdBy: actor,
    archivedAt: null,
  };
}
function entityBase(kind, input, actor, occurredAt) {
  validateProvenance(input.provenance);
  const normalized = clone(input);
  normalized.provenance = normalized.provenance.map((item) => ({
    ...item,
    capturedAt: occurredAt,
    actor: clone(actor),
  }));
  return {
    ...normalized,
    id: input.id || (0, canonical_js_1.id)(PREFIXES[kind]),
    entityType: kind,
    version: 1,
    createdAt: occurredAt,
    updatedAt: occurredAt,
    createdBy: clone(actor),
    status: "active",
  };
}
function findEntity(state, entityId) {
  for (const [kind, collection] of Object.entries(ENTITY_COLLECTIONS)) {
    if (state.entities[collection][entityId])
      return {
        kind: kind,
        collection,
        entity: state.entities[collection][entityId],
      };
  }
  return null;
}
function requireEntity(state, entityId) {
  const result = findEntity(state, entityId);
  (0, errors_js_1.invariant)(
    result,
    "entity_not_found",
    `entity not found: ${entityId}`,
  );
  return result;
}
function validateRefs(state, refs = []) {
  (0, errors_js_1.invariant)(
    Array.isArray(refs),
    "invalid_reference",
    "references must be an array",
  );
  for (const ref of refs) {
    (0, errors_js_1.invariant)(
      typeof ref === "string",
      "invalid_reference",
      "references must be entity IDs",
    );
    requireEntity(state, ref);
  }
}
function validateCodeReference(ref, workspace) {
  (0, errors_js_1.invariant)(
    typeof ref.path === "string" &&
      ref.path &&
      !ref.path.startsWith("/") &&
      !ref.path.split(/[\\/]/).includes(".."),
    "invalid_code_reference",
    "code reference path must stay inside the repository",
  );
  (0, errors_js_1.invariant)(
    typeof ref.side === "string" &&
      ["base", "head", "working"].includes(ref.side),
    "invalid_code_reference",
    "code reference side must be base, head, or working",
  );
  if (ref.startLine !== undefined || ref.endLine !== undefined) {
    (0, errors_js_1.invariant)(
      typeof ref.startLine === "number" &&
        Number.isInteger(ref.startLine) &&
        typeof ref.endLine === "number" &&
        Number.isInteger(ref.endLine) &&
        ref.startLine >= 1 &&
        ref.endLine >= ref.startLine,
      "invalid_code_reference",
      "code reference lines must be a valid 1-based range",
    );
  }
  void workspace;
}
function makeEntity(state, command, actor, occurredAt) {
  const name = command.type
    .slice(3)
    .replace(/^CodeReference$/, "codeReference")
    .replace(/^./, (c) => c.toLowerCase());
  (0, errors_js_1.invariant)(
    Object.hasOwn(ENTITY_COLLECTIONS, name),
    "unknown_command",
    `unsupported entity command: ${command.type}`,
  );
  const kind = name;
  const input = command.entity || command[kind];
  (0, errors_js_1.invariant)(
    input && typeof input === "object",
    "invalid_command",
    `${command.type} requires entity data`,
  );
  const entity = entityBase(kind, input, actor, occurredAt);
  if (["requirement", "assumption", "invariant"].includes(kind))
    (0, errors_js_1.invariant)(
      typeof entity.statement === "string" && entity.statement.trim(),
      `invalid_${kind}`,
      `${kind} requires a statement`,
    );
  if (kind === "decision")
    (0, errors_js_1.invariant)(
      typeof entity.chosen === "string" && entity.chosen.trim(),
      "invalid_decision",
      "decision requires a chosen approach",
    );
  if (kind === "claim") {
    (0, errors_js_1.invariant)(
      typeof entity.statement === "string" && entity.statement.trim(),
      "invalid_claim",
      "claim requires a statement",
    );
    entity.disposition ||= "unexamined";
    (0, errors_js_1.invariant)(
      CLAIM_DISPOSITIONS.has(entity.disposition),
      "invalid_disposition",
      `invalid claim disposition: ${entity.disposition}`,
    );
  }
  if (kind === "risk") {
    const concern = entity.concern || entity.statement;
    (0, errors_js_1.invariant)(
      typeof concern === "string" && concern.trim(),
      "invalid_risk",
      "risk requires a concern",
    );
    entity.disposition ||= "open";
    (0, errors_js_1.invariant)(
      RISK_DISPOSITIONS.has(entity.disposition),
      "invalid_disposition",
      `invalid risk disposition: ${entity.disposition}`,
    );
  }
  if (kind === "evidence") {
    entity.freshness ||= "current";
    entity.changeRevisionId ||= state.currentChangeRevisionId;
    (0, errors_js_1.invariant)(
      typeof entity.observation === "string" && entity.observation.trim(),
      "invalid_evidence",
      "evidence requires an observation",
    );
    (0, errors_js_1.invariant)(
      ["current", "stale", "inapplicable", "unknown", "missing"].includes(
        entity.freshness,
      ),
      "invalid_freshness",
      `invalid evidence freshness: ${entity.freshness}`,
    );
  }
  if (kind === "question" || kind === "concern") {
    (0, errors_js_1.invariant)(
      typeof entity[kind] === "string" && entity[kind].trim(),
      `invalid_${kind}`,
      `${kind} requires text`,
    );
    entity.disposition ||= "open";
    (0, errors_js_1.invariant)(
      QUESTION_STATES.has(entity.disposition),
      "invalid_disposition",
      `invalid question disposition: ${entity.disposition}`,
    );
  }
  if (kind === "codeReference")
    validateCodeReference(entity, state.repository.workspace);
  for (const field of [
    "relatedEntityIds",
    "requirementRefs",
    "claimRefs",
    "codeRefs",
    "evidenceRefs",
    "decisionRefs",
    "riskRefs",
  ])
    if (entity[field]) validateRefs(state, entity[field]);
  return { kind, collection: ENTITY_COLLECTIONS[kind], entity };
}
function eventForCommand(state, input, actor, occurredAt = now()) {
  const command = (0, readers_js_1.readCommand)(input);
  (0, errors_js_1.invariant)(
    command && typeof command.type === "string",
    "invalid_command",
    "every command requires a type",
  );
  validateActor(actor);
  if (state.phase === "archived")
    throw new errors_js_1.ReviewMapError(
      "map_archived",
      "the review map is archived and read-only",
    );
  if (command.type === "SetThesis") {
    const thesis = command.thesis;
    (0, errors_js_1.invariant)(
      thesis && typeof thesis.summary === "string" && thesis.summary.trim(),
      "invalid_thesis",
      "thesis requires a non-empty summary",
    );
    validateProvenance(thesis.provenance);
    return { eventType: "ThesisSet", payload: { thesis: clone(thesis) } };
  }
  if (
    /^Add(Requirement|Claim|Decision|Assumption|Invariant|Risk|Evidence|CodeReference|Question|Concern)$/.test(
      command.type,
    )
  ) {
    const made = makeEntity(state, command, actor, occurredAt);
    (0, errors_js_1.invariant)(
      !state.entities[made.collection][made.entity.id],
      "duplicate_entity",
      `entity already exists: ${made.entity.id}`,
    );
    return {
      eventType: `${command.type.slice(3)}Added`,
      payload: made,
    };
  }
  if (command.type === "RecordQuestion" || command.type === "RecordConcern") {
    const noun = command.type.slice(6);
    const alias = {
      ...command,
      type: `Add${noun}`,
    };
    const made = makeEntity(state, alias, actor, occurredAt);
    (0, errors_js_1.invariant)(
      !state.entities[made.collection][made.entity.id],
      "duplicate_entity",
      `entity already exists: ${made.entity.id}`,
    );
    return { eventType: `${noun}Recorded`, payload: made };
  }
  if (command.type === "AddRelationship") {
    const relationship = {
      ...clone(command.relationship),
      id: command.relationship?.id || (0, canonical_js_1.id)("rel"),
    };
    (0, errors_js_1.invariant)(
      relationship.from &&
        relationship.to &&
        RELATIONSHIP_TYPES.has(relationship.type),
      "invalid_relationship",
      "relationship requires from, a supported type, and to",
    );
    requireEntity(state, relationship.from);
    requireEntity(state, relationship.to);
    validateProvenance(relationship.provenance);
    (0, errors_js_1.invariant)(
      !state.relationships[relationship.id],
      "duplicate_relationship",
      `relationship already exists: ${relationship.id}`,
    );
    return { eventType: "RelationshipAdded", payload: { relationship } };
  }
  if (command.type === "CreateTourPlan") {
    (0, errors_js_1.invariant)(
      command.presentationVersion === 2,
      "invalid_tour_plan",
      "tour plans require presentationVersion 2",
    );
    (0, errors_js_1.invariant)(
      Array.isArray(command.stops) && command.stops.length > 0,
      "invalid_tour_plan",
      "tour plan requires at least one stop",
    );
    const planId = command.id || (0, canonical_js_1.id)("pln");
    const stops = command.stops.map((stop, index) => {
      const coveredEntityIds = stop.coveredEntityIds || [];
      validateRefs(state, coveredEntityIds);
      (0, errors_js_1.invariant)(
        stop.type === "context" || coveredEntityIds.length > 0,
        "invalid_tour_stop",
        "non-context stops must cover at least one entity",
      );
      return {
        ...clone(stop),
        id: stop.id || (0, canonical_js_1.id)("stp"),
        index: index + 1,
        coveredEntityIds,
        reviewState: "not-visited",
        reviewedAtChangeRevisionId: null,
      };
    });
    return {
      eventType: "TourPlanCreated",
      payload: {
        plan: {
          id: planId,
          version: 1,
          presentationVersion: 2,
          title: command.title || state.title,
          createdAt: occurredAt,
          createdBy: clone(actor),
          stops,
        },
      },
    };
  }
  if (command.type === "MarkPrepared") {
    (0, errors_js_1.invariant)(
      state.thesis,
      "not_ready",
      "a thesis is required before preparation",
    );
    (0, errors_js_1.invariant)(
      Object.keys(state.entities.claims).length > 0,
      "not_ready",
      "at least one claim is required before preparation",
    );
    (0, errors_js_1.invariant)(
      state.currentTourPlanId,
      "not_ready",
      "a tour plan is required before preparation",
    );
    return { eventType: "ReviewMapPrepared", payload: {} };
  }
  if (command.type === "StartReviewSession") {
    (0, errors_js_1.invariant)(
      state.phase === "prepared",
      "not_prepared",
      "prepare the review map before starting review",
    );
    (0, errors_js_1.invariant)(
      state.currentTourPlanId,
      "not_ready",
      "a tour plan is required before review",
    );
    const sessionId = command.sessionId || (0, canonical_js_1.id)("ses");
    return {
      eventType: "ReviewSessionStarted",
      payload: {
        session: {
          id: sessionId,
          reviewer: clone(command.reviewer || actor),
          state: "in_progress",
          outcome: null,
          tourPlanId: state.currentTourPlanId,
          tourPlanVersion:
            state.tourPlans[state.currentTourPlanId || ""].version,
          changeRevisionId: state.currentChangeRevisionId,
          currentStopId: null,
          startedAt: occurredAt,
          updatedAt: occurredAt,
        },
      },
    };
  }
  if (command.type === "StartStop") {
    const session = state.reviewSessions[command.sessionId];
    (0, errors_js_1.invariant)(
      session?.state === "in_progress",
      "invalid_session_state",
      "review session must be in progress",
    );
    const stop = state.tourPlans[session.tourPlanId]?.stops.find(
      (candidate) => candidate.id === command.stopId,
    );
    (0, errors_js_1.invariant)(
      stop,
      "stop_not_found",
      `stop not found: ${command.stopId}`,
    );
    return {
      eventType: "StopStarted",
      payload: { sessionId: command.sessionId, stopId: command.stopId },
    };
  }
  if (command.type === "SetClaimDisposition") {
    const found = requireEntity(state, command.claimId);
    (0, errors_js_1.invariant)(
      found.kind === "claim",
      "wrong_entity_type",
      `${command.claimId} is not a claim`,
    );
    (0, errors_js_1.invariant)(
      CLAIM_DISPOSITIONS.has(command.disposition),
      "invalid_disposition",
      `invalid claim disposition: ${command.disposition}`,
    );
    return {
      eventType: "ClaimDispositionChanged",
      payload: {
        entityId: command.claimId,
        disposition: command.disposition,
        rationale: command.rationale || null,
      },
    };
  }
  if (command.type === "SetRiskDisposition") {
    const found = requireEntity(state, command.riskId);
    (0, errors_js_1.invariant)(
      found.kind === "risk",
      "wrong_entity_type",
      `${command.riskId} is not a risk`,
    );
    (0, errors_js_1.invariant)(
      RISK_DISPOSITIONS.has(command.disposition),
      "invalid_disposition",
      `invalid risk disposition: ${command.disposition}`,
    );
    return {
      eventType: "RiskDispositionChanged",
      payload: {
        entityId: command.riskId,
        disposition: command.disposition,
        rationale: command.rationale || null,
      },
    };
  }
  if (command.type === "SetStopReviewState") {
    (0, errors_js_1.invariant)(
      STOP_STATES.has(command.reviewState),
      "invalid_review_state",
      `invalid stop review state: ${command.reviewState}`,
    );
    const plan = state.tourPlans[state.currentTourPlanId || ""];
    (0, errors_js_1.invariant)(
      plan?.stops.some((stop) => stop.id === command.stopId),
      "stop_not_found",
      `stop not found: ${command.stopId}`,
    );
    const session = state.reviewSessions[command.sessionId];
    (0, errors_js_1.invariant)(
      session?.state === "in_progress" && session.tourPlanId === plan.id,
      "invalid_session_state",
      "an in-progress session for this tour is required",
    );
    return {
      eventType: "StopReviewStateChanged",
      payload: {
        stopId: command.stopId,
        reviewState: command.reviewState,
        changeRevisionId: state.currentChangeRevisionId,
        note: command.note || null,
      },
    };
  }
  if (command.type === "RecordAnswer") {
    const found = requireEntity(state, command.questionId);
    (0, errors_js_1.invariant)(
      found.kind === "question" || found.kind === "concern",
      "wrong_entity_type",
      `${command.questionId} cannot be answered`,
    );
    validateProvenance(command.provenance);
    const disposition = command.disposition || "answered";
    (0, errors_js_1.invariant)(
      QUESTION_STATES.has(disposition),
      "invalid_disposition",
      `invalid question disposition: ${disposition}`,
    );
    return {
      eventType: "AnswerRecorded",
      payload: {
        entityId: command.questionId,
        answer: command.answer,
        provenance: clone(command.provenance),
        disposition,
      },
    };
  }
  if (
    command.type === "PauseReviewSession" ||
    command.type === "ResumeReviewSession" ||
    command.type === "CompleteReviewSession"
  ) {
    const session = state.reviewSessions[command.sessionId];
    (0, errors_js_1.invariant)(
      session,
      "session_not_found",
      `session not found: ${command.sessionId}`,
    );
    const allowed =
      command.type === "PauseReviewSession"
        ? session.state === "in_progress"
        : command.type === "ResumeReviewSession"
          ? session.state === "paused"
          : session.state === "in_progress" || session.state === "paused";
    (0, errors_js_1.invariant)(
      allowed,
      "invalid_session_state",
      `${command.type} is not valid from ${session.state}`,
    );
    if (command.type === "CompleteReviewSession")
      (0, errors_js_1.invariant)(
        [
          "ready-to-approve",
          "changes-requested",
          "deferred",
          "informational-only",
        ].includes(command.outcome || ""),
        "invalid_outcome",
        "completion requires an explicit review outcome",
      );
    return {
      eventType: command.type,
      payload: {
        sessionId: command.sessionId,
        outcome: command.outcome || null,
      },
    };
  }
  if (command.type === "CorrectEntity") {
    const found = requireEntity(state, command.entityId);
    validateProvenance(command.provenance);
    (0, errors_js_1.invariant)(
      command.changes &&
        typeof command.changes === "object" &&
        !Array.isArray(command.changes),
      "invalid_correction",
      "changes must be an object",
    );
    const forbidden = ["id", "entityType", "createdAt", "createdBy", "version"];
    (0, errors_js_1.invariant)(
      !forbidden.some((key) => key in command.changes),
      "invalid_correction",
      "identity and audit fields cannot be corrected",
    );
    return {
      eventType: "EntityCorrected",
      payload: {
        collection: found.collection,
        entityId: command.entityId,
        changes: clone(command.changes),
        provenance: clone(command.provenance),
      },
    };
  }
  if (command.type === "ArchiveReviewMap")
    return { eventType: "ReviewMapArchived", payload: {} };
  throw new errors_js_1.ReviewMapError(
    "unknown_command",
    `unknown review map command: ${command.type}`,
  );
}
function applyEvent(state, event) {
  if (event.eventType === "ReviewMapCreated")
    state = newAggregate(event.payload);
  else {
    (0, errors_js_1.invariant)(
      state,
      "corrupt_history",
      "event history does not begin with ReviewMapCreated",
    );
    const { eventType, payload: p } = event;
    if (eventType === "ThesisSet") state.thesis = p.thesis;
    else if (
      eventType === "RequirementAdded" ||
      eventType === "ClaimAdded" ||
      eventType === "DecisionAdded" ||
      eventType === "AssumptionAdded" ||
      eventType === "InvariantAdded" ||
      eventType === "RiskAdded" ||
      eventType === "EvidenceAdded" ||
      eventType === "CodeReferenceAdded" ||
      eventType === "QuestionAdded" ||
      eventType === "ConcernAdded" ||
      eventType === "QuestionRecorded" ||
      eventType === "ConcernRecorded"
    )
      state.entities[p.collection][p.entity.id] = p.entity;
    else if (eventType === "RelationshipAdded")
      state.relationships[p.relationship.id] = p.relationship;
    else if (eventType === "TourPlanCreated") {
      state.tourPlans[p.plan.id] = p.plan;
      state.currentTourPlanId = p.plan.id;
    } else if (eventType === "ReviewMapPrepared") state.phase = "prepared";
    else if (eventType === "ReviewSessionStarted")
      state.reviewSessions[p.session.id] = p.session;
    else if (eventType === "StopStarted") {
      const s = state.reviewSessions[p.sessionId];
      s.currentStopId = p.stopId;
      const stop = state.tourPlans[s.tourPlanId].stops.find(
        (x) => x.id === p.stopId,
      );
      (0, errors_js_1.invariant)(
        stop,
        "corrupt_history",
        `stop not found: ${p.stopId}`,
      );
      if (stop.reviewState === "not-visited") stop.reviewState = "presented";
    } else if (eventType === "ClaimDispositionChanged")
      state.entities.claims[p.entityId].disposition = p.disposition;
    else if (eventType === "RiskDispositionChanged")
      state.entities.risks[p.entityId].disposition = p.disposition;
    else if (eventType === "StopReviewStateChanged") {
      const stop = state.tourPlans[state.currentTourPlanId || ""].stops.find(
        (x) => x.id === p.stopId,
      );
      (0, errors_js_1.invariant)(
        stop,
        "corrupt_history",
        `stop not found: ${p.stopId}`,
      );
      stop.reviewState = p.reviewState;
      stop.reviewedAtChangeRevisionId = p.changeRevisionId;
      if (p.note) stop.note = p.note;
    } else if (eventType === "AnswerRecorded") {
      const found = requireEntity(state, p.entityId).entity;
      found.answers ||= [];
      found.answers.push({
        answer: p.answer,
        provenance: p.provenance,
        recordedAt: event.occurredAt,
      });
      found.disposition = p.disposition;
    } else if (eventType === "PauseReviewSession")
      state.reviewSessions[p.sessionId].state = "paused";
    else if (eventType === "ResumeReviewSession")
      state.reviewSessions[p.sessionId].state = "in_progress";
    else if (eventType === "CompleteReviewSession") {
      state.reviewSessions[p.sessionId].state = "completed";
      state.reviewSessions[p.sessionId].outcome = p.outcome;
    } else if (eventType === "EntityCorrected") {
      const old = state.entities[p.collection][p.entityId];
      Object.assign(old, p.changes, {
        version: old.version + 1,
        updatedAt: event.occurredAt,
      });
      old.provenance.push(...p.provenance);
    } else if (eventType === "ChangeRevisionAdded") {
      currentRevision(state).state = "superseded";
      state.changeRevisions.push(p.changeRevision);
      state.currentChangeRevisionId = p.changeRevision.id;
      for (const evidence of Object.values(state.entities.evidence))
        if (evidence.status === "active") evidence.freshness = "stale";
      for (const plan of Object.values(state.tourPlans))
        for (const stop of plan.stops)
          if (
            ["presented", "reviewed", "reviewed-with-concern"].includes(
              stop.reviewState,
            )
          )
            stop.reviewState = "invalidated";
    } else if (eventType === "DriftDetected")
      currentRevision(state).state = "stale";
    else if (eventType === "ReceiptEmitted") state.receipts.push(p.receiptRef);
    else if (eventType === "ReviewMapArchived") {
      state.phase = "archived";
      state.archivedAt = event.occurredAt;
    } else
      throw new errors_js_1.ReviewMapError(
        "unknown_event",
        `unknown event type: ${eventType}`,
      );
  }
  state.aggregateRevision = event.sequence;
  state.updatedAt = event.occurredAt;
  state.lastEventHash = event.eventHash;
  for (const session of Object.values(state.reviewSessions || {}))
    if (
      session.updatedAt !== event.occurredAt &&
      event.changeRevisionId === session.changeRevisionId
    )
      session.updatedAt = event.occurredAt;
  return state;
}
function currentRevision(state) {
  const revision = state.changeRevisions.find(
    (item) => item.id === state.currentChangeRevisionId,
  );
  (0, errors_js_1.invariant)(
    revision,
    "corrupt_history",
    "current change revision is missing",
  );
  return revision;
}
function replay(events) {
  const state = events.reduce((state, event) => applyEvent(state, event), null);
  (0, errors_js_1.invariant)(
    state,
    "corrupt_history",
    "event history is empty",
  );
  return state;
}
function projectionOverview(state) {
  const values = (name) =>
    Object.values(state.entities[name]).filter(
      (item) => item.status !== "redacted",
    );
  const stops = state.currentTourPlanId
    ? state.tourPlans[state.currentTourPlanId || ""].stops
    : [];
  return {
    mapId: state.id,
    title: state.title,
    phase: state.phase,
    aggregateRevision: state.aggregateRevision,
    changeRevision: currentRevision(state),
    thesis: state.thesis,
    counts: {
      requirements: values("requirements").length,
      claims: values("claims").length,
      decisions: values("decisions").length,
      risks: values("risks").length,
      evidence: values("evidence").length,
      questions: values("questions").length,
      concerns: values("concerns").length,
      stops: stops.length,
    },
    claimDispositions: countBy(values("claims"), "disposition"),
    riskDispositions: countBy(values("risks"), "disposition"),
    evidenceFreshness: countBy(values("evidence"), "freshness"),
    stopStates: countBy(stops, "reviewState"),
  };
}
function countBy(items, key) {
  return Object.fromEntries(
    [
      ...items.reduce(
        (map, item) =>
          map.set(
            item[key] || "unknown",
            (map.get(item[key] || "unknown") || 0) + 1,
          ),
        new Map(),
      ),
    ].sort(),
  );
}
