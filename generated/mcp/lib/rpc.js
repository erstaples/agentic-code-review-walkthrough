// Generated from TypeScript. Run npm run runtime:build in editor-extension.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PROTOCOL_VERSION = void 0;
exports.createDispatcher = createDispatcher;
exports.parseLines = parseLines;
const input_js_1 = require("./input.js");
const PROTOCOL_VERSION = "2025-06-18";
exports.PROTOCOL_VERSION = PROTOCOL_VERSION;
function parseLines(buffer) {
  const parts = buffer.split("\n");
  const rest = parts.pop() || "";
  const messages = [];
  for (const line of parts) {
    if (line.trim() === "") continue;
    try {
      messages.push(JSON.parse(line));
    } catch {
      // Ignore malformed lines without stopping the stream.
    }
  }
  return { messages, rest };
}
function createDispatcher({ serverInfo, tools, callTool }) {
  async function handle(message) {
    if (!(0, input_js_1.isRecord)(message) || message.id === undefined)
      return null;
    const reply = (result) => ({
      jsonrpc: "2.0",
      id: message.id,
      result,
    });
    const toolReply = (result) => reply(result);
    switch (message.method) {
      case "initialize":
        return reply({
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo,
        });
      case "tools/list":
        return reply({ tools });
      case "tools/call": {
        const { name, arguments: args } = (0, input_js_1.isRecord)(
          message.params,
        )
          ? message.params
          : {};
        try {
          if (
            typeof name !== "string" ||
            (args !== undefined && !(0, input_js_1.isRecord)(args))
          )
            throw Object.assign(
              new Error("tools/call requires a name and object arguments"),
              { code: "bad_request" },
            );
          const result = await callTool(name, args || {});
          return toolReply({
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          });
        } catch (failure) {
          const err = (0, input_js_1.errorFields)(failure);
          const errorObj = {
            code: err?.code || "internal_error",
            message: err?.message || String(err),
            ...(err?.details === undefined ? {} : { details: err.details }),
          };
          return toolReply({
            content: [{ type: "text", text: JSON.stringify(errorObj) }],
            isError: true,
          });
        }
      }
      default:
        return {
          jsonrpc: "2.0",
          id: message.id,
          error: { code: -32601, message: `unknown method: ${message.method}` },
        };
    }
  }
  return { handle };
}
