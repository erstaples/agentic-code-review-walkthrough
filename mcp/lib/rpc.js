"use strict";

const PROTOCOL_VERSION = "2025-06-18";

function parseLines(buffer) {
  const parts = buffer.split("\n");
  const rest = parts.pop();
  const messages = [];
  for (const line of parts) {
    if (line.trim() === "") continue;
    try {
      messages.push(JSON.parse(line));
    } catch {
      // A malformed line cannot be attributed to a request id, so there is
      // nobody to answer. Dropping it keeps the stream alive.
    }
  }
  return { messages, rest };
}

function createDispatcher({ serverInfo, tools, callTool }) {
  async function handle(message) {
    if (message.id === undefined) return null;
    const reply = (result) => ({ jsonrpc: "2.0", id: message.id, result });

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
        const { name, arguments: args } = message.params || {};
        try {
          const result = await callTool(name, args || {});
          return reply({
            content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
          });
        } catch (err) {
          const errorObj = {
            code: err?.code || "internal_error",
            message: err?.message || String(err),
            ...(err?.details === undefined ? {} : { details: err.details }),
          };
          return reply({
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

module.exports = { createDispatcher, parseLines, PROTOCOL_VERSION };
