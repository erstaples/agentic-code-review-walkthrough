"use strict";

const { request } = require("./bridge.js");
const { ChangeRecordService } = require("./notes/service.js");
const tourSchema = require("../../schemas/tour-plan.schema.json");

// MCP command schemas are embedded: expand local refs so clients can inspect
// the v2 shape without fetching an external schema document.
function inlineTourSchema(value) {
  if (Array.isArray(value)) return value.map(inlineTourSchema);
  if (!value || typeof value !== "object") return value;
  if (value.$ref) return inlineTourSchema(tourSchema.$defs[value.$ref.split("/").at(-1)]);
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, inlineTourSchema(child)]));
}

const WORKSPACE = {
  type: "string",
  description: "Absolute path to the repository root being toured. Resolve it with git rev-parse --show-toplevel.",
};

const BRIDGE_TOOLS = [
  { name: "kanko_tour_status", description: "Read the editor's current tour snapshot without changing it.", inputSchema: { type: "object", required: ["workspace"], properties: { workspace: WORKSPACE } } },
  { name: "kanko_tour_load", description: "Validate and load the current authored record tour into the editor. Returns findings, the current stop/beat, and terminal narration. Invalid tours leave the current display unchanged.", inputSchema: { type: "object", required: ["workspace", "recordId"], properties: { workspace: WORKSPACE, recordId: { type: "string" } } } },
  { name: "kanko_tour_navigate", description: "Navigate the loaded tour by stop or beat. Use goto with stopId and beatId for an exact destination. Presentation changes do not mark record claims or stops reviewed.", inputSchema: { type: "object", required: ["workspace", "action"], properties: { workspace: WORKSPACE, action: { enum: ["nextBeat", "previousBeat", "nextStop", "previousStop", "goto"] }, stopId: { type: "string" }, beatId: { type: "string" }, expectedRevision: { type: "integer", minimum: 0 } } } },
  { name: "kanko_tour_set_state", description: "Set following, exploring, or paused presentation mode for the loaded tour. Following reveals the selected anchor; exploring leaves the editor in place; paused removes presentation highlights.", inputSchema: { type: "object", required: ["workspace", "mode"], properties: { workspace: WORKSPACE, mode: { enum: ["following", "exploring", "paused"] }, expectedRevision: { type: "integer", minimum: 0 } } } },
  { name: "kanko_tour_clear", description: "End the current presentation and clear its sidebar and highlights. Does not complete a record review.", inputSchema: { type: "object", required: ["workspace"], properties: { workspace: WORKSPACE } } },
];

const ACTOR = {
  type: "object",
  required: ["kind", "id"],
  properties: {
    kind: { type: "string", description: "Actor class, for example agent or reviewer." },
    id: { type: "string", description: "Stable actor identifier within this review context." },
    displayName: { type: "string" },
  },
};

const SELECTION = {
  oneOf: [
    {
      type: "object", required: ["kind", "base", "head"],
      properties: { kind: { const: "committed" }, base: { type: "string" }, head: { type: "string" }, diffMode: { type: "string", enum: ["two-dot", "three-dot"] } },
    },
    {
      type: "object", required: ["kind"],
      properties: { kind: { const: "working-tree" }, baseline: { type: "string" }, includeStaged: { type: "boolean" }, includeUnstaged: { type: "boolean" }, includeUntracked: { type: "boolean" } },
    },
  ],
};

