// Generated from TypeScript. Run npm run runtime:build in editor-extension.
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
interface DispatcherOptions {
  serverInfo: {
    name: string;
    version: string;
  };
  tools: ToolDefinition[];
  callTool: (
    name: string,
    args: Record<string, unknown>,
  ) => unknown | Promise<unknown>;
}
declare const PROTOCOL_VERSION = "2025-06-18";
declare function parseLines(buffer: string): {
  messages: unknown[];
  rest: string;
};
declare function createDispatcher({
  serverInfo,
  tools,
  callTool,
}: DispatcherOptions): {
  handle: (message: unknown) => Promise<
    | {
        jsonrpc: string;
        id: unknown;
        result: {
          protocolVersion: string;
          capabilities: {
            tools: {
              listChanged: boolean;
            };
          };
          serverInfo: {
            name: string;
            version: string;
          };
        };
      }
    | {
        jsonrpc: string;
        id: unknown;
        result: {
          tools: ToolDefinition[];
        };
      }
    | {
        jsonrpc: string;
        id: unknown;
        result: {
          content: {
            type: string;
            text: string;
          }[];
          isError?: boolean;
        };
      }
    | {
        jsonrpc: string;
        id: {} | null;
        error: {
          code: number;
          message: string;
        };
      }
    | null
  >;
};
export { createDispatcher, parseLines, PROTOCOL_VERSION };
