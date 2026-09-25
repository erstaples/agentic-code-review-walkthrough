"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { JSDOM } = require("jsdom");
const { waitFor } = require("@testing-library/dom");
const { createTourView } = require("./compiled.js")("src/host/tour-view.js");

test("the browser bundle starts without Node globals and sends the ready handshake", async () => {
  const messages = [];
  const dom = new JSDOM('<div id="root"></div>', {
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  dom.window.acquireVsCodeApi = () => ({
    postMessage: (value) => messages.push(value),
  });
  dom.window.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  assert.equal(typeof dom.window.require, "undefined");
  assert.equal(typeof dom.window.process, "undefined");
  try {
    dom.window.eval(
      fs.readFileSync(path.join(__dirname, "../.test-dist/webview.js"), "utf8"),
    );
    await waitFor(
      () => assert.equal(JSON.stringify(messages), '[{"type":"ready"}]'),
      { container: dom.window.document },
    );
    assert.match(
      dom.window.document.body.textContent,
      /Load a tour from your agent/,
    );
    dom.window.dispatchEvent(new dom.window.Event("pagehide"));
    assert.equal(
      dom.window.document.getElementById("root").childNodes.length,
      0,
    );
  } finally {
    dom.window.close();
  }
});

test("the provider loads only the local browser bundle under its nonce CSP", () => {
  const webview = {
    asWebviewUri: (uri) => uri,
    cspSource: "vscode-resource:",
    postMessage() {},
    onDidReceiveMessage: () => ({ dispose() {} }),
  };
  const api = { Uri: { joinPath: (...parts) => parts.join("/") } };
  createTourView(api, "extension", () => ({})).resolveWebviewView({
    webview,
    onDidDispose() {},
  });
  assert.deepEqual(webview.options.localResourceRoots, [
    "extension/media",
    "extension/dist",
  ]);
  const scripts = [
    ...webview.html.matchAll(/<script nonce="([^"]+)" src="([^"]+)"/g),
  ];
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0][2], "extension/dist/webview.js");
  assert.ok(webview.html.includes(`script-src 'nonce-${scripts[0][1]}'`));
  assert.ok(webview.html.includes("default-src 'none'"));
});
