import * as crypto from "node:crypto";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { startServer } from "./host/httpserver.js";
import { writeLock, removeLock } from "./host/lockfile.js";
import { PROTOCOL_VERSION } from "../lib/contract.js";
import { anchorNumber, filename } from "../lib/narration.js";
import { formatCitation } from "./host/citation.js";
import type { TourSnapshot } from "./shared/snapshot.js";
import { createTourController } from "./host/tour-controller.js";
import { createLayoutState } from "./host/layout-state.js";
import { createTourHost } from "./host/tour-host.js";
import { createTourView } from "./host/tour-view.js";
import { createAnchorQuickPick } from "./host/anchor-quick-pick.js";
type Controller = ReturnType<typeof createTourController>;
const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);
const LOCK_DIR = path.join(os.homedir(), ".kanko", "tour");
let server: { port: number; close(): Promise<void> } | undefined;
let lockPath: string | undefined;

export async function activate(context: vscode.ExtensionContext) {
  let controller: Controller;
  const report = (error: unknown) =>
    vscode.window.showWarningMessage(
      `Tour presentation: ${errorMessage(error)}`,
    );
  const host = createTourHost(vscode, {
    storage: createLayoutState(context.globalState),
    changed: () => controller?.updatePresentation(host.refresh).catch(report),
    explore: () => controller?.setState({ mode: "exploring" }).catch(report),
  });
  const status = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100,
  );
  status.command = "kanko.tour.focus";
  const view = createTourView(vscode, context.extensionUri, () => controller);
  controller = createTourController({
    prepare: host.prepare,
    present: host.present,
    clear: host.clear,
    layoutAction: host.layoutAction,
    publish(snapshot: TourSnapshot) {
      view.publish(snapshot);
      vscode.commands.executeCommand(
        "setContext",
        "kanko.tourLoaded",
        snapshot.loaded,
      );
      if (snapshot.loaded) {
        // Validation guarantees each active number names an anchor of the stop.
        const anchors = snapshot.beat.active.flatMap((n) =>
          snapshot.stop.anchors.filter((a) => a.n === n).slice(0, 1),
        );
        const identity =
          anchors.length > 3
            ? `${anchorNumber(anchors[0].n)} ${filename(anchors[0].path)} +${anchors.length - 1}`
            : anchors
                .map((a) => `${anchorNumber(a.n)} ${filename(a.path)}`)
                .join("  ");
        status.text = `$(book) Stop ${snapshot.stopIndex + 1}/${snapshot.stopCount} · Beat ${snapshot.beatIndex + 1}/${snapshot.beatCount} · ${identity} · ${snapshot.mode}`;
        status.show();
      } else status.hide();
    },
  });
  const quickPick = createAnchorQuickPick(vscode, controller, view);
  function scope(
    body: unknown,
  ): asserts body is Record<string, unknown> & { workspace: string } {
    if (
      !body ||
      typeof body !== "object" ||
      !("workspace" in body) ||
      typeof body.workspace !== "string" ||
      !body.workspace
    ) {
      throw Object.assign(
        new Error("The requested workspace is not open in this window."),
        { code: "bad_request" },
      );
    }
    const workspace = body.workspace;
    if (
      !(vscode.workspace.workspaceFolders || []).some(
        (f) => path.resolve(f.uri.fsPath) === path.resolve(workspace),
      )
    )
      throw Object.assign(
        new Error("The requested workspace is not open in this window."),
        { code: "bad_request" },
      );
  }
  const authToken = crypto.randomBytes(32).toString("base64url");
  const startedServer: NonNullable<typeof server> = await startServer({
    authToken,
    protocolVersion: PROTOCOL_VERSION,
    handlers: {
      "GET /status": async () => ({
        protocolVersion: PROTOCOL_VERSION,
        extensionVersion: context.extension.packageJSON.version,
        ideName: vscode.env.appName,
        workspaceFolders: (vscode.workspace.workspaceFolders || []).map(
          (f) => f.uri.fsPath,
        ),
        snapshot: controller.snapshot(),
      }),
      "POST /tour/load": async (body: unknown) => {
        scope(body);
        const snapshot = await controller.load(body);
        await vscode.commands.executeCommand("kanko.tour.focus");
        return {
          snapshot,
          findings: "findings" in snapshot ? snapshot.findings : undefined,
        };
      },
      "POST /tour/navigate": async (body: unknown) => {
        scope(body);
        return { snapshot: await controller.navigate(body) };
      },
      "POST /tour/state": async (body: unknown) => {
        scope(body);
        return { snapshot: await controller.setState(body) };
      },
      "POST /clear": async (body: unknown) => {
        scope(body);
        return { snapshot: await controller.clear() };
      },
    },
  });
  server = startedServer;
  lockPath = writeLock(LOCK_DIR, {
    protocolVersion: PROTOCOL_VERSION,
    port: startedServer.port,
    authToken,
    pid: process.pid,
    ideName: vscode.env.appName,
    extensionVersion: context.extension.packageJSON.version,
    workspaceFolders: (vscode.workspace.workspaceFolders || []).map(
      (f) => f.uri.fsPath,
    ),
  });
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("kanko.tour", view, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand("kanko.copyCitation", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      try {
        const uri = editor.document.uri;
        let relative, side, ref;
        if (uri.scheme === "kanko-rev") {
          const q: unknown = JSON.parse(uri.query);
          if (
            !q ||
            typeof q !== "object" ||
            !("side" in q) ||
            typeof q.side !== "string" ||
            !("ref" in q) ||
            typeof q.ref !== "string"
          ) {
            throw new Error("Select a workspace file or tour source.");
          }
          relative = uri.path.slice(1);
          side = q.side;
          ref = q.ref;
        } else if (uri.scheme === "file") {
          const folder = vscode.workspace.getWorkspaceFolder(uri);
          if (!folder) throw new Error("Select a file in the workspace.");
          relative = path.relative(folder.uri.fsPath, uri.fsPath);
          const source = host.citation(uri);
          side = source?.side || "working";
          ref = source?.ref;
        } else throw new Error("Select a workspace file or tour source.");
        const value = formatCitation({
          path: relative,
          side,
          ref,
          selection: editor.selection,
        });
        await vscode.env.clipboard.writeText(value);
        return value;
      } catch (error) {
        vscode.window.showWarningMessage(errorMessage(error));
      }
    }),
    vscode.commands.registerCommand("kanko.tour.layout", (body) =>
      controller.layout(body || {}),
    ),
    vscode.commands.registerCommand("kanko.tour.pinActive", async () => {
      const snapshot = controller.snapshot();
      const slot = snapshot.loaded
        ? snapshot.presentation?.layout?.slots.find(
            (s) => s.column === vscode.window.activeTextEditor?.viewColumn,
          )
        : undefined;
      if (slot?.anchor)
        return controller.layout({
          action: "pin",
          anchor: slot.anchor,
          pinned: !slot.pinned,
        });
      return vscode.window.showInformationMessage(
        "Focus a visible tour anchor to pin it.",
      );
    }),
    vscode.commands.registerCommand("kanko.tour.overrideSequence", () =>
      controller.layout({ action: "overrideSequence" }),
    ),
    vscode.commands.registerCommand("kanko.tour.quickPick", () =>
      quickPick.choose(),
    ),
    vscode.commands.registerCommand("kanko.tour.quickPickAccept", (kind) =>
      quickPick.accept(kind),
    ),
    vscode.commands.registerCommand("kanko.tour.anchor", (n) =>
      quickPick.numbered(n),
    ),
    vscode.commands.registerCommand("kanko.tour.resetLayout", () =>
      controller.layout({ action: "reset" }),
    ),
    quickPick,
    status,
    host,
    {
      dispose: () => {
        removeLock(lockPath);
        server?.close();
      },
    },
  );
}
export function deactivate() {
  if (lockPath) removeLock(lockPath);
  return server?.close();
}
