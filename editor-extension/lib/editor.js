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
  backgroundColor: new vscode.ThemeColor("editor.stackFrameHighlightBackground"),
  isWholeLine: true,
  borderStyle: "solid",
  borderWidth: "0 0 0 3px",
  borderColor: new vscode.ThemeColor("focusBorder"),
  overviewRulerLane: vscode.OverviewRulerLane.Center,
  overviewRulerColor: new vscode.ThemeColor("focusBorder"),
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
      // A rename's base side is read from its old on-disk path (canonicalPath
      // absent there); canonicalPath re-keys it to the file's current name.
      return { path: path.relative(workspaceRoot(), q.canonicalPath || q.path), side: null, ref: q.ref };
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
  editor.setDecorations(FOCUS, focus ? focusDecorations(editor.document, focus) : []);

  if (stop.length > 0 || focus) store.markApplied(d.path, side);
  return true;
}

// `after` content anchors at its range's end, so the note needs its own
// range on the first line rather than sharing the whole-block range.
function focusDecorations(document, focus) {
  const renderOptions = focus.note
    ? { after: { contentText: `  ${focus.note}`, color: new vscode.ThemeColor("editorCodeLens.foreground"), fontStyle: "italic" } }
    : undefined;
  const firstLine = { range: toRange(document, focus.startLine, focus.startLine), renderOptions };
  if (focus.endLine === focus.startLine) return [firstLine];
  return [firstLine, { range: toRange(document, focus.startLine + 1, focus.endLine) }];
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

// The hash of an empty git tree under SHA-1, the object format every repository
// in this project uses. Pointing an added/deleted file's absent side at it
// (rather than at null/undefined, which vscode.changes silently drops from the
// rendered diff) resolves to empty content via the git extension's own
// empty-tree fallback. A SHA-256 repository computes a different hash for its
// empty tree; unsupported here.
const EMPTY_TREE = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

// Rejects a side the diff's A/D status makes impossible, and any side outside
// the diff-mode enum (including a missing one, which arrives as undefined).
function checkDiffSide(relPath, status, side) {
  if (side !== "base" && side !== "head") {
    throw fail("bad_request", `${relPath} has a range with side "${side}"; diff mode requires "base" or "head"`);
  }
  if (status === "A" && side === "base") throw fail("bad_request", `${relPath} was added by this diff; it has no "base" side`);
  if (status === "D" && side === "head") throw fail("bad_request", `${relPath} was deleted by this diff; it has no "head" side`);
}

async function findDiffChange(root, base, head, targetPath) {
  const { changedFiles } = require("./git.js");
  const changes = await changedFiles(root, base.sha, head.sha);
  const c = changes.find((x) => x.targetPath === targetPath);
  if (!c) throw fail("bad_request", `${targetPath} does not differ between ${base.sha} and ${head.sha}`);
  return c;
}

// Bounds-checks against the blob at the pinned ref, not the working tree: a
// diff-mode range describes committed history that may not exist on disk.
async function checkDiffBounds(root, c, side, base, head, startLine, endLine) {
  const { blobLines } = require("./git.js");
  const ref = side === "base" ? base.sha : head.sha;
  const blobPath = side === "base" ? c.sourcePath : c.targetPath;
  const lines = await blobLines(root, ref, blobPath);
  if (startLine < 1 || endLine < startLine || endLine > lines) {
    throw fail("range_out_of_bounds", `lines ${startLine}-${endLine} fall outside ${lines}-line file ${c.targetPath} (${side})`);
  }
}

// Validates every file/range a diff-mode /stop requests before the caller
// commits to it, so a rejection never leaves the store mutated.
async function validateDiffFiles(files, base, head) {
  const { changedFiles } = require("./git.js");
  const root = workspaceRoot();
  const byTarget = new Map((await changedFiles(root, base.sha, head.sha)).map((c) => [c.targetPath, c]));
  for (const f of files) {
    const c = byTarget.get(f.path);
    if (!c) throw fail("bad_request", `${f.path} does not differ between ${base.sha} and ${head.sha}`);
    for (const r of f.ranges || []) {
      checkDiffSide(f.path, c.status, r.side);
      await checkDiffBounds(root, c, r.side, base, head, r.startLine, r.endLine);
    }
  }
}

// Same validation as validateDiffFiles, for the single path/side/range a
// diff-mode /focus call carries.
async function validateDiffFocusRange(canonicalPath, side, startLine, endLine, base, head) {
  const root = workspaceRoot();
  const c = await findDiffChange(root, base, head, canonicalPath);
  checkDiffSide(canonicalPath, c.status, side);
  await checkDiffBounds(root, c, side, base, head, startLine, endLine);
}

// Renamed files carry the same target path on both sides of the wire (opened,
// deferred, and stop.files keys) even though the base side reads git content
// from the old path; gitUri's canonicalRel argument re-keys that side.
//
// Callers should run validateDiffFiles first to bounds-check ranges before
// mutating the store; this only re-checks that requested paths are in the diff.
async function openMultiDiff(title, files, base, head) {
  const { changedFiles, gitUriQuery } = require("./git.js");
  const root = workspaceRoot();
  const byTarget = new Map((await changedFiles(root, base.sha, head.sha)).map((c) => [c.targetPath, c]));
  for (const f of files) {
    if (!byTarget.has(f.path)) throw fail("bad_request", `${f.path} does not differ between ${base.sha} and ${head.sha}`);
  }

  const wanted = new Set(files.map((f) => f.path));
  const changes = [...byTarget.values()].filter((c) => wanted.has(c.targetPath));

  const gitUri = (rel, ref, canonicalRel) => {
    const abs = path.join(root, rel);
    const uri = vscode.Uri.file(abs).with({ scheme: "git", query: gitUriQuery(abs, ref) });
    if (canonicalRel === rel) return uri;
    const q = JSON.parse(uri.query);
    q.canonicalPath = path.join(root, canonicalRel);
    return uri.with({ query: JSON.stringify(q) });
  };

  const resources = changes.map((c) => {
    const label = vscode.Uri.file(path.join(root, c.status === "D" ? c.sourcePath : c.targetPath));
    if (c.status === "A") return [label, gitUri(c.targetPath, EMPTY_TREE, c.targetPath), gitUri(c.targetPath, head.sha, c.targetPath)];
    if (c.status === "D") return [label, gitUri(c.sourcePath, base.sha, c.targetPath), gitUri(c.sourcePath, EMPTY_TREE, c.targetPath)];
    return [label, gitUri(c.sourcePath, base.sha, c.targetPath), gitUri(c.targetPath, head.sha, c.targetPath)];
  });

  if (resources.length === 0) throw fail("bad_request", `none of the requested files differ between ${base.sha} and ${head.sha}`);
  await vscode.commands.executeCommand("vscode.changes", title, resources);
  return changes.map((c) => c.targetPath);
}

module.exports = {
  workspaceRoot, absolute, openFile, applyTo, applyAll, clearAll, reveal, describe, validateRange,
  validateDiffFiles, validateDiffFocusRange, openMultiDiff, dispose,
};
