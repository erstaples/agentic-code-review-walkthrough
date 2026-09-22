"use strict";

const { request } = require("./bridge.js");

const RANGE = {
  type: "object",
  required: ["side", "startLine", "endLine"],
  properties: {
    side: { type: "string", enum: ["base", "head", "working"], description: "base: file at the pinned base commit; head: file at the pinned head commit; working: file on disk with uncommitted changes. Use head for added or changed code, base for deleted code, working when touring the working tree." },
    startLine: { type: "integer", description: "1-based inclusive." },
    endLine: { type: "integer", description: "1-based inclusive." },
  },
};

const TOOLS = [
  {
    name: "tour_status",
    description: "Preflight the editor bridge. Returns the extension version, the workspace folders of the VS Code window that owns the current directory, and the current stop's deferred (path, side) pairs -- files not yet decorated because their editor hasn't materialized. Call this before starting a tour; if it fails, run the tour as text and links instead.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "tour_stop",
    description: "Open a tour stop's files and highlight its ranges. Replaces the previous stop's highlights. Call once per stop, before narrating it.",
    inputSchema: {
      type: "object",
      required: ["stopId", "label", "type", "mode", "base", "head", "files"],
      properties: {
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
      required: ["path", "side", "startLine", "endLine"],
      properties: {
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
    inputSchema: { type: "object", properties: {} },
  },
];

const ROUTES = {
  tour_status: ["GET", "/status"],
  tour_stop: ["POST", "/stop"],
  tour_focus: ["POST", "/focus"],
  tour_clear: ["POST", "/clear"],
};

function createCallTool({ resolveLock }) {
  return async function callTool(name, args) {
    const route = ROUTES[name];
    if (!route) throw new Error(`unknown tool: ${name}`);
    const lock = resolveLock();
    return request(lock, route[0], route[1], args);
  };
}

module.exports = { TOOLS, ROUTES, createCallTool };
