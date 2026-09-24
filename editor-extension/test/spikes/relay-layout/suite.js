"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const vscode = require("vscode");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const output = process.env.RELAY_SPIKE_OUTPUT;
const write = (name, data) => fs.writeFileSync(path.join(output, name), JSON.stringify(data, null, 2) + "\n");
const command = (name, ...args) => vscode.commands.executeCommand(name, ...args);
const shapes = {
  single: { orientation: 0, groups: [{}] },
  stack: { orientation: 1, groups: [{ size: 0.5 }, { size: 0.5 }] },
  stackSplitBottom: { orientation: 1, groups: [{ size: 0.47 }, { size: 0.53, groups: [{}, {}] }] },
  stackSplitTop: { orientation: 1, groups: [{ size: 0.53, groups: [{}, {}] }, { size: 0.47 }] },
  columns: { orientation: 0, groups: [{}, {}] },
  grid: { orientation: 1, groups: [{ groups: [{}, {}] }, { groups: [{}, {}] }] },
};
const leaves = (layout) => layout.groups ? layout.groups.reduce((n, group) => n + leaves(group), 0) : 1;
const groupSnapshot = () => vscode.window.tabGroups.all.map((group) => ({
  column: group.viewColumn, active: group.isActive,
  tabs: group.tabs.map((tab) => ({ label: tab.label, preview: tab.isPreview, dirty: tab.isDirty,
    scheme: (tab.input.modified || tab.input.uri)?.scheme })),
}));
const rangeSnapshot = () => vscode.window.visibleTextEditors.map((editor) => ({
  column: editor.viewColumn, file: path.basename(editor.document.uri.path), scheme: editor.document.uri.scheme,
  ranges: editor.visibleRanges.map((range) => [range.start.line, range.end.line]),
}));
async function setLayout(layout) {
  await command("vscode.setEditorLayout", layout);
  await delay(150);
}

