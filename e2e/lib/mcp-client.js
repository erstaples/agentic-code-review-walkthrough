"use strict";

const cp = require("node:child_process");
const path = require("node:path");

const SERVER = path.resolve(__dirname, "../../mcp/server.js");

// Speaks newline-delimited JSON-RPC to a real mcp/server.js child process, the
// same way an agent host does. Nothing here imports server internals, so the
// harness exercises the shipped stdio surface end to end.
class McpClient {
  constructor({ cwd, env = {}, timeoutMs = 30000 } = {}) {
    this.timeoutMs = timeoutMs;
    this.nextId = 1;
    this.pending = new Map();
    this.stderr = "";
    this.child = cp.spawn(process.execPath, [SERVER], {
      cwd,
      env: { ...process.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    let buffer = "";
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) if (line.trim()) this.receive(line);
    });
    this.child.stderr.setEncoding("utf8");
    this.child.stderr.on("data", (chunk) => { this.stderr += chunk; });
    this.child.on("exit", (code, signal) => {
      const err = new Error(`MCP server exited (code ${code}, signal ${signal})${this.stderr ? `:\n${this.stderr}` : ""}`);
      for (const { reject, timer } of this.pending.values()) { clearTimeout(timer); reject(err); }
      this.pending.clear();
    });
  }

  receive(line) {
    let message;
    try { message = JSON.parse(line); } catch { return; }
    const waiter = this.pending.get(message.id);
    if (!waiter) return;
    this.pending.delete(message.id);
    clearTimeout(waiter.timer);
    if (message.error) waiter.reject(Object.assign(new Error(message.error.message), { rpcError: message.error }));
    else waiter.resolve(message.result);
  }

  request(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
    });
  }

  notify(method, params) {
    this.child.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
  }

  async initialize() {
    const info = await this.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "codewalk-e2e", version: "0.1.0" },
    });
    this.notify("notifications/initialized", {});
    const { tools } = await this.request("tools/list", {});
    this.tools = new Map(tools.map((tool) => [tool.name, tool]));
    return { ...info, tools };
  }

  // Returns { isError, value } where value is the parsed JSON text payload.
  async callTool(name, args) {
    const result = await this.request("tools/call", { name, arguments: args });
    const text = result.content?.find((part) => part.type === "text")?.text ?? "";
    let value;
    try { value = JSON.parse(text); } catch { value = text; }
    return { isError: result.isError === true, value };
  }

  close() {
    return new Promise((resolve) => {
      if (this.child.exitCode !== null || this.child.signalCode !== null) return resolve();
      this.child.once("exit", () => resolve());
      this.child.stdin.end();
      setTimeout(() => this.child.kill(), 2000).unref();
    });
  }
}

module.exports = { McpClient };
