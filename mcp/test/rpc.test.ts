import { errorFields } from "../../generated/mcp/lib/input.js";
import {
  record,
  records,
  string,
  openedMap,
  findings,
} from "../../test/assertions.js";
import { test } from "node:test";
import * as assert from "node:assert";
import { createDispatcher, parseLines } from "../../generated/mcp/lib/rpc.js";

const tools = [
  {
    name: "kanko_tour_status",
    description: "probe",
    inputSchema: { type: "object", properties: {} },
  },
];
const make = (
  callTool: Parameters<typeof createDispatcher>[0]["callTool"] = async () => ({
    ok: true,
  }),
) =>
  createDispatcher({
    serverInfo: { name: "kanko", version: "0.1.0" },
    tools,
    callTool,
  });

test("parseLines splits complete lines and retains the remainder", () => {
  const { messages, rest } = parseLines('{"a":1}\n{"b":2}\n{"c":');
  assert.deepStrictEqual(messages, [{ a: 1 }, { b: 2 }]);
  assert.strictEqual(rest, '{"c":');
});

test("parseLines ignores blank lines", () => {
  const { messages } = parseLines('{"a":1}\n\n\n');
  assert.deepStrictEqual(messages, [{ a: 1 }]);
});

test("initialize returns protocol version and server info", async () => {
  const res = await make().handle({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {},
  });
  assert.ok(res && "result" in res && "protocolVersion" in res.result);
  assert.strictEqual(res.id, 1);
  assert.strictEqual(res.result.protocolVersion, "2025-06-18");
  assert.strictEqual(res.result.serverInfo.name, "kanko");
  assert.ok(res.result.capabilities.tools);
});

test("notifications get no response", async () => {
  assert.strictEqual(
    await make().handle({
      jsonrpc: "2.0",
      method: "notifications/initialized",
    }),
    null,
  );
});

test("tools/list returns the registered tools", async () => {
  const res = await make().handle({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {},
  });
  assert.ok(res && "result" in res && "tools" in res.result);
  assert.deepStrictEqual(res.result.tools, tools);
});

test("tools/call returns the handler result as text content", async () => {
  const d = make(async (name, args) => ({ echoed: name, args }));
  const res = await d.handle({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "kanko_tour_status", arguments: { a: 1 } },
  });
  assert.ok(res && "result" in res && "content" in res.result);
  assert.strictEqual(res.result.isError, undefined);
  assert.deepStrictEqual(JSON.parse(res.result.content[0].text), {
    echoed: "kanko_tour_status",
    args: { a: 1 },
  });
});

test("a throwing tool becomes an isError result, not a transport error", async () => {
  const d = make(async () => {
    throw new Error("bridge unreachable");
  });
  const res = await d.handle({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "kanko_tour_status", arguments: {} },
  });
  assert.ok(res && "result" in res && "content" in res.result);
  assert.strictEqual(res.result.isError, true);
  assert.match(res.result.content[0].text, /bridge unreachable/);
});

test("unknown methods return JSON-RPC error -32601", async () => {
  const res = await make().handle({
    jsonrpc: "2.0",
    id: 5,
    method: "nope",
    params: {},
  });
  assert.ok(res && "error" in res);
  assert.strictEqual(res.error.code, -32601);
});

test("a tool error with .code serializes both code and message", async () => {
  const err = Object.assign(new Error("content drift"), {
    code: "content_drift",
  });
  const d = make(async () => {
    throw err;
  });
  const res = await d.handle({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "kanko_tour_status", arguments: {} },
  });
  assert.ok(res && "result" in res && "content" in res.result);
  assert.strictEqual(res.result.isError, true);
  const content = JSON.parse(res.result.content[0].text);
  assert.strictEqual(content.code, "content_drift");
  assert.strictEqual(content.message, "content drift");
});

test("a tool error without .code uses a generic code", async () => {
  const d = make(async () => {
    throw new Error("unexpected failure");
  });
  const res = await d.handle({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name: "kanko_tour_status", arguments: {} },
  });
  assert.ok(res && "result" in res && "content" in res.result);
  assert.strictEqual(res.result.isError, true);
  const content = JSON.parse(res.result.content[0].text);
  assert.ok(content.code);
  assert.strictEqual(content.message, "unexpected failure");
});
