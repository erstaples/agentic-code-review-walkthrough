"use strict";
// Unlike --extensionTestsPath, this host uses durable VS Code profile storage.
// It prepares source-backed scenes; all reviewer interaction uses the native UI.
const fs = require("node:fs"),
  path = require("node:path"),
  os = require("node:os"),
  cp = require("node:child_process");
const assert = require("node:assert/strict");
const { createFixture } = require("../tour-fixture/create.js");
const { ReviewMapService } = require("../../../mcp/lib/review-map/service.js");
const { tourSources } = require("../../../generated/shared/tour-sources.js");
const { hashText, rangeText } = require("../../../generated/shared/tour.js");
const [output, action = "snapshot", countText = "3"] = process.argv.slice(2);
if (!output)
  throw new Error(
    "Provide an absolute output directory and start/load/sidebar/persistence/reload/snapshot/check-reload.",
  );
fs.mkdirSync(output, { recursive: true });
const file = (name) => path.join(output, name);
const save = (name, value) => {
  fs.writeFileSync(file(name + ".tmp"), JSON.stringify(value, null, 2));
  fs.renameSync(file(name + ".tmp"), file(name));
};
async function main() {
  if (action === "start") {
    const fixture = createFixture(),
      user = path.join(fixture.root, "user");
    fs.mkdirSync(path.join(user, "User"), { recursive: true });
    fs.writeFileSync(
      path.join(user, "User/settings.json"),
      JSON.stringify({
        "security.workspace.trust.enabled": false,
        "workbench.startupEditor": "none",
        "telemetry.telemetryLevel": "off",
        "workbench.colorTheme": "Default Dark Modern",
        "editor.fontSize": 15,
        "editor.minimap.enabled": false,
        "diffEditor.renderSideBySide": false,
        "diffEditor.useInlineViewWhenSpaceIsLimited": false,
        "workbench.editor.closeEmptyGroups": false,
        "workbench.editor.openSideBySideDirection": "down",
        "kanko.presentation.removedCode": "seam",
        "kanko.layout.orientation": "stacked",
        "kanko.layout.sequenceFallback": false,
        "kanko.tour.anchorLimit": 99,
        "window.newWindowDimensions": "maximized",
        "window.title": "Kankō durable acceptance · ${rootName}",
      }),
    );
    save("fixture.json", fixture);
    const log = fs.openSync(file("editor.log"), "a");
    const child = cp.spawn(
      process.env.VSCODE_EXECUTABLE_PATH,
      [
        fixture.workspace,
        `--user-data-dir=${user}`,
        `--shared-data-dir=${path.join(fixture.root, "shared")}`,
        `--extensions-dir=${path.join(fixture.root, "extensions")}`,
        `--extensionDevelopmentPath=${process.env.EXTENSION_PATH}`,
        "--disable-extensions",
        "--disable-gpu",
        "--use-inmemory-secretstorage",
        "--password-store=basic",
        "--skip-welcome",
        "--skip-release-notes",
      ],
      { detached: true, stdio: ["ignore", log, log] },
    );
    child.unref();
    console.log(`Isolated durable editor: ${fixture.workspace}`);
    return;
  }
  const fixture = JSON.parse(fs.readFileSync(file("fixture.json")));
  const locks = fs
    .readdirSync(path.join(os.homedir(), ".kanko/tour"))
    .filter((n) => n.endsWith(".lock"))
    .map((n) =>
      JSON.parse(fs.readFileSync(path.join(os.homedir(), ".kanko/tour", n))),
    );
  const lock = locks.find((l) =>
    l.workspaceFolders.includes(fixture.workspace),
  );
  assert.ok(lock, "The isolated editor must be running.");
  async function request(route, body) {
    const result = await (
      await fetch(
        `http://127.0.0.1:${lock.port}${route}${body ? "" : "?protocolVersion=3"}`,
        {
          method: body ? "POST" : "GET",
          headers: {
            authorization: `Bearer ${lock.authToken}`,
            "content-type": "application/json",
          },
          ...(body
            ? {
                body: JSON.stringify({
                  ...body,
                  workspace: fixture.workspace,
                  protocolVersion: 3,
                }),
              }
            : {}),
        },
      )
    ).json();
    assert.notEqual(result.ok, false, JSON.stringify(result));
    return result;
  }
  if (action === "snapshot") {
    const r = await request("/status");
    save("snapshot.json", r);
    console.log(JSON.stringify(r.snapshot.presentation));
    return;
  }
  if (action === "reload" || action === "check-reload") {
    const payload = JSON.parse(fs.readFileSync(file("payload.json"))),
      before = JSON.parse(fs.readFileSync(file("snapshot.json"))).snapshot;
    const result = await request("/tour/load", payload),
      after = result.snapshot;
    if (action === "check-reload") {
      assert.deepEqual(
        after.presentation.layout.slots,
        before.presentation.layout.slots,
      );
      assert.deepEqual(
        after.presentation.layout.preferences,
        before.presentation.layout.preferences,
      );
      assert.equal(
        after.presentation.layout.customized,
        before.presentation.layout.customized,
      );
      assert.deepEqual(
        after.presentation.anchors.map((a) => [a.n, a.status, a.column]),
        before.presentation.anchors.map((a) => [a.n, a.status, a.column]),
      );
    }
    save("reload-result.json", result);
    console.log("Reloaded the same tour; saved arrangement verified.");
    return;
  }
  await request("/clear", {});
  const service = new ReviewMapService({ root: fixture.stateRoot });
  const payload = service.loadTour({
    workspace: fixture.workspace,
    mapId: fixture.mapId,
  });
  payload.tourId += `-manual-${Date.now()}`;
  if (action === "sidebar") {
    const count = Number(countText),
      stop = payload.plan.stops.find((s) => s.id === "sidebar");
    if (count <= 9) stop.anchors = stop.anchors.slice(0, count);
    else {
      const source = tourSources(fixture.workspace, payload.change);
      stop.anchors = Array.from({ length: count }, (_, i) => {
        const a = {
          ...stop.anchors[0],
          n: i + 1,
          path: `source-${i + 1}.js`,
          role: [
            "change",
            "evidence",
            "callee",
            "caller",
            "config",
            "schema",
            "context",
          ][i % 7],
          label: `Inventory source ${i + 1}`,
          context: { startLine: 1, endLine: 2 },
          focus: [],
          change: "added",
        };
        a.contentHash = hashText(
          rangeText(source.readSource(a).head, a.context),
        );
        return a;
      });
    }
    stop.beats = [
      {
        id: "inventory",
        narration:
          count === 1
            ? "{{a:1}} preserves the current review."
            : `{{a:1}} and {{a:2}} demonstrate the behavior. Find {{a:${count}}} in the complete stop inventory.`,
        active: count === 1 ? [1] : [1, 2],
      },
    ];
    payload.plan.stops = [stop];
  } else if (action === "sequence") {
    const settingsFile = path.join(fixture.root, "user/User/settings.json"),
      settings = JSON.parse(fs.readFileSync(settingsFile));
    settings["kanko.layout.sequenceFallback"] = true;
    settings["editor.fontSize"] = 38;
    fs.writeFileSync(settingsFile, JSON.stringify(settings));
    const stop = payload.plan.stops.find((s) => s.id === "layout");
    stop.beats = stop.beats.filter((b) => b.id === "long");
    payload.plan.stops = [stop];
  } else if (action === "persistence")
    payload.plan.stops = payload.plan.stops
      .filter((s) => ["sidebar", "navigation"].includes(s.id))
      .reverse();
  else if (action !== "load") throw new Error("Unknown scene");
  save("payload.json", payload);
  const result = await request("/tour/load", payload);
  save("loaded.json", result);
  console.log(
    `Loaded ${action}: ${result.snapshot.stop.anchors.length} anchors.`,
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
