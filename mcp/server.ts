import * as os from "node:os";
import * as path from "node:path";

import { createDispatcher, parseLines } from "./lib/rpc.js";
import { resolveLock } from "./lib/discovery.js";
import { TOOLS, createCallTool } from "./lib/tools.js";
import { ReviewMapService } from "./lib/review-map/service.js";
import { PROTOCOL_VERSION } from "./lib/bridge.js";

import { version } from "../plugin.json";

const LOCK_DIR = path.join(os.homedir(), ".kanko", "tour");

const dispatcher = createDispatcher({
  serverInfo: { name: "kanko", version },
  tools: TOOLS,
  callTool: createCallTool({
    resolveLock: (workspace) =>
      resolveLock({
        dir: LOCK_DIR,
        cwd: workspace || process.cwd(),
        protocolVersion: PROTOCOL_VERSION,
      }),
    mapService: new ReviewMapService({
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
  const { messages, rest } = parseLines(buffer + chunk);
  buffer = rest;
  for (const message of messages) {
    const response = await dispatcher.handle(message);
    if (response) process.stdout.write(JSON.stringify(response) + "\n");
  }
});
process.stdin.on("end", () => process.exit(0));
