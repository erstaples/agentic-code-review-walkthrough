"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

// The transport, lockfile, identity pinning, and git plumbing are the
// extension's own modules; none of them import vscode. Only the parts that
// render into editors are replaced, by a recorder that captures what the
// reviewer would be looking at.
const ext = path.resolve(__dirname, "../../editor-extension/lib");
const { startServer } = require(path.join(ext, "httpserver.js"));
const { writeLock, removeLock } = require(path.join(ext, "lockfile.js"));
const { createIdentity } = require(path.join(ext, "identity.js"));
const { changedFiles, blobText } = require(path.join(ext, "git.js"));

const PROTOCOL_VERSION = 1;

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

// Mirrors editor.js: validateRange, checkDiffSide, and checkDiffBounds, so a
// scenario that would be rejected by VS Code is rejected here too.
function checkBounds(lines, startLine, endLine, label) {
  if (startLine < 1 || endLine < startLine || endLine > lines.length) {
    throw fail("range_out_of_bounds", `lines ${startLine}-${endLine} fall outside ${lines.length}-line file ${label}`);
  }
}

function checkDiffSide(relPath, status, side) {
  if (side !== "base" && side !== "head") {
    throw fail("bad_request", `${relPath} has a range with side "${side}"; diff mode requires "base" or "head"`);
  }
  if (status === "A" && side === "base") throw fail("bad_request", `${relPath} was added by this diff; it has no "base" side`);
  if (status === "D" && side === "head") throw fail("bad_request", `${relPath} was deleted by this diff; it has no "head" side`);
}

async function startHeadlessEditor({ workspace, lockDir, onEvent = () => {} }) {
  const identity = createIdentity();
  const authToken = crypto.randomBytes(32).toString("base64url");
  const events = [];
  let currentStop = null;

  const record = (event) => { events.push(event); onEvent(event); };

  function workingLines(relPath) {
    const abs = path.resolve(workspace, relPath);
    if (!abs.startsWith(workspace + path.sep) || !fs.existsSync(abs)) {
      throw fail("file_not_found", `${relPath} does not exist in this workspace`);
    }
    return fs.readFileSync(abs, "utf8").split("\n");
  }

  async function diffChange(relPath, base, head) {
    const changes = await changedFiles(workspace, base.sha, head.sha);
    const change = changes.find((c) => c.targetPath === relPath);
    if (!change) throw fail("bad_request", `${relPath} does not differ between ${base.sha} and ${head.sha}`);
    return change;
  }

  async function diffLines(change, side, base, head) {
    const ref = side === "base" ? base.sha : head.sha;
    return (await blobText(workspace, ref, side === "base" ? change.sourcePath : change.targetPath)).split("\n");
  }

  // Resolves a range to its text so the step-through can show the code the
  // editor would highlight.
  async function excerpt(relPath, side, startLine, endLine) {
    const pinned = identity.current();
    let lines;
    if (side === "working") lines = workingLines(relPath);
    else lines = await diffLines(await diffChange(relPath, pinned.base, pinned.head), side, pinned.base, pinned.head);
    return lines.slice(startLine - 1, endLine).map((text, i) => ({ line: startLine + i, text }));
  }

  const handlers = {
    "GET /status": async () => ({
      protocolVersion: PROTOCOL_VERSION,
      extensionVersion: "headless",
      ideName: "codewalk headless editor",
      workspaceFolders: [workspace],
      deferred: [],
    }),

    "POST /stop": async (body) => {
      const files = body.files || [];
      if (body.mode === "diff") {
        if (!body.base || !body.head) throw fail("bad_request", "diff mode requires base and head");
        if (body.head.sha === "WORKTREE") throw fail("bad_request", "diff mode requires a committed head");
        identity.check({ base: body.base, head: body.head });
        for (const file of files) {
          const change = await diffChange(file.path, body.base, body.head);
          for (const r of file.ranges || []) {
            checkDiffSide(file.path, change.status, r.side);
            checkBounds(await diffLines(change, r.side, body.base, body.head), r.startLine, r.endLine, `${file.path} (${r.side})`);
          }
        }
      } else if (body.mode === "file") {
        if (body.base && body.head) identity.check({ base: body.base, head: body.head });
        for (const file of files) {
          for (const r of file.ranges || []) {
            if (r.side !== "working") {
              throw fail("bad_request", `${file.path} has a range with side "${r.side}"; file mode requires "working"`);
            }
            checkBounds(workingLines(file.path), r.startLine, r.endLine, file.path);
          }
        }
      } else {
        throw fail("bad_request", `unsupported mode: ${body.mode}`);
      }
      currentStop = body;
      const highlights = [];
      for (const file of files) {
        for (const r of file.ranges || []) {
          highlights.push({ path: file.path, ...r, lines: await excerpt(file.path, r.side, r.startLine, r.endLine) });
        }
      }
      record({ kind: "stop", stopId: body.stopId, index: body.index, total: body.total, label: body.label, type: body.type, mode: body.mode, highlights });
      return { opened: files.map((f) => f.path), deferred: [] };
    },

    "POST /focus": async (body) => {
      if (body.side === "base" || body.side === "head") {
        const pinned = identity.current();
        if (!pinned) throw fail("bad_request", `focus side "${body.side}" requires an active diff-mode tour`);
        const change = await diffChange(body.path, pinned.base, pinned.head);
        checkDiffSide(body.path, change.status, body.side);
        checkBounds(await diffLines(change, body.side, pinned.base, pinned.head), body.startLine, body.endLine, `${body.path} (${body.side})`);
      } else {
        checkBounds(workingLines(body.path), body.startLine, body.endLine, body.path);
      }
      record({
        kind: "focus", stopId: currentStop?.stopId ?? null, path: body.path, side: body.side,
        startLine: body.startLine, endLine: body.endLine, note: body.note ?? null,
        lines: await excerpt(body.path, body.side, body.startLine, body.endLine),
      });
      return { revealed: true, deferred: [] };
    },

    "POST /clear": async () => {
      identity.reset();
      currentStop = null;
      record({ kind: "clear" });
      return {};
    },
  };

  const server = await startServer({ handlers, authToken, protocolVersion: PROTOCOL_VERSION });
  const lockPath = writeLock(lockDir, {
    protocolVersion: PROTOCOL_VERSION,
    port: server.port,
    authToken,
    pid: process.pid,
    ideName: "codewalk headless editor",
    extensionVersion: "headless",
    workspaceFolders: [workspace],
  });

  return {
    port: server.port,
    events,
    lockPath,
    async close() {
      removeLock(lockPath);
      await server.close();
    },
  };
}

module.exports = { startHeadlessEditor };
