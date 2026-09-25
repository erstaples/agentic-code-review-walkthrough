// Generated from TypeScript. Run npm run runtime:build in editor-extension.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const os = require("node:os");
const path = require("node:path");
const rpc_js_1 = require("./lib/rpc.js");
const discovery_js_1 = require("./lib/discovery.js");
const tools_js_1 = require("./lib/tools.js");
const service_js_1 = require("./lib/review-map/service.js");
const bridge_js_1 = require("./lib/bridge.js");
const LOCK_DIR = path.join(os.homedir(), ".kanko", "tour");
const dispatcher = (0, rpc_js_1.createDispatcher)({
  serverInfo: { name: "kanko", version: "0.1.0" },
  tools: tools_js_1.TOOLS,
  callTool: (0, tools_js_1.createCallTool)({
    resolveLock: (workspace) =>
      (0, discovery_js_1.resolveLock)({
        dir: LOCK_DIR,
        cwd: workspace || process.cwd(),
        protocolVersion: bridge_js_1.PROTOCOL_VERSION,
      }),
    mapService: new service_js_1.ReviewMapService({
      tourAnchorLimit:
        process.env.KANKO_TOUR_ANCHOR_LIMIT === undefined
          ? undefined
          : Number(process.env.KANKO_TOUR_ANCHOR_LIMIT),
    }),
  }),
});
let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  const { messages, rest } = (0, rpc_js_1.parseLines)(buffer + chunk);
  buffer = rest;
  for (const message of messages) {
    const response = await dispatcher.handle(message);
    if (response) process.stdout.write(JSON.stringify(response) + "\n");
  }
});
process.stdin.on("end", () => process.exit(0));
