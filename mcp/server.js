#!/usr/bin/env node
"use strict";

const os = require("node:os");
const path = require("node:path");

const { createDispatcher, parseLines } = require("./lib/rpc.js");
const { resolveLock } = require("./lib/discovery.js");
const { TOOLS, createCallTool } = require("./lib/tools.js");
const { PROTOCOL_VERSION } = require("./lib/bridge.js");

const LOCK_DIR = path.join(os.homedir(), ".claude", "tour");

const dispatcher = createDispatcher({
  serverInfo: { name: "tour-bridge", version: "0.1.0" },
  tools: TOOLS,
  callTool: createCallTool({
    resolveLock: (workspace) => resolveLock({
      dir: LOCK_DIR,
      cwd: workspace || process.cwd(),
      protocolVersion: PROTOCOL_VERSION,
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
