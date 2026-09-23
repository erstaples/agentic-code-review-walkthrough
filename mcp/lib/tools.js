"use strict";

const { request } = require("./bridge.js");
const { DossierService } = require("./dossier/service.js");

const WORKSPACE = {
  type: "string",
  description: "Absolute path to the repository root being toured. Resolve it with git rev-parse --show-toplevel.",
};

const RANGE = {
  type: "object",
  required: ["side", "startLine", "endLine"],
  properties: {
    side: { type: "string", enum: ["base", "head", "working"], description: "base: file at the pinned base commit; head: file at the pinned head commit; working: file on disk with uncommitted changes. Use head for added or changed code, base for deleted code, working when touring the working tree." },
    startLine: { type: "integer", description: "1-based inclusive." },
    endLine: { type: "integer", description: "1-based inclusive." },
  },
};

const BRIDGE_TOOLS = [
  {
    name: "tour_status",
    description: "Preflight the editor bridge. Returns the extension version, the workspace folders of the VS Code window that owns the requested repository, and the current stop's deferred (path, side) pairs -- files not yet decorated because their editor hasn't materialized. Call this before starting a tour; if it fails, run the tour as text and links instead.",
    inputSchema: {
      type: "object",
      required: ["workspace"],
      properties: { workspace: WORKSPACE },
    },
  },
  {
    name: "tour_stop",
    description: "Open a tour stop's files and highlight its ranges. Replaces the previous stop's highlights. Call once per stop, before narrating it.",
    inputSchema: {
      type: "object",
      required: ["workspace", "stopId", "label", "type", "mode", "base", "head", "files"],
      properties: {
        workspace: WORKSPACE,
        stopId: { type: "string" },
        index: { type: "integer", description: "1-based position of this stop in the tour." },
        total: { type: "integer" },
        label: { type: "string" },
        type: { type: "string", enum: ["context", "implementation", "risk", "evidence", "limitation"] },
        mode: { type: "string", enum: ["file", "diff"], description: "Use \"diff\" to render the stop in the native multi-file diff editor -- correct for touring committed work. Use \"file\" for working-tree files." },
        base: { type: "object", required: ["sha", "name"], properties: { sha: { type: "string" }, name: { type: "string" } }, description: "Pinned base commit. Resolve with git rev-parse before the first stop and reuse it for every stop in the tour." },
        head: { type: "object", required: ["sha", "name"], properties: { sha: { type: "string" }, name: { type: "string" } }, description: "Pinned head commit, or sha \"WORKTREE\" for a tour of uncommitted work." },
        files: {
          type: "array",
          items: {
            type: "object",
            required: ["path", "ranges"],
            properties: {
              path: { type: "string", description: "Repository-relative." },
              ranges: { type: "array", items: RANGE },
            },
          },
        },
      },
    },
  },
  {
    name: "tour_focus",
    description: "Point at one range inside the current stop. Reveals it and highlights it more strongly than the surrounding stop. Use this when zooming into a specific construct mid-narration rather than calling tour_stop again.",
    inputSchema: {
      type: "object",
      required: ["workspace", "path", "side", "startLine", "endLine"],
      properties: {
        workspace: WORKSPACE,
        path: { type: "string", description: "Repository-relative." },
        side: RANGE.properties.side,
        startLine: { type: "integer" },
        endLine: { type: "integer" },
        note: { type: "string", description: "Short inline label rendered at the end of the range." },
      },
    },
  },
  {
    name: "tour_clear",
    description: "Remove all tour highlights. Call at the end of a tour. Does not close tabs.",
    inputSchema: {
      type: "object",
      required: ["workspace"],
      properties: { workspace: WORKSPACE },
    },
  },
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

const DOSSIER_ID = { type: "string", pattern: "^dos_[0-9a-f-]+$" };
const EXPECTED_REVISION = { type: "integer", minimum: 1, description: "Aggregate revision returned by the latest dossier call. Prevents stale writers." };
const ENTITY_INPUT = { type: "object", description: "Typed entity fields plus a non-empty provenance array. The service assigns identity and audit fields." };
function command(type, required = [], properties = {}) {
  return { type: "object", required: ["type", ...required], properties: { type: { const: type }, ...properties } };
}
const COMMAND = {
  oneOf: [
    command("SetThesis", ["thesis"], { thesis: ENTITY_INPUT }),
    ...["Requirement", "Claim", "Decision", "Assumption", "Invariant", "Risk", "Evidence", "CodeReference"].map((noun) => command(`Add${noun}`, [noun[0].toLowerCase() + noun.slice(1)], { [noun[0].toLowerCase() + noun.slice(1)]: ENTITY_INPUT })),
    command("AddRelationship", ["relationship"], { relationship: ENTITY_INPUT }),
    command("CreateTourPlan", ["stops"], { title: { type: "string" }, stops: { type: "array", minItems: 1, items: { type: "object" } } }),
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
    command("ArchiveDossier"),
  ],
};

const DOSSIER_TOOLS = [
  {
    name: "dossier_open",
    description: "Resolve an exact Git change identity and open its local living change dossier, or create a private draft outside the repository. Does not run tests, fetch remotes, or modify source.",
    inputSchema: { type: "object", required: ["workspace", "selection", "actor"], properties: { workspace: WORKSPACE, selection: SELECTION, actor: ACTOR, title: { type: "string" }, createIfMissing: { type: "boolean", default: true }, forceNew: { type: "boolean", default: false, description: "Create a separate dossier even when the exact change or a related lineage already has one. Use only after confirming the existing dossier belongs to another task." } } },
  },
  {
    name: "dossier_get",
    description: "Read a bounded dossier projection. Use overview first, then request only the entity, tour, recap, open items, evidence matrix, or storage location needed.",
    inputSchema: {
      type: "object", required: ["workspace", "dossierId", "selector"],
      properties: {
        workspace: WORKSPACE, dossierId: DOSSIER_ID,
        selector: { type: "object", required: ["kind"], properties: { kind: { type: "string", enum: ["overview", "entity", "entities", "tour", "open-items", "evidence-matrix", "recap", "storage"] }, id: { type: "string" }, type: { type: "string" }, stopId: { type: "string" }, sessionId: { type: "string" } } },
      },
    },
  },
  {
    name: "dossier_apply",
    description: "Atomically apply typed dossier domain commands. Never submit JSON Patch or a rewritten dossier. Important statements require structured provenance; review mutations are rejected if code drifted.",
    inputSchema: { type: "object", required: ["workspace", "dossierId", "expectedRevision", "actor", "commands"], properties: { workspace: WORKSPACE, dossierId: DOSSIER_ID, expectedRevision: EXPECTED_REVISION, actor: ACTOR, commands: { type: "array", minItems: 1, items: COMMAND } } },
  },
  {
    name: "dossier_check",
    description: "Check dossier event integrity, schema version, and exact Git freshness without changing state.",
    inputSchema: { type: "object", required: ["workspace", "dossierId"], properties: { workspace: WORKSPACE, dossierId: DOSSIER_ID } },
  },
  {
    name: "dossier_refresh",
    description: "Record a new exact change revision after drift and conservatively invalidate reviewed stops and evidence. Earlier review history is preserved.",
    inputSchema: { type: "object", required: ["workspace", "dossierId", "expectedRevision", "selection", "actor"], properties: { workspace: WORKSPACE, dossierId: DOSSIER_ID, expectedRevision: EXPECTED_REVISION, selection: SELECTION, actor: ACTOR } },
  },
  {
    name: "dossier_receipt",
    description: "Preview or emit a deterministic review receipt tied to the exact current change. Emit writes immutable JSON and Markdown locally; it never publishes remotely.",
    inputSchema: { type: "object", required: ["workspace", "dossierId", "sessionId", "mode", "actor"], properties: { workspace: WORKSPACE, dossierId: DOSSIER_ID, sessionId: { type: "string" }, mode: { type: "string", enum: ["preview", "emit"] }, expectedRevision: EXPECTED_REVISION, supersedesReceiptId: { type: "string" }, actor: ACTOR }, allOf: [{ if: { properties: { mode: { const: "emit" } } }, then: { required: ["expectedRevision"] } }] },
  },
  {
    name: "dossier_delete",
    description: "Permanently delete one local dossier and all of its receipts and evidence. Requires the dossier ID repeated as explicit confirmation and never touches repository source.",
    inputSchema: { type: "object", required: ["workspace", "dossierId", "confirmDossierId", "actor"], properties: { workspace: WORKSPACE, dossierId: DOSSIER_ID, confirmDossierId: DOSSIER_ID, actor: ACTOR } },
  },
];

const TOOLS = [...BRIDGE_TOOLS, ...DOSSIER_TOOLS];

const ROUTES = {
  tour_status: ["GET", "/status"],
  tour_stop: ["POST", "/stop"],
  tour_focus: ["POST", "/focus"],
  tour_clear: ["POST", "/clear"],
};

function createCallTool({ resolveLock, dossierService = new DossierService() }) {
  return async function callTool(name, args) {
    if (name === "dossier_open") return dossierService.open(args);
    if (name === "dossier_get") return dossierService.get(args);
    if (name === "dossier_apply") return dossierService.apply(args);
    if (name === "dossier_check") return dossierService.check(args);
    if (name === "dossier_refresh") return dossierService.refresh(args);
    if (name === "dossier_receipt") return dossierService.receipt(args);
    if (name === "dossier_delete") return dossierService.delete(args);
    const route = ROUTES[name];
    if (!route) throw new Error(`unknown tool: ${name}`);
    const { workspace, ...bridgeArgs } = args;
    const lock = resolveLock(workspace);
    return request(lock, route[0], route[1], bridgeArgs);
  };
}

module.exports = { TOOLS, BRIDGE_TOOLS, DOSSIER_TOOLS, ROUTES, createCallTool };