exports.run = async () => {
  const results = { environment: { vscode: vscode.version, platform: process.platform, arch: process.arch }, checks: [] };
  const check = async (name, body) => {
    try {
      const observation = await body();
      results.checks.push({ name, status: "observed", observation });
      console.log("OBSERVED:", name, JSON.stringify(observation));
    } catch (error) {
      results.checks.push({ name, status: "failed", error: error.message });
      console.error("FAILED:", name, error);
    }
    write("automated.json", results);
  };
  const product = vscode.extensions.getExtension("erstaples.kanko");
  await product.activate();
  const probe = await vscode.extensions.getExtension("kanko-test.relay-layout-spike").activate();
  const root = vscode.workspace.workspaceFolders[0].uri.fsPath;
  const real = (name) => vscode.Uri.file(path.join(root, name));
  const revision = (name, ref) => real(name).with({ scheme: "relay-rev", query: JSON.stringify({ path: path.join(root, name), canonicalPath: path.join(root, name), ref }) });
  const base = process.env.RELAY_SPIKE_BASE, head = process.env.RELAY_SPIKE_HEAD;
  const open = async (uri, column = 1) => vscode.window.showTextDocument(await vscode.workspace.openTextDocument(uri), { viewColumn: column, preview: true });
  const diff = async (modified, column = 1) => command("vscode.diff", revision("service.ts", base), modified, `service.ts (${base.slice(0, 6)} ↔ ${head.slice(0, 6)})`, { viewColumn: column, preview: true });

  await check("layout read/write and all six shapes", async () => {
    const snapshots = [];
    for (const [name, shape] of Object.entries(shapes)) {
      await setLayout(shape);
      assert.equal(vscode.window.tabGroups.all.length, leaves(shape));
      for (let column = 1; column <= leaves(shape); column++) {
        const file = `slot-${column}.txt`;
        fs.writeFileSync(path.join(root, file), `Column ${column}\n` + "context\n".repeat(160));
        await open(real(file), column);
      }
      await delay(150);
      const groups = groupSnapshot();
      assert.deepEqual(groups.map((g) => g.column), Array.from({ length: leaves(shape) }, (_, i) => i + 1));
      const actual = await command("vscode.getEditorLayout");
      assert.equal(leaves(actual), leaves(shape));
      snapshots.push({ name, layout: actual, groups });
    }
    const saved = await command("vscode.getEditorLayout");
    await setLayout(shapes.single);
    await setLayout(saved);
    const restored = await command("vscode.getEditorLayout");
    assert.deepEqual(restored, saved, "restored geometry differs at a fixed window size");
    return { snapshots, saved, restored, note: "Geometry restoration does not prove restoration of tab membership or focus." };
  });

  await check("resize versus scroll event signals", async () => {
    await setLayout(shapes.stack);
    await open(real("service.ts"), 1);
    await open(real("evidence.go"), 2);
    let groups = 0, ranges = 0;
    const subscriptions = [vscode.window.tabGroups.onDidChangeTabGroups(() => groups++), vscode.window.onDidChangeTextEditorVisibleRanges(() => ranges++)];
    try {
      const before = await command("vscode.getEditorLayout");
      await setLayout({ orientation: 1, groups: [{ size: 0.7 }, { size: 0.3 }] });
      await delay(300);
      const resize = { groups, ranges, before, after: await command("vscode.getEditorLayout") };
      groups = 0; ranges = 0;
      vscode.window.visibleTextEditors.find((editor) => editor.viewColumn === 1)
        .revealRange(new vscode.Range(60, 0, 60, 0), vscode.TextEditorRevealType.AtTop);
      await delay(300);
      return { resize, scroll: { groups, ranges, layout: await command("vscode.getEditorLayout") }, limitation: "Programmatic resizing; manual drag recorded separately." };
    } finally { subscriptions.forEach((s) => s.dispose()); }
  });

  await check("short files and preview tab reuse", async () => {
    await setLayout(shapes.single);
    fs.writeFileSync(path.join(root, "short.txt"), "one\ntwo\nthree");
    const editor = await open(real("short.txt"));
    await delay(200);
    const shortFile = { lineCount: editor.document.lineCount, visible: rangeSnapshot(), layout: await command("vscode.getEditorLayout") };
    await setLayout(shapes.columns);
    await open(real("service.ts"), 1);
    await open(real("service.ts"), 2);
    const copies = vscode.window.tabGroups.all.flatMap((group) => group.tabs).filter((tab) => tab.input.uri?.toString() === real("service.ts").toString()).length;
    return { shortFile, sameFileCopiesWhenExplicitlyOpeningInTwoGroups: copies, implication: "Opening with preview true does not enforce global deduplication. A short document is not proof of a short group." };
  });

  await check("language symbols on file and relay-rev", async () => {
    const go = vscode.extensions.getExtension("golang.go");
    results.environment.goExtension = go?.packageJSON.version || null;
    if (go) await go.activate();
    const symbols = [];
    for (const name of ["service.ts", "evidence.go"]) {
      for (const uri of [real(name), revision(name, head)]) {
        const editor = await open(uri);
        let found = [], error;
        for (let attempt = 0; attempt < 12; attempt++) {
          try { found = await command("vscode.executeDocumentSymbolProvider", uri) || []; }
          catch (e) { error = e.message; }
          if (found.length) break;
          await delay(500);
        }
        symbols.push({ file: name, scheme: uri.scheme, languageId: editor.document.languageId, names: found.map((s) => s.name), ...(error ? { error } : {}) });
      }
    }
    assert.ok(symbols.find((s) => s.file === "service.ts" && s.scheme === "file").names.includes("relayProbe"), "real TypeScript positive control failed");
    if (go) assert.ok(symbols.find((s) => s.file === "evidence.go" && s.scheme === "file").names.includes("Evidence"), "real Go positive control failed");
    return symbols;
  });

  await check("diff badge requests and URI identity", async () => {
    await setLayout(shapes.columns);
    await diff(real("service.ts"), 1);
    await diff(revision("service.ts", head), 2);
    await delay(800);
    const groups = groupSnapshot();
    assert.ok(groups.every((g) => g.tabs.some((t) => t.label.startsWith("service.ts ("))));
    return { groups, requests: probe.events.filter((e) => e.type === "badge-request"), limitation: "Provider callbacks are not proof that badges are painted; inspect tabs visually." };
  });

  await check("secondary sidebar contribution", async () => {
    await command("relaySpike.panel.focus");
    await delay(300);
    const resolved = probe.events.some((e) => e.type === "panel-resolved");
    assert.ok(resolved, "secondary sidebar did not resolve");
    return { resolved, limitation: "Check physical placement visually." };
  });

  await check("production removed-code companion and pause", async () => {
    const lockDir = path.join(os.homedir(), ".claude", "tour");
    const lock = fs.readdirSync(lockDir).filter((name) => name.endsWith(".lock")).map((name) => JSON.parse(fs.readFileSync(path.join(lockDir, name), "utf8"))).find((entry) => entry.pid === process.pid);
    assert.ok(lock, "test extension lock missing");
    const response = await fetch(`http://127.0.0.1:${lock.port}/stop`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${lock.authToken}` }, body: JSON.stringify({ protocolVersion: 1, stopId: "spike", label: "Spike", type: "implementation", mode: "diff", base: { sha: base }, head: { sha: head }, files: [{ path: "service.ts", ranges: [{ side: "base", startLine: 1, endLine: 3 }] }] }) });
    const payload = await response.json();
    assert.ok(payload.ok, JSON.stringify(payload));
    await vscode.workspace.getConfiguration("diffEditor").update("renderSideBySide", false, vscode.ConfigurationTarget.Global);
    await setLayout(shapes.stackSplitBottom);
    for (let column = 1; column <= 3; column++) await open(real(`slot-${column}.txt`), column);
    const before = groupSnapshot();
    const text = "export function relayProbe(value: number): number {\n  return value + 1;\n}";
    await command("relay.presentation.activate", { anchor: { path: "service.ts", side: "base", rev: base, context: { startLine: 1, endLine: 3 }, focus: [{ side: "base", range: { startLine: 2, endLine: 2 } }], contentHash: "sha256:" + crypto.createHash("sha256").update(text).digest("hex") }, narration: "Removed line probe" });
    await delay(800);
    const activated = groupSnapshot();
    await command("relay.presentation.pause");
    await delay(300);
    const paused = groupSnapshot();
    await vscode.workspace.getConfiguration("diffEditor").update("renderSideBySide", true, vscode.ConfigurationTarget.Global);
    return { before, activated, paused, status: await command("relay.presentation.status") };
  });

  if (process.env.RELAY_SPIKE_MANUAL === "1") {
    // The control file belongs only to this disposable fixture. No product API
    // or arbitrary code execution endpoint is added to the shipped extension.
    const lockDir = path.join(os.homedir(), ".claude", "tour");
    const lock = fs.readdirSync(lockDir).filter((name) => name.endsWith(".lock")).map((name) => JSON.parse(fs.readFileSync(path.join(lockDir, name), "utf8"))).find((entry) => entry.pid === process.pid);
    await fetch(`http://127.0.0.1:${lock.port}/clear`, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${lock.authToken}` }, body: JSON.stringify({ protocolVersion: 1 }) });
    await command("workbench.action.closeAllEditors");
    await setLayout(shapes.stack);
    await diff(real("service.ts"), 1);
    await diff(revision("service.ts", head), 2);
    await command("relaySpike.panel.focus");
    const subscriptions = [
      vscode.window.tabGroups.onDidChangeTabGroups((e) => probe.record("group-change", { opened: e.opened.length, closed: e.closed.length, changed: e.changed.length })),
      vscode.window.onDidChangeTextEditorVisibleRanges(() => probe.record("visible-ranges", rangeSnapshot())),
    ];
    write("manual-ready.json", { layout: await command("vscode.getEditorLayout"), ranges: rangeSnapshot(), groups: groupSnapshot() });
    console.log("MANUAL READY: use the disposable test window, then write control.json with action finish.");
    let last = "", finished = false;
    const deadline = Date.now() + 20 * 60 * 1000;
    try {
      while (Date.now() < deadline) {
        await delay(250);
        const controlPath = path.join(output, "control.json");
        if (!fs.existsSync(controlPath)) continue;
        const text = fs.readFileSync(controlPath, "utf8");
        if (text === last) continue;
        last = text;
        const input = JSON.parse(text);
        if (input.action === "finish") { finished = true; break; }
        if (input.action === "snapshot") write(`manual-${input.id.replace(/[^a-z0-9-]/gi, "")}.json`, { layout: await command("vscode.getEditorLayout"), ranges: rangeSnapshot(), groups: groupSnapshot(), events: probe.events });
        if (input.action === "quickPick") await command("relaySpike.quickPick");
      }
    } finally { subscriptions.forEach((s) => s.dispose()); }
    assert.ok(finished, "manual verification timed out without an explicit finish");
  }
  write("automated.json", results);
  assert.equal(results.checks.filter((check) => check.status === "failed").length, 0, "one or more spike checks failed; inspect automated.json");
};
