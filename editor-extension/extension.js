"use strict";

const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const vscode = require("vscode");

const { startServer } = require("./lib/httpserver.js");
const { writeLock, removeLock } = require("./lib/lockfile.js");
const { createIntentStore } = require("./lib/decorations.js");
const editor = require("./lib/editor.js");

const PROTOCOL_VERSION = 1;
const LOCK_DIR = path.join(os.homedir(), ".claude", "tour");

let server = null;
let lockPath = null;

// Phase 1 has no pinned refs, so every git: editor is treated as unknown.
// Phase 2 replaces this with a base/head SHA lookup.
const sideResolver = () => null;

async function activate(context) {
  const store = createIntentStore();
  const extensionVersion = vscode.extensions.getExtension("estaples.claude-tour").packageJSON.version;
  const authToken = crypto.randomBytes(32).toString("base64url");

  const handlers = {
    "GET /status": async () => ({
      protocolVersion: PROTOCOL_VERSION,
      extensionVersion,
      ideName: vscode.env.appName,
      workspaceFolders: (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath),
    }),

    "POST /stop": async (body) => {
      if (body.mode !== "file") {
        throw Object.assign(new Error(`unsupported mode: ${body.mode}`), { code: "bad_request" });
      }
      for (const file of body.files || []) {
        for (const r of file.ranges || []) editor.validateRange(file.path, r.startLine, r.endLine);
      }
      store.setStop({ stopId: body.stopId, files: body.files || [] });
      const opened = [];
      for (const file of body.files || []) {
        await editor.openFile(file.path);
        opened.push(file.path);
      }
      editor.applyAll(store, sideResolver);
      return { opened, deferred: store.pendingPaths() };
    },

    "POST /focus": async (body) => {
      editor.validateRange(body.path, body.startLine, body.endLine);
      store.setFocus(body);
      const revealed = await editor.reveal(body.path, body.side, body.startLine, body.endLine, sideResolver);
      editor.applyAll(store, sideResolver);
      return { revealed };
    },

    "POST /clear": async () => {
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
    vscode.window.onDidChangeVisibleTextEditors(() => editor.applyAll(store, sideResolver)),
    { dispose: () => { removeLock(lockPath); if (server) server.close(); editor.dispose(); } }
  );
}

function deactivate() {
  if (lockPath) removeLock(lockPath);
  if (server) return server.close();
}

module.exports = { activate, deactivate };
