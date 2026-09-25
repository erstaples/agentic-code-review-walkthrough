// Generated from TypeScript. Run npm run runtime:build in editor-extension.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewMapService = void 0;
exports.selectionFor = selectionFor;
exports.compareManifests = compareManifests;
exports.redactSensitive = redactSensitive;
const input_js_1 = require("../input.js");
const readers_js_1 = require("./readers.js");
const fs = require("node:fs");
const file_store_js_1 = require("./file-store.js");
const git_adapter_js_1 = require("./git-adapter.js");
const domain_js_1 = require("./domain.js");
const receipt_js_1 = require("./receipt.js");
const canonical_js_1 = require("./canonical.js");
const errors_js_1 = require("./errors.js");
const tour_js_1 = require("../../../shared/tour.js");
const tour_sources_js_1 = require("../../../shared/tour-sources.js");
const REVIEW_COMMANDS = new Set([
  "StartReviewSession",
  "StartStop",
  "SetClaimDisposition",
  "SetRiskDisposition",
  "SetStopReviewState",
  "RecordQuestion",
  "RecordConcern",
  "RecordAnswer",
  "PauseReviewSession",
  "ResumeReviewSession",
  "CompleteReviewSession",
]);
const SENSITIVE_KEY =
  /^(?:password|passwd|secret|token|api[_-]?key|authorization|credential)$/i;
