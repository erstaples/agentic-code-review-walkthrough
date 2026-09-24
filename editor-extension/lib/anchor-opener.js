"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { filename } = require("./narration.js");

// Ownership belongs to a concrete tab, not a path. Once the reviewer pins,
// edits, or moves it, the tour can never reclaim it for automatic cleanup.
function createAnchorOpener(vscode, changed = () => {}) {
  const documents = new Map(), owned = new Map();
  let movingGroups = false;
  const key = uri => uri?.toString();
  const entries = () => vscode.window.tabGroups.all.flatMap(group => group.tabs.map(tab => ({ tab, column: group.viewColumn })));
  function reconcile() {
    const all = entries();
    for (const [tab, owner] of owned) {
      const entry = all.find(e => e.tab === tab);
      if (!entry) owned.delete(tab);
      else if (!tab.isPreview || tab.isPinned || tab.isDirty || (!movingGroups && entry.column !== owner.column)) owner.detached = true;
    }
  }
  function disposable(tab) { reconcile(); return owned.has(tab) && !owned.get(tab).detached; }
  const subscriptions = [
    vscode.workspace.registerTextDocumentContentProvider("kanko-rev", { provideTextDocumentContent(uri) {
      if (!documents.has(key(uri))) throw new Error("This tour source is unavailable. Reload the tour.");
      return documents.get(key(uri));
    } }),
    vscode.window.tabGroups.onDidChangeTabs(() => { reconcile(); changed(); }),
    vscode.window.tabGroups.onDidChangeTabGroups(() => { reconcile(); changed(); }),
  ];
  function revisionUri(state, anchor, side) {
    const uri = vscode.Uri.from({ scheme: "kanko-rev", path: `/${anchor.path}`, query: JSON.stringify({ path: path.join(state.workspace, anchor.path), ref: anchor.rev[side], side, kanko: "tour", identity: state.identity }) });
    documents.set(key(uri), state.texts.get(anchor.path)[side] ?? ""); return uri;
  }
  function matchesWorking(uri, expected) {
    if (expected === null) return false;
    try {
      if (!fs.lstatSync(uri.fsPath).isFile() || fs.realpathSync(uri.fsPath) !== uri.fsPath) return false;
      if (!fs.readFileSync(uri.fsPath).equals(Buffer.from(expected))) return false;
      const doc = vscode.workspace.textDocuments.find(d => key(d.uri) === key(uri));
      return !doc || doc.getText() === expected;
    } catch { return false; }
  }
  function describe(state, anchor) {
    const file = vscode.Uri.file(path.join(state.workspace, anchor.path));
    const base = revisionUri(state, anchor, "base");
    const head = matchesWorking(file, state.texts.get(anchor.path).head) ? file : revisionUri(state, anchor, "head");
    return { anchor, base, head, target: anchor.view === "base" ? base : head };
  }
  function find(record, companion = false) {
    const target = companion ? record.base : record.target;
    // A matching plain file already opened by the reviewer wins over creating
    // a duplicate diff. A diff must also have the correct original revision.
    return entries().find(({ tab }) => key(tab.input?.uri) === key(target) ||
      (!companion && key(tab.input?.modified) === key(target) && key(tab.input?.original) === key(record.base)));
  }
  async function open(record, column, { focus = false, companion = false } = {}) {
    const existing = find(record, companion);
    // Reuse a matching tab wherever the reviewer put it. Allocation belongs to
    // the layout engine; the opener cannot create an unbudgeted group.
    const targetColumn = existing?.column ?? column;
    if (!vscode.window.tabGroups.all.some(g => g.viewColumn === targetColumn)) return null;
    const group = vscode.window.tabGroups.all.find(g => g.viewColumn === targetColumn);
    if (!existing && group.tabs.some(t => t.isPreview && !disposable(t))) return null;
    const before = new Set(entries().map(e => e.tab));
    const options = { preview: true, preserveFocus: !focus, viewColumn: targetColumn };
    if ((!companion && record.anchor.view === "diff" && !existing?.tab.input?.uri) || existing?.tab.input?.modified) {
      const short = ref => ref.startsWith("WORKTREE:") ? "working snapshot" : ref.slice(0, 7);
      await vscode.commands.executeCommand("vscode.diff", record.base, record.head, `${filename(record.anchor.path)} (${short(record.anchor.rev.base)} ↔ ${short(record.anchor.rev.head)})`, options);
    } else {
      const doc = await vscode.workspace.openTextDocument(companion ? record.base : record.target);
      await vscode.window.showTextDocument(doc, options);
    }
    const entry = find(record, companion);
    if (!entry) throw new Error("The requested tour editor did not open.");
    if (!before.has(entry.tab)) owned.set(entry.tab, { column: entry.column, detached: false });
    return entry;
  }
  async function move(record, column) {
    const existing = await open(record, find(record)?.column, { focus: true });
    if (!existing) return null;
    // Native move preserves dirty content and tab identity instead of opening
    // a duplicate and guessing whether it is safe to close the original.
    await vscode.commands.executeCommand("moveActiveEditor", { to: "position", by: "group", value: column });
    const moved = find(record);
    if (moved?.column !== column) throw new Error("The editor could not move to that group.");
    return moved;
  }
  async function closeExcept(keep) {
    reconcile();
    for (const entry of entries()) if (disposable(entry.tab) && !keep(entry.tab)) {
      await vscode.window.tabGroups.close(entry.tab, true); owned.delete(entry.tab);
    }

  }
  function prune(sources = []) {
    const retained = new Set([...sources.map(key), ...entries().flatMap(({tab}) => [key(tab.input?.uri), key(tab.input?.original), key(tab.input?.modified)])]);
    for (const uri of documents.keys()) if (!retained.has(uri)) documents.delete(uri);
  }
  return { keep(tab) { if (owned.has(tab)) owned.get(tab).detached = true; }, prune, describe, find, open, move, entries,
    async reshape(action) {
      reconcile(); movingGroups = true;
      try { return await action(); }
      finally {
        for (const entry of entries()) if (owned.has(entry.tab)) owned.get(entry.tab).column = entry.column;
        movingGroups = false;
      }
    }, matchesWorking, disposable, closeExcept,
    dispose() { subscriptions.forEach(s => s.dispose()); documents.clear(); owned.clear(); } };
}
module.exports = { createAnchorOpener };
