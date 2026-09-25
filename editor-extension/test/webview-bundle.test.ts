import { webviewFixture } from "./webview-fixture.js";
import { uri } from "./factories.js";
import { present } from "../../test/assertions.js";
import test = require("node:test");
import assert = require("node:assert/strict");
import * as fs from "node:fs";
import * as path from "node:path";
import { JSDOM } from "jsdom";
import { waitFor } from "@testing-library/dom";
import { createTourView } from "../src/host/tour-view.js";

test("the browser bundle starts without Node globals and sends the ready handshake", async () => {
  const messages: unknown[] = [];
  const dom = new JSDOM('<div id="root"></div>', {
    runScripts: "outside-only",
    pretendToBeVisual: true,
  });
  dom.window.acquireVsCodeApi = () => ({
    postMessage: (value: unknown) => messages.push(value),
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
      { container: dom.window.document.body },
    );
    assert.match(
      dom.window.document.body.textContent,
      /Load a tour from your agent/,
    );
    dom.window.dispatchEvent(new dom.window.Event("pagehide"));
    assert.equal(
      present(dom.window.document.getElementById("root")).childNodes.length,
      0,
    );
  } finally {
    dom.window.close();
  }
});

test("the provider loads only the local browser bundle under its nonce CSP", () => {
  const f = webviewFixture();
  const { webview } = f;
  createTourView(
    f.api,
    uri("extension"),
    () => f.controller,
  ).resolveWebviewView(f.view);
  assert.deepEqual(
    webview.options.localResourceRoots?.map((value) => value.toString()),
    ["extension/media", "extension/dist"],
  );
  const scripts = [
    ...webview.html.matchAll(/<script nonce="([^"]+)" src="([^"]+)"/g),
  ];
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0][2], "extension/dist/webview.js");
  assert.ok(webview.html.includes(`script-src 'nonce-${scripts[0][1]}'`));
  assert.ok(webview.html.includes("default-src 'none'"));
});