function redactSensitive(value, key = "") {
  if (SENSITIVE_KEY.test(key) && typeof value === "string")
    return { value: "[REDACTED]", redacted: true };
  if (typeof value === "string") {
    let next = value.replace(
      /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
      "[REDACTED PRIVATE KEY]",
    );
    next = next.replace(/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED AWS ACCESS KEY]");
    next = next.replace(
      /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi,
      "Bearer [REDACTED]",
    );
    return { value: next, redacted: next !== value };
  }
  if (Array.isArray(value)) {
    let redacted = false;
    const next = value.map((item) => {
      const result = redactSensitive(item);
      redacted ||= result.redacted;
      return result.value;
    });
    return { value: next, redacted };
  }
  if (value && typeof value === "object") {
    let redacted = false;
    const next = {};
    for (const [childKey, childValue] of Object.entries(value)) {
      const result = redactSensitive(childValue, childKey);
      redacted ||= result.redacted;
      next[childKey] = result.value;
    }
    return { value: next, redacted };
  }
  return { value, redacted: false };
}
function selectionFor(change) {
  if (change.kind === "committed")
    return {
      kind: "committed",
      base: change.manifest.baseCommit,
      head: change.manifest.headCommit,
      diffMode: change.manifest.diffMode,
    };
  return {
    kind: "working-tree",
    baseline: change.manifest.baselineCommit,
    includeStaged: change.manifest.includeStaged,
    includeUnstaged: change.manifest.includeUnstaged,
    includeUntracked: change.manifest.includeUntracked,
  };
}
const currentChange = domain_js_1.currentRevision;
function openItems(state) {
  return {
    questions: Object.values(state.entities.questions).filter(
      (item) => item.disposition === "open",
    ),
    concerns: Object.values(state.entities.concerns).filter(
      (item) => item.disposition === "open",
    ),
    risks: Object.values(state.entities.risks).filter(
      (item) => item.disposition === "open",
    ),
  };
}
class ReviewMapService {
  store;
  tourAnchorLimit;
  constructor(options = {}) {
    this.store =
      options.store || new file_store_js_1.FileReviewMapStore(options);
    this.tourAnchorLimit = (0, tour_js_1.assertHardLimit)(
      options.tourAnchorLimit,
    );
  }
  validateTour(state, plan) {
    return (0, tour_js_1.validateTourPlan)(plan, {
      ...(0, tour_sources_js_1.tourSources)(
        state.repository.workspace,
        currentChange(state),
      ),
      hardLimit: this.tourAnchorLimit,
      claims: Object.values(state.entities.claims),
    });
  }
  loadTour(args) {
    const { state } = this.locate(args.workspace, args.mapId);
    const fresh = this.freshness(state);
    (0, errors_js_1.invariant)(
      fresh.freshness === "current",
      "stale_change",
      "Refresh the review map before loading changed sources.",
      fresh,
    );
    const plan = state.tourPlans[state.currentTourPlanId || ""];
    (0, errors_js_1.invariant)(
      plan,
      "invalid_tour_plan",
      "Create a complete tour plan before loading it.",
    );
    const checked = this.validateTour(state, plan);
    (0, errors_js_1.invariant)(
      checked.ok,
      "invalid_tour_plan",
      "Fix tour validation findings before loading.",
      { findings: checked.findings },
    );
    return {
      workspace: state.repository.workspace,
      tourId: state.id,
      plan: checked.plan,
      change: currentChange(state),
      claims: Object.values(state.entities.claims).map(
        ({ id, truthStatus, status, disposition }) => ({
          id,
          truthStatus,
          status,
          disposition,
        }),
      ),
      findings: checked.findings,
    };
  }
  open(args) {
    (0, domain_js_1.validateActor)(args.actor);
    const identity = (0, git_adapter_js_1.resolveChange)(
      args.workspace,
      args.selection,
    );
    const existing = args.forceNew
      ? null
      : this.store.find(identity.repositoryKey, identity.manifestDigest);
    if (existing) {
      const state = this.store.load(identity.repositoryKey, existing.id);
      return {
        ...(0, domain_js_1.projectionOverview)(state),
        freshness: "current",
        requiredNextAction: this.nextAction(state),
        storage: this.store.inspect(identity.repositoryKey, state.id),
      };
    }
    const related = args.forceNew
      ? null
      : this.store.related(identity.repositoryKey);
    let lineageRelated = null;
    if (related) {
      const relatedState = this.store.load(identity.repositoryKey, related.id);
      const old = currentChange(relatedState).manifest;
      const sameLineage =
        old.kind === identity.manifest.kind &&
        (identity.manifest.kind === "committed"
          ? old.effectiveBase === identity.manifest.effectiveBase
          : old.baselineCommit === identity.manifest.baselineCommit);
      if (sameLineage) lineageRelated = related;
    }
    if (lineageRelated)
      return {
        found: false,
        freshness: "stale",
        resolvedChange: {
          kind: identity.kind,
          manifestDigest: identity.manifestDigest,
        },
        relatedMapId: lineageRelated.id,
        relatedAggregateRevision: lineageRelated.aggregateRevision,
        requiredNextAction: "refresh",
      };
    if (args.createIfMissing === false)
      return {
        found: false,
        freshness: "missing",
        resolvedChange: {
          kind: identity.kind,
          manifestDigest: identity.manifestDigest,
        },
        relatedMapId: null,
        requiredNextAction: "create",
      };
    const state = this.store.create({
      identity,
      title: args.title,
      actor: args.actor,
    });
    return {
      ...(0, domain_js_1.projectionOverview)(state),
      freshness: "current",
      requiredNextAction: "prepare",
      storage: this.store.inspect(identity.repositoryKey, state.id),
      relatedMapId: related?.id || null,
    };
  }
  nextAction(state) {
    if (state.phase === "draft") return "prepare";
    const active = Object.values(state.reviewSessions).find(
      (item) => item.state === "in_progress" || item.state === "paused",
    );
    if (active) return "resume";
    return "start";
  }
  locate(workspace, mapId) {
    const repository = (0, git_adapter_js_1.repositoryIdentity)(workspace);
    return {
      repository,
      state: this.store.load(repository.repositoryKey, mapId),
    };
  }
  freshness(state) {
    const change = currentChange(state);
    try {
      const actual = (0, git_adapter_js_1.resolveChange)(
        state.repository.workspace,
        selectionFor(change),
      );
      return {
        freshness:
          actual.manifestDigest === change.manifestDigest ? "current" : "stale",
        expectedDigest: change.manifestDigest,
        actualDigest: actual.manifestDigest,
      };
    } catch (error) {
      return {
        freshness: "unresolvable",
        expectedDigest: change.manifestDigest,
        error: {
          code: (0, input_js_1.errorFields)(error).code || "git_failed",
          message: (0, input_js_1.errorFields)(error).message,
        },
      };
    }
  }
  get(args) {
    return this.getProjection(args);
  }
  getProjection(args) {
    const { repository, state } = this.locate(args.workspace, args.mapId);
    const selector = args.selector || { kind: "overview" };
    if (selector.kind === "overview")
      return {
        ...(0, domain_js_1.projectionOverview)(state),
        ...this.freshness(state),
        requiredNextAction: this.nextAction(state),
      };
    if (selector.kind === "entity") {
      const found = (0, domain_js_1.findEntity)(state, selector.id || "");
      (0, errors_js_1.invariant)(
        found,
        "entity_not_found",
        `entity not found: ${selector.id}`,
      );
      return found.entity;
    }
    if (selector.kind === "entities") {
      (0, errors_js_1.invariant)(
        selector.type && Object.hasOwn(state.entities, selector.type),
        "invalid_selector",
        `unknown entity collection: ${selector.type}`,
      );
      const collection = selector.type;
      let entities = Object.values(state.entities[collection]);
      if (selector.stopId) {
        const stop = state.tourPlans[state.currentTourPlanId || ""]?.stops.find(
          (item) => item.id === selector.stopId,
        );
        (0, errors_js_1.invariant)(
          stop,
          "stop_not_found",
          `stop not found: ${selector.stopId}`,
        );
        entities = entities.filter((item) =>
          stop.coveredEntityIds.includes(item.id),
        );
      }
      return { entities: entities.sort((a, b) => a.id.localeCompare(b.id)) };
    }
    if (selector.kind === "tour") {
      const plan = state.tourPlans[state.currentTourPlanId || ""] || null;
      return {
        plan,
        sessions: Object.values(state.reviewSessions),
        freshness: this.freshness(state).freshness,
      };
    }
    if (selector.kind === "open-items") return openItems(state);
    if (selector.kind === "evidence-matrix")
      return {
        claims: Object.values(state.entities.claims).map((claim) => ({
          id: claim.id,
          statement: claim.statement,
          disposition: claim.disposition,
          evidence: (claim.evidenceRefs || [])
            .map((ref) => state.entities.evidence[ref])
            .filter(Boolean),
        })),
      };
    if (selector.kind === "recap") {
      const session =
        state.reviewSessions[selector.sessionId || ""] ||
        Object.values(state.reviewSessions).at(-1);
      (0, errors_js_1.invariant)(
        session,
        "session_not_found",
        "no review session exists",
      );
      const plan = state.tourPlans[session.tourPlanId];
      return {
        session,
        completedStops: plan.stops.filter((stop) =>
          ["reviewed", "reviewed-with-concern", "skipped"].includes(
            stop.reviewState,
          ),
        ),
        remainingStops: plan.stops.filter((stop) =>
          ["not-visited", "presented", "blocked", "invalidated"].includes(
            stop.reviewState,
          ),
        ),
        openItems: openItems(state),
        freshness: this.freshness(state).freshness,
      };
    }
    if (selector.kind === "storage")
      return this.store.inspect(repository.repositoryKey, state.id);
    throw new errors_js_1.ReviewMapError(
      "invalid_selector",
      `unknown selector: ${selector.kind}`,
    );
  }
  apply(args) {
    (0, domain_js_1.validateActor)(args.actor);
    (0, errors_js_1.invariant)(
      Array.isArray(args.commands) && args.commands.length > 0,
      "invalid_commands",
      "commands must be a non-empty array",
    );
    const sanitized = redactSensitive(args.commands);
    (0, errors_js_1.invariant)(
      Array.isArray(sanitized.value),
      "invalid_commands",
      "commands must be an array",
    );
    const commands = sanitized.value.map((value) => {
      (0, errors_js_1.invariant)(
        (0, input_js_1.isRecord)(value) && typeof value.type === "string",
        "invalid_command",
        "every command requires a type",
      );
      return value;
    });
    const findings = [];
    const { repository } = this.locate(args.workspace, args.mapId);
    let blobsStored = 0;
    for (const command of commands) {
      if (command.type !== "AddEvidence") continue;
      const input = command.entity || command.evidence;
      const evidence = input
        ? (0, readers_js_1.readEntityInput)(input)
        : undefined;
      if (
        !evidence ||
        (evidence.rawOutput === undefined &&
          evidence.rawBytesBase64 === undefined)
      )
        continue;
      (0, errors_js_1.invariant)(
        !(
          evidence.rawOutput !== undefined &&
          evidence.rawBytesBase64 !== undefined
        ),
        "invalid_blob",
        "provide rawOutput or rawBytesBase64, not both",
      );
      const encoding = evidence.rawOutput !== undefined ? "utf8" : "base64";
      const bytes = Buffer.from(
        evidence.rawOutput !== undefined
          ? evidence.rawOutput
          : evidence.rawBytesBase64 || "",
        encoding,
      );
      const blob = this.store.storeEvidenceBlob(
        repository.repositoryKey,
        args.mapId,
        bytes,
      );
      delete evidence.rawOutput;
      delete evidence.rawBytesBase64;
      evidence.blobRef = { ...blob, encoding };
      blobsStored++;
    }
    const result = this.store.mutate(
      repository.repositoryKey,
      args.mapId,
      args.expectedRevision,
      args.actor,
      (initialState) => {
        if (
          commands.some(
            (command) =>
              typeof command.type === "string" &&
              REVIEW_COMMANDS.has(command.type),
          )
        ) {
          const fresh = this.freshness(initialState);
          (0, errors_js_1.invariant)(
            fresh.freshness === "current",
            "stale_change",
            "the reviewed change no longer matches this review map; refresh before recording review state",
            fresh,
          );
        }
        let state = structuredClone(initialState);
        const specs = [];
        for (const command of commands) {
          if (command.type === "CreateTourPlan") {
            const fresh = this.freshness(state);
            (0, errors_js_1.invariant)(
              fresh.freshness === "current",
              "stale_change",
              "refresh the review map before authoring a tour for changed sources",
              fresh,
            );
            const validated = this.validateTour(state, command);
            (0, errors_js_1.invariant)(
              validated.ok,
              "invalid_tour_plan",
              "Tour validation failed; fix the reported locations before loading.",
              { findings: validated.findings },
            );
            Object.assign(command, validated.plan);
            findings.push(...validated.findings);
          }
          if (command.type === "AddCodeReference") {
            const field = command.entity ? "entity" : "codeReference";
            command[field] = (0, git_adapter_js_1.resolveCodeReference)(
              initialState.repository.workspace,
              currentChange(initialState),
              (0, readers_js_1.readEntityInput)(command[field]),
            );
          }
          const spec = (0, domain_js_1.eventForCommand)(
            state,
            command,
            args.actor,
          );
          const mock = {
            ...spec,
            sequence: state.aggregateRevision + 1,
            occurredAt: new Date().toISOString(),
            eventHash: state.lastEventHash,
            changeRevisionId: state.currentChangeRevisionId,
          };
          state = (0, domain_js_1.applyEvent)(state, mock);
          specs.push(spec);
        }
        return specs;
      },
    );
    const warnings = findings
      .filter((f) => f.severity === "warning")
      .map((f) => f.message);
    if (
      commands.some((command) =>
        JSON.stringify(command).includes('"model-inferred"'),
      )
    )
      warnings.push(
        "This mutation includes model-inferred content; present it as reconstruction, not recorded intent.",
      );
    if (sanitized.redacted)
      warnings.push("Secret-shaped content was redacted before persistence.");
    if (blobsStored)
      warnings.push(
        `${blobsStored} bounded evidence blob${blobsStored === 1 ? " was" : "s were"} stored by content digest.`,
      );
    return {
      mapId: result.state.id,
      aggregateRevision: result.state.aggregateRevision,
      emittedEventIds: result.emittedEventIds,
      changed: (0, domain_js_1.projectionOverview)(result.state),
      warnings,
      findings,
    };
  }
  check(args) {
    const { state } = this.locate(args.workspace, args.mapId);
    const freshness = this.freshness(state);
    const plan = state.tourPlans[state.currentTourPlanId || ""];
    let findings = [];
    if (plan) {
      try {
        findings = this.validateTour(state, plan).findings;
      } catch (error) {
        findings = [
          {
            severity: "error",
            code: "source_unavailable",
            location: "stops",
            message: (0, input_js_1.errorFields)(error).message,
          },
        ];
      }
    }
    return {
      ok:
        freshness.freshness === "current" &&
        !findings.some((f) => f.severity === "error"),
      mapId: state.id,
      aggregateRevision: state.aggregateRevision,
      schemaValid: state.schemaVersion === domain_js_1.SCHEMA_VERSION,
      eventChainValid: true,
      ...freshness,
      findings,
    };
  }
  refresh(args) {
    (0, domain_js_1.validateActor)(args.actor);
    const identity = (0, git_adapter_js_1.resolveChange)(
      args.workspace,
      args.selection,
    );
    const { repository, state } = this.locate(args.workspace, args.mapId);
    const previous = currentChange(state);
    if (previous.manifestDigest === identity.manifestDigest)
      return {
        changed: false,
        aggregateRevision: state.aggregateRevision,
        freshness: "current",
      };
    const occurredAt = new Date().toISOString();
    const changeRevision = {
      id: (0, canonical_js_1.id)("rev"),
      state: "current",
      createdAt: occurredAt,
      kind: identity.kind,
      labels: identity.labels,
      manifest: identity.manifest,
      manifestDigest: identity.manifestDigest,
      previousChangeRevisionId: previous.id,
    };
    const result = this.store.mutate(
      repository.repositoryKey,
      state.id,
      args.expectedRevision,
      args.actor,
      () => [
        {
          eventType: "ChangeRevisionAdded",
          payload: {
            changeRevision,
            previousManifestDigest: previous.manifestDigest,
          },
          occurredAt,
          changeRevisionId: changeRevision.id,
        },
      ],
    );
    const invalidatedStops = Object.values(result.state.tourPlans).flatMap(
      (plan) =>
        plan.stops
          .filter((stop) => stop.reviewState === "invalidated")
          .map((stop) => stop.id),
    );
    return {
      changed: true,
      mapId: state.id,
      aggregateRevision: result.state.aggregateRevision,
      changeRevision,
      structuralDelta: compareManifests(previous.manifest, identity.manifest),
      invalidationPlan: {
        invalidatedStops,
        staleEvidence: Object.values(result.state.entities.evidence)
          .filter((item) => item.freshness === "stale")
          .map((item) => item.id),
        requiresSemanticReassessment: true,
      },
    };
  }
  receipt(args) {
    const { repository, state } = this.locate(args.workspace, args.mapId);
    const fresh = this.freshness(state);
    (0, errors_js_1.invariant)(
      fresh.freshness === "current",
      "stale_change",
      "a receipt cannot be produced for stale code",
      fresh,
    );
    const session = state.reviewSessions[args.sessionId];
    (0, errors_js_1.invariant)(
      session,
      "session_not_found",
      `session not found: ${args.sessionId}`,
    );
    if (args.mode === "emit") {
      (0, errors_js_1.invariant)(
        session.state === "completed",
        "review_incomplete",
        "complete the review session before emitting a receipt",
      );
      (0, errors_js_1.invariant)(
        Number.isInteger(args.expectedRevision),
        "expected_revision_required",
        "expectedRevision is required when emitting a receipt",
      );
    }
    const receipt = (0, receipt_js_1.buildReceipt)(state, args.sessionId, {
      supersedesReceiptId: args.supersedesReceiptId,
    });
    const markdown = (0, receipt_js_1.renderMarkdown)(receipt);
    if (args.mode !== "emit") return { mode: "preview", receipt, markdown };
    (0, errors_js_1.invariant)(
      typeof args.expectedRevision === "number",
      "expected_revision_required",
      "expectedRevision is required when emitting a receipt",
    );
    const jsonPath = this.store.writeReceipt(
      repository.repositoryKey,
      state.id,
      receipt,
    );
    const markdownPath = this.store.writeReceiptMarkdown(
      repository.repositoryKey,
      state.id,
      receipt.id,
      markdown,
    );
    try {
      const result = this.store.mutate(
        repository.repositoryKey,
        state.id,
        args.expectedRevision,
        args.actor,
        () => [
          {
            eventType: "ReceiptEmitted",
            payload: {
              receiptRef: {
                id: receipt.id,
                digest: receipt.digest,
                reviewSessionId: args.sessionId,
                changeRevisionId: state.currentChangeRevisionId,
                createdAt: receipt.createdAt,
                jsonPath,
                markdownPath,
              },
            },
          },
        ],
      );
      return {
        mode: "emit",
        receiptId: receipt.id,
        digest: receipt.digest,
        aggregateRevision: result.state.aggregateRevision,
        jsonPath,
        markdownPath,
      };
    } catch (error) {
      try {
        fs.unlinkSync(jsonPath);
        fs.unlinkSync(markdownPath);
      } catch {
        /* orphan cleanup is best effort */
      }
      throw error;
    }
  }
  delete(args) {
    (0, domain_js_1.validateActor)(args.actor);
    (0, errors_js_1.invariant)(
      args.confirmMapId === args.mapId,
      "confirmation_required",
      "confirmMapId must exactly match mapId",
    );
    const repository = (0, git_adapter_js_1.repositoryIdentity)(args.workspace);
    this.store.delete(repository.repositoryKey, args.mapId);
    return { deleted: true, mapId: args.mapId, recoverable: false };
  }
}
exports.ReviewMapService = ReviewMapService;
function compareManifests(before, after) {
  const beforeMap = new Map(
    (before.files || []).map((file) => [file.path, file]),
  );
  const afterMap = new Map(
    (after.files || []).map((file) => [file.path, file]),
  );
  return {
    added: [...afterMap.keys()].filter((key) => !beforeMap.has(key)).sort(),
    removed: [...beforeMap.keys()].filter((key) => !afterMap.has(key)).sort(),
    modified: [...afterMap.keys()]
      .filter(
        (key) =>
          beforeMap.has(key) &&
          JSON.stringify(beforeMap.get(key)) !==
            JSON.stringify(afterMap.get(key)),
      )
      .sort(),
  };
}
