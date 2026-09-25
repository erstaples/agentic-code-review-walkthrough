import { isRecord, errorFields } from "./input.js";
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
interface DispatcherOptions {
  serverInfo: { name: string; version: string };
  tools: ToolDefinition[];
  callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => unknown | Promise<unknown>;
}

const PROTOCOL_VERSION = "2025-06-18";

function parseLines(buffer: string) {
  const parts = buffer.split("\n");
  const rest = parts.pop() || "";
  const messages: unknown[] = [];
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

function createDispatcher({ serverInfo, tools, callTool }: DispatcherOptions) {
  async function handle(message: unknown) {
    if (!isRecord(message) || message.id === undefined) return null;
    const reply = <T>(result: T) => ({
      jsonrpc: "2.0",
      id: message.id,
      result,
    });

    const toolReply = (result: {
      content: { type: string; text: string }[];
      isError?: boolean;
    }) => reply(result);

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
        const { name, arguments: args } = isRecord(message.params)
          ? message.params
          : {};
        try {
          if (
            typeof name !== "string" ||
            (args !== undefined && !isRecord(args))
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
          const err = errorFields(failure);
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

export { createDispatcher, parseLines, PROTOCOL_VERSION };
