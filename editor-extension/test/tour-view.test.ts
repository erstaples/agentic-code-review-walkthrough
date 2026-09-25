import { webviewFixture } from "./webview-fixture.js";
import { uri } from "./factories.js";
import { record } from "../../test/assertions.js";
import test = require("node:test");
import assert = require("node:assert/strict");
import { createTourView } from "../src/host/tour-view.js";
function fixture() {
  const f = webviewFixture();
  const view = createTourView(f.api, uri("extension"), () => f.controller);
  view.resolveWebviewView(f.view);
  return { ...f, view };
}
test("view requires a revision for editor mutations and forwards only known layout fields", async () => {
  const f = fixture();
  await f.receive({ type: "layout", action: "reset" });
  assert.equal(f.calls.length, 0);
  assert.equal(record(f.messages.at(-1)).type, "error");
  await f.receive({
    type: "layout",
    action: "place",
    anchor: 3,
    placement: { kind: "replace", of: 2 },
    revision: 7,
    command: "malicious",
    path: "/outside",
  });
  assert.deepEqual(f.calls, [
    {
      action: "place",
      anchor: 3,
      placement: { kind: "replace", of: 2 },
      pinned: undefined,
      remember: undefined,
      expectedRevision: 7,
    },
  ]);
});
test("number shortcuts wait for the webview ready handshake before opening an anchor picker", async () => {
  const f = fixture();
  f.messages.length = 0;
  await f.view.showAnchor(12);
  assert.equal(f.messages.length, 0);
  await f.receive({ type: "ready" });
  assert.equal(record(f.messages.at(-1)).type, "selectAnchor");
  assert.equal(record(f.messages.at(-1)).anchor, 12);
  assert.ok(f.webview.html.includes('<div id="root"></div>'));
});