const RECORD_ID = { type: "string", pattern: "^rec_[0-9a-f-]+$" };
const EXPECTED_REVISION = { type: "integer", minimum: 1, description: "Aggregate revision returned by the latest record call. Prevents stale writers." };
const ENTITY_INPUT = { type: "object", description: "Typed entity fields plus a non-empty provenance array. The service assigns identity and audit fields." };
function command(type, required = [], properties = {}) {
  return { type: "object", required: ["type", ...required], properties: { type: { const: type }, ...properties } };
}
const COMMAND = {
  oneOf: [
    command("SetThesis", ["thesis"], { thesis: ENTITY_INPUT }),
    ...["Requirement", "Claim", "Decision", "Assumption", "Invariant", "Risk", "Evidence", "CodeReference"].map((noun) => command(`Add${noun}`, [noun[0].toLowerCase() + noun.slice(1)], { [noun[0].toLowerCase() + noun.slice(1)]: ENTITY_INPUT })),
    command("AddRelationship", ["relationship"], { relationship: ENTITY_INPUT }),
    command("CreateTourPlan", ["presentationVersion", "stops"], {
      title: { type: "string" }, presentationVersion: { const: 2 },
      stops: { type: "array", minItems: 1, items: inlineTourSchema(tourSchema.$defs.stop) },
    }),
    command("MarkPrepared"),
    command("StartReviewSession", [], { reviewer: ACTOR, sessionId: { type: "string" } }),
    command("StartStop", ["sessionId", "stopId"], { sessionId: { type: "string" }, stopId: { type: "string" } }),
    command("RecordQuestion", ["question"], { question: ENTITY_INPUT }),
    command("RecordConcern", ["concern"], { concern: ENTITY_INPUT }),
    command("RecordAnswer", ["questionId", "answer", "provenance"], { questionId: { type: "string" }, answer: { type: "string" }, provenance: { type: "array", minItems: 1 }, disposition: { type: "string" } }),
    command("SetClaimDisposition", ["claimId", "disposition"], { claimId: { type: "string" }, disposition: { type: "string" }, rationale: { type: "string" } }),
    command("SetRiskDisposition", ["riskId", "disposition"], { riskId: { type: "string" }, disposition: { type: "string" }, rationale: { type: "string" } }),
    command("SetStopReviewState", ["sessionId", "stopId", "reviewState"], { sessionId: { type: "string" }, stopId: { type: "string" }, reviewState: { type: "string" }, note: { type: "string" } }),
    ...["PauseReviewSession", "ResumeReviewSession"].map((type) => command(type, ["sessionId"], { sessionId: { type: "string" } })),
    command("CompleteReviewSession", ["sessionId", "outcome"], { sessionId: { type: "string" }, outcome: { type: "string", enum: ["ready-to-approve", "changes-requested", "deferred", "informational-only"] } }),
    command("CorrectEntity", ["entityId", "changes", "provenance"], { entityId: { type: "string" }, changes: { type: "object" }, provenance: { type: "array", minItems: 1 } }),
    command("ArchiveChangeRecord"),
  ],
};

