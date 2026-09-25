"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createTourView } = require("./compiled.js")("lib/tour-view.js");

test("the browser bundle starts without Node globals and sends the ready handshake", () => {
  const messages = [];
  const listeners = new Map();
  const element = { addEventListener() {} };
  const browser = {
    acquireVsCodeApi: () => ({ postMessage: value => messages.push(value) }),
    document: { getElementById: () => element, addEventListener() {} },
    window: { addEventListener: (type, callback) => listeners.set(type, callback) },
    ResizeObserver: class { observe() {} },
  };
  const script = fs.readFileSync(path.join(__dirname, "../.test-dist/webview.js"), "utf8");
  vm.runInNewContext(script, browser);
  assert.equal(JSON.stringify(messages), '[{"type":"ready"}]');
  assert.equal(typeof listeners.get("message"), "function");
});

test("the provider loads only the local browser bundle under its nonce CSP", () => {
  const webview = {
    asWebviewUri: uri => uri,
    cspSource: "vscode-resource:",
    postMessage() {},
    onDidReceiveMessage: () => ({ dispose() {} }),
  };
  const api = { Uri: { joinPath: (...parts) => parts.join("/") } };
  createTourView(api, "extension", () => ({})).resolveWebviewView({
    webview, onDidDispose() {},
  });
  assert.deepEqual(webview.options.localResourceRoots, ["extension/media", "extension/dist"]);
  const scripts = [...webview.html.matchAll(/<script nonce="([^"]+)" src="([^"]+)"/g)];
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0][2], "extension/dist/webview.js");
  assert.ok(webview.html.includes(`script-src 'nonce-${scripts[0][1]}'`));
  assert.ok(webview.html.includes("default-src 'none'"));
});
