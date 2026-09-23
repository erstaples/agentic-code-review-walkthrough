"use strict";

const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const vscode = require("vscode");

const { startServer } = require("./lib/httpserver.js");
const { writeLock, removeLock } = require("./lib/lockfile.js");
const { createIntentStore } = require("./lib/decorations.js");
const { createIdentity } = require("./lib/identity.js");
const { formatCitation } = require("./lib/citation.js");
const editor = require("./lib/editor.js");

const PROTOCOL_VERSION = 1;
const LOCK_DIR = path.join(os.homedir(), ".claude", "tour");

let server = null;
let lockPath = null;

async function activate(context) {
  const store = createIntentStore();
  const identity = createIdentity();
  const sideResolver = (ref) => identity.sideFor(ref);
  const extensionVersion = vscode.extensions.getExtension("estaples.claude-tour").packageJSON.version;
  const authToken = crypto.randomBytes(32).toString("base64url");

  const copyCitation = async () => {
    try {
      const active = vscode.window.activeTextEditor;
      if (!active) throw Object.assign(new Error("Open a workspace file and select one or more lines first."), { code: "unsupported_editor" });

      const described = editor.describe(active);
      if (!described) throw Object.assign(new Error("The active editor is not a file in this workspace."), { code: "unsupported_editor" });

      const side = described.side || sideResolver(described.ref);
      if (described.ref && !side) {
        throw Object.assign(new Error("This diff is not part of the active walkthrough."), { code: "diff_identity_mismatch" });
      }
      const pinned = identity.current();
      const ref = side === "base" || side === "head" ? pinned?.[side]?.sha || described.ref : null;
      const citation = formatCitation({ path: described.path, side, ref, selection: active.selection });

      await vscode.env.clipboard.writeText(citation);
      vscode.window.setStatusBarMessage(`Copied citation: ${citation}`, 3000);
      return citation;
    } catch (err) {
      vscode.window.showWarningMessage(err.message);
      return null;
    }
  };

  const handlers = {
    // A pure read: unlike /stop and /focus, this never calls applyAll, so
    // `deferred` here reflects only what onDidChangeVisibleTextEditors has
    // reconciled reactively -- not this request's own side effects.
    "GET /status": async () => ({
      protocolVersion: PROTOCOL_VERSION,
      extensionVersion,
      ideName: vscode.env.appName,
      workspaceFolders: (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath),
      deferred: store.pending(),
    }),

    "POST /stop": async (body) => {
      if (body.mode === "diff") {
        if (!body.base || !body.head) throw Object.assign(new Error("diff mode requires base and head"), { code: "bad_request" });
        if (body.head.sha === "WORKTREE") throw Object.assign(new Error("diff mode requires a committed head"), { code: "bad_request" });
        identity.check({ base: body.base, head: body.head });
        // Validate before touching the store: a rejection here must leave
        // whatever stop was already showing untouched.
        await editor.validateDiffFiles(body.files || [], body.base, body.head);
        store.setStop({ stopId: body.stopId, files: body.files || [] });
        const opened = await editor.openMultiDiff(body.label, body.files || [], body.base, body.head);
        editor.applyAll(store, sideResolver);
        return { opened, deferred: store.pending() };
      }

      if (body.mode !== "file") {
        throw Object.assign(new Error(`unsupported mode: ${body.mode}`), { code: "bad_request" });
      }
      if (body.base && body.head) identity.check({ base: body.base, head: body.head });
      for (const file of body.files || []) {
        for (const r of file.ranges || []) {
          if (r.side !== "working") {
            throw Object.assign(new Error(`${file.path} has a range with side "${r.side}"; file mode requires "working"`), { code: "bad_request" });
          }
          editor.validateRange(file.path, r.startLine, r.endLine);
        }
      }
      store.setStop({ stopId: body.stopId, files: body.files || [] });
      const opened = [];
      for (const file of body.files || []) {
        await editor.openFile(file.path);
        opened.push(file.path);
      }
      editor.applyAll(store, sideResolver);
      return { opened, deferred: store.pending() };
    },

    "POST /focus": async (body) => {
      if (body.side === "base" || body.side === "head") {
        const pinned = identity.current();
        if (!pinned) throw Object.assign(new Error(`focus side "${body.side}" requires an active diff-mode tour`), { code: "bad_request" });
        await editor.validateDiffFocusRange(body.path, body.side, body.startLine, body.endLine, pinned.base, pinned.head);
      } else {
        editor.validateRange(body.path, body.startLine, body.endLine);
      }
      store.setFocus(body);
      const revealed = await editor.reveal(body.path, body.side, body.startLine, body.endLine, sideResolver);
      editor.applyAll(store, sideResolver);
      return { revealed, deferred: store.pending() };
    },

    "POST /clear": async () => {
      identity.reset();
      store.clear();
      editor.clearAll();
      return {};
    },
  };

  server = await startServer({ handlers, authToken, protocolVersion: PROTOCOL_VERSION });
  lockPath = writeLock(LOCK_DIR, {
    protocolVersion: PROTOCOL_VERSION,
    port: server.port,
    authToken,
    pid: process.pid,
    ideName: vscode.env.appName,
    extensionVersion,
    workspaceFolders: (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath),
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("tourChanges.copyCitation", copyCitation),
    vscode.window.onDidChangeVisibleTextEditors(() => editor.applyAll(store, sideResolver)),
    { dispose: () => { removeLock(lockPath); if (server) server.close(); editor.dispose(); } }
  );
}

function deactivate() {
  if (lockPath) removeLock(lockPath);
  if (server) return server.close();
}

module.exports = { activate, deactivate };