const RECORD_TOOLS = [
  {
    name: "kanko_notes_open",
    description: "Resolve an exact Git change identity and open its local living change record, or create a private draft outside the repository. Does not run tests, fetch remotes, or modify source.",
    inputSchema: { type: "object", required: ["workspace", "selection", "actor"], properties: { workspace: WORKSPACE, selection: SELECTION, actor: ACTOR, title: { type: "string" }, createIfMissing: { type: "boolean", default: true }, forceNew: { type: "boolean", default: false, description: "Create a separate record even when the exact change or a related lineage already has one. Use only after confirming the existing record belongs to another task." } } },
  },
  {
    name: "kanko_notes_get",
    description: "Read a bounded record projection. Use overview first, then request only the entity, tour, recap, open items, evidence matrix, or storage location needed.",
    inputSchema: {
      type: "object", required: ["workspace", "recordId", "selector"],
      properties: {
        workspace: WORKSPACE, recordId: RECORD_ID,
        selector: { type: "object", required: ["kind"], properties: { kind: { type: "string", enum: ["overview", "entity", "entities", "tour", "open-items", "evidence-matrix", "recap", "storage"] }, id: { type: "string" }, type: { type: "string" }, stopId: { type: "string" }, sessionId: { type: "string" } } },
      },
    },
  },
  {
    name: "kanko_notes_apply",
    description: "Atomically apply typed record domain commands. Never submit JSON Patch or a rewritten record. Important statements require structured provenance; review mutations are rejected if code drifted.",
    inputSchema: { type: "object", required: ["workspace", "recordId", "expectedRevision", "actor", "commands"], properties: { workspace: WORKSPACE, recordId: RECORD_ID, expectedRevision: EXPECTED_REVISION, actor: ACTOR, commands: { type: "array", minItems: 1, items: COMMAND } } },
  },
  {
    name: "kanko_notes_check",
    description: "Check record event integrity, schema version, and exact Git freshness without changing state.",
    inputSchema: { type: "object", required: ["workspace", "recordId"], properties: { workspace: WORKSPACE, recordId: RECORD_ID } },
  },
  {
    name: "kanko_notes_refresh",
    description: "Record a new exact change revision after drift and conservatively invalidate reviewed stops and evidence. Earlier review history is preserved.",
    inputSchema: { type: "object", required: ["workspace", "recordId", "expectedRevision", "selection", "actor"], properties: { workspace: WORKSPACE, recordId: RECORD_ID, expectedRevision: EXPECTED_REVISION, selection: SELECTION, actor: ACTOR } },
  },
  {
    name: "kanko_notes_receipt",
    description: "Preview or emit a deterministic review receipt tied to the exact current change. Emit writes immutable JSON and Markdown locally; it never publishes remotely.",
    inputSchema: { type: "object", required: ["workspace", "recordId", "sessionId", "mode", "actor"], properties: { workspace: WORKSPACE, recordId: RECORD_ID, sessionId: { type: "string" }, mode: { type: "string", enum: ["preview", "emit"] }, expectedRevision: EXPECTED_REVISION, supersedesReceiptId: { type: "string" }, actor: ACTOR }, allOf: [{ if: { properties: { mode: { const: "emit" } } }, then: { required: ["expectedRevision"] } }] },
  },
  {
    name: "kanko_notes_delete",
    description: "Permanently delete one local record and all of its receipts and evidence. Requires the record ID repeated as explicit confirmation and never touches repository source.",
    inputSchema: { type: "object", required: ["workspace", "recordId", "confirmRecordId", "actor"], properties: { workspace: WORKSPACE, recordId: RECORD_ID, confirmRecordId: RECORD_ID, actor: ACTOR } },
  },
];

const TOOLS = [...BRIDGE_TOOLS, ...RECORD_TOOLS];

const ROUTES = {
  kanko_tour_status: ["GET", "/status"],
  kanko_tour_load: ["POST", "/tour/load"],
  kanko_tour_navigate: ["POST", "/tour/navigate"],
  kanko_tour_set_state: ["POST", "/tour/state"],
  kanko_tour_clear: ["POST", "/clear"],
};

function createCallTool({ resolveLock, recordService = new ChangeRecordService() }) {
  return async function callTool(name, args) {
    if (name === "kanko_notes_open") return recordService.open(args);
    if (name === "kanko_notes_get") return recordService.get(args);
    if (name === "kanko_notes_apply") return recordService.apply(args);
    if (name === "kanko_notes_check") return recordService.check(args);
    if (name === "kanko_notes_refresh") return recordService.refresh(args);
    if (name === "kanko_notes_receipt") return recordService.receipt(args);
    if (name === "kanko_notes_delete") return recordService.delete(args);
    const route = ROUTES[name];
    if (!route) throw new Error(`unknown tool: ${name}`);
    const { workspace, ...bridgeArgs } = args;
    const payload = name === "kanko_tour_load" ? recordService.loadTour(args) : { ...bridgeArgs, workspace };
    const lock = resolveLock(workspace);
    return request(lock, route[0], route[1], payload);
  };
}

module.exports = { TOOLS, BRIDGE_TOOLS, RECORD_TOOLS, ROUTES, createCallTool };
