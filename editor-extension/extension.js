"use strict";
const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const vscode = require("vscode");
const { startServer } = require("./lib/httpserver.js");
const { writeLock, removeLock } = require("./lib/lockfile.js");
const { PROTOCOL_VERSION } = require("./lib/contract.js");
const { anchorNumber, filename } = require("./lib/narration.js");
const { formatCitation } = require("./lib/citation.js");
const { createTourController } = require("./lib/tour-controller.js");
const { createLayoutState } = require("./lib/layout-state.js");
const { createTourHost } = require("./lib/tour-host.js");
const { createTourView } = require("./lib/tour-view.js");
const { createAnchorQuickPick } = require("./lib/anchor-quick-pick.js");
const LOCK_DIR = path.join(os.homedir(), ".kanko", "tour");
let server, lockPath;

async function activate(context) {
  let controller;
  const report = error => vscode.window.showWarningMessage(`Tour presentation: ${error.message}`);
  const host = createTourHost(vscode, { storage: createLayoutState(context.globalState), changed: () => controller?.updatePresentation(host.snapshot).catch(report), explore: () => controller?.setState({ mode: "exploring" }).catch(report) });
  const status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  status.command = "kanko.tour.focus";
  const view = createTourView(vscode, context.extensionUri, () => controller);
  controller = createTourController({ prepare: host.prepare, present: host.present, clear: host.clear, layoutAction: host.layoutAction,
    publish(snapshot) {
      view.publish(snapshot);
      vscode.commands.executeCommand("setContext", "kanko.tourLoaded", snapshot.loaded);
      if (snapshot.loaded) { const anchors = snapshot.beat.active.map(n => snapshot.stop.anchors.find(a => a.n === n));
        const identity = anchors.length > 3 ? `${anchorNumber(anchors[0].n)} ${filename(anchors[0].path)} +${anchors.length - 1}` : anchors.map(a => `${anchorNumber(a.n)} ${filename(a.path)}`).join("  ");
        status.text = `$(book) Stop ${snapshot.stopIndex + 1}/${snapshot.stopCount} · Beat ${snapshot.beatIndex + 1}/${snapshot.beatCount} · ${identity} · ${snapshot.mode}`; status.show(); }
      else status.hide();
    },
  });
  const quickPick = createAnchorQuickPick(vscode, controller, view);
  function scope(body) {
    if (!body.workspace || !(vscode.workspace.workspaceFolders || []).some((f) => path.resolve(f.uri.fsPath) === path.resolve(body.workspace))) throw Object.assign(new Error("The requested workspace is not open in this window."), { code: "bad_request" });
  }
  const authToken = crypto.randomBytes(32).toString("base64url");
  server = await startServer({ authToken, protocolVersion: PROTOCOL_VERSION, handlers: {
    "GET /status": async () => ({ protocolVersion: PROTOCOL_VERSION, extensionVersion: context.extension.packageJSON.version, ideName: vscode.env.appName,
      workspaceFolders: (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath), snapshot: controller.snapshot() }),
    "POST /tour/load": async (body) => { scope(body); const snapshot = await controller.load(body); await vscode.commands.executeCommand("kanko.tour.focus"); return { snapshot, findings: snapshot.findings }; },
    "POST /tour/navigate": async (body) => { scope(body); return { snapshot: await controller.navigate(body) }; },
    "POST /tour/state": async (body) => { scope(body); return { snapshot: await controller.setState(body) }; },
    "POST /clear": async (body) => { scope(body); return { snapshot: await controller.clear() }; },
  } });
  lockPath = writeLock(LOCK_DIR, { protocolVersion: PROTOCOL_VERSION, port: server.port, authToken, pid: process.pid,
    ideName: vscode.env.appName, extensionVersion: context.extension.packageJSON.version, workspaceFolders: (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath) });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("kanko.tour", view, { webviewOptions: { retainContextWhenHidden: true } }),
    vscode.commands.registerCommand("kanko.copyCitation", async () => {
      const editor = vscode.window.activeTextEditor; if (!editor) return;
      try {
        const uri = editor.document.uri;
        let relative, side, ref;
        if (uri.scheme === "kanko-rev") { const q = JSON.parse(uri.query); relative = uri.path.slice(1); side = q.side; ref = q.ref; }
        else if (uri.scheme === "file") {
          const folder = vscode.workspace.getWorkspaceFolder(uri);
          if (!folder) throw new Error("Select a file in the workspace.");
          relative = path.relative(folder.uri.fsPath, uri.fsPath);
          const source = host.citation(uri); side = source?.side || "working"; ref = source?.ref;
        } else throw new Error("Select a workspace file or tour source.");
        const value = formatCitation({ path: relative, side, ref, selection: editor.selection });
        await vscode.env.clipboard.writeText(value); return value;
      } catch (error) { vscode.window.showWarningMessage(error.message); }
    }),
    vscode.commands.registerCommand("kanko.tour.layout", body => controller.layout(body || {})),
    vscode.commands.registerCommand("kanko.tour.pinActive", async () => {
      const snapshot = controller.snapshot();
      const slot = snapshot.presentation?.layout?.slots.find(s => s.column === vscode.window.activeTextEditor?.viewColumn);
      if (slot?.anchor) return controller.layout({ action: "pin", anchor: slot.anchor, pinned: !slot.pinned });
      return vscode.window.showInformationMessage("Focus a visible tour anchor to pin it.");
    }),
    vscode.commands.registerCommand("kanko.tour.overrideSequence", () => controller.layout({ action: "overrideSequence" })),
    vscode.commands.registerCommand("kanko.tour.quickPick", () => quickPick.choose()),
    vscode.commands.registerCommand("kanko.tour.quickPickAccept", kind => quickPick.accept(kind)),
    vscode.commands.registerCommand("kanko.tour.anchor", n => quickPick.numbered(n)),
    vscode.commands.registerCommand("kanko.tour.resetLayout", () => controller.layout({ action: "reset" })),
    quickPick, status, host, { dispose: () => { removeLock(lockPath); server?.close(); } },
  );
}
function deactivate() { if (lockPath) removeLock(lockPath); return server?.close(); }
module.exports = { activate, deactivate };
