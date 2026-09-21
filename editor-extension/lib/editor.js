"use strict";

const path = require("node:path");
const fs = require("node:fs");
const vscode = require("vscode");

const STOP = vscode.window.createTextEditorDecorationType({
  backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
  isWholeLine: true,
  overviewRulerLane: vscode.OverviewRulerLane.Full,
  overviewRulerColor: new vscode.ThemeColor("editorOverviewRuler.findMatchForeground"),
});

const FOCUS = vscode.window.createTextEditorDecorationType({
  backgroundColor: new vscode.ThemeColor("editor.selectionHighlightBackground"),
  border: "1px solid",
  borderColor: new vscode.ThemeColor("editorOverviewRuler.findMatchForeground"),
  isWholeLine: true,
});

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

function workspaceRoot() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) throw fail("bad_request", "no workspace folder is open");
  return folders[0].uri.fsPath;
}

function absolute(relPath) {
  const root = workspaceRoot();
  const abs = path.resolve(root, relPath);
  const rel = path.relative(root, abs);
  const inside = rel !== "" && rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
  // A path escaping the workspace reports as missing so the caller learns
  // nothing about files outside the repository.
  if (!inside || !fs.existsSync(abs)) {
    throw fail("file_not_found", `${relPath} does not exist in this workspace`);
  }
  return abs;
}

// The wire is 1-based inclusive; the VS Code API is 0-based. This is the only
// place that conversion happens.
function toRange(document, startLine, endLine) {
  if (startLine < 1 || endLine < startLine || endLine > document.lineCount) {
    throw fail("range_out_of_bounds", `lines ${startLine}-${endLine} fall outside ${document.lineCount}-line file`);
  }
  return new vscode.Range(startLine - 1, 0, endLine - 1, document.lineAt(endLine - 1).text.length);
}

function describe(editor) {
  const uri = editor.document.uri;
  if (uri.scheme === "file") {
    return { path: path.relative(workspaceRoot(), uri.fsPath), side: "working", ref: null };
  }
  if (uri.scheme === "git") {
    try {
      const q = JSON.parse(uri.query);
      return { path: path.relative(workspaceRoot(), q.path), side: null, ref: q.ref };
    } catch {
      return null;
    }
  }
  return null;
}

async function openFile(relPath) {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absolute(relPath)));
  await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
  return doc;
}

function clearEditor(editor) {
  try {
    editor.setDecorations(STOP, []);
    editor.setDecorations(FOCUS, []);
  } catch {
    // the editor was disposed between the lookup and the update
  }
}

// Ranges are validated against the file on disk when the request arrives, but
// decorations apply to the live document. A range the reviewer has since edited
// away drops that editor's decorations instead of throwing into applyAll's caller.
function applyTo(editor, store, sideResolver) {
  try {
    return decorate(editor, store, sideResolver);
  } catch {
    clearEditor(editor);
    return false;
  }
}

function decorate(editor, store, sideResolver) {
  const d = describe(editor);
  if (!d) return false;
  const side = d.side || sideResolver(d.ref);
  if (!side) return false;
  const { stop, focus } = store.rangesFor({ path: d.path, side });

  editor.setDecorations(STOP, stop.map((r) => toRange(editor.document, r.startLine, r.endLine)));
  editor.setDecorations(
    FOCUS,
    focus
      ? [{
          range: toRange(editor.document, focus.startLine, focus.endLine),
          renderOptions: focus.note
            ? { after: { contentText: `  ${focus.note}`, color: new vscode.ThemeColor("editorCodeLens.foreground"), fontStyle: "italic" } }
            : undefined,
        }]
      : []
  );

  if (stop.length > 0 || focus) store.markApplied(d.path);
  return true;
}

function applyAll(store, sideResolver) {
  for (const editor of vscode.window.visibleTextEditors) applyTo(editor, store, sideResolver);
}

function clearAll() {
  for (const editor of vscode.window.visibleTextEditors) clearEditor(editor);
}

async function reveal(relPath, side, startLine, endLine, sideResolver) {
  const target = vscode.window.visibleTextEditors.find((e) => {
    const d = describe(e);
    return d && d.path === relPath && (d.side || sideResolver(d.ref)) === side;
  });
  if (!target) {
    if (side !== "working") return false;
    const doc = await openFile(relPath);
    const editor = await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
    editor.revealRange(toRange(doc, startLine, endLine), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    return true;
  }
  target.revealRange(toRange(target.document, startLine, endLine), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  return true;
}

function validateRange(relPath, startLine, endLine) {
  const abs = absolute(relPath);
  const lines = fs.readFileSync(abs, "utf8").split("\n").length;
  if (startLine < 1 || endLine < startLine || endLine > lines) {
    throw fail("range_out_of_bounds", `lines ${startLine}-${endLine} fall outside ${lines}-line file ${relPath}`);
  }
}

function dispose() {
  STOP.dispose();
  FOCUS.dispose();
}

module.exports = { workspaceRoot, absolute, openFile, applyTo, applyAll, clearAll, reveal, describe, validateRange, dispose };
