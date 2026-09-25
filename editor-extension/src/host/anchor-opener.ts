import type { Tab, Uri } from "vscode";
import type { TourAnchor, SourceSide } from "../shared/tour.js";
import type { OpenerApi } from "./native.js";
import { tabInput } from "./native.js";
import { sourceText, type PreparedTour, type AnchorRecord } from "./state.js";
type SourceState = Pick<PreparedTour, "workspace" | "identity" | "texts">;
export type AnchorOpener = ReturnType<typeof createAnchorOpener>;
import * as fs from "node:fs";
import * as path from "node:path";
import { filename } from "../../../generated/shared/narration.js";

// Pinned, edited, or moved tabs permanently leave automatic cleanup.
function createAnchorOpener(vscode: OpenerApi, changed = () => {}) {
  const documents = new Map<string, string>(),
    owned = new Map<Tab, { column: number; detached: boolean }>();
  let movingGroups = false;
  const key = (uri: Uri | undefined) => uri?.toString();
  const entries = () =>
    vscode.window.tabGroups.all.flatMap((group) =>
      group.tabs.map((tab) => ({ tab, column: group.viewColumn })),
    );
  function reconcile() {
    const all = entries();
    for (const [tab, owner] of owned) {
      const entry = all.find((e) => e.tab === tab);
      if (!entry) owned.delete(tab);
      else if (
        !tab.isPreview ||
        tab.isPinned ||
        tab.isDirty ||
        (!movingGroups && entry.column !== owner.column)
      )
        owner.detached = true;
    }
  }
  function disposable(tab: Tab) {
    reconcile();
    const owner = owned.get(tab);
    return !!owner && !owner.detached;
  }
  const subscriptions = [
    vscode.workspace.registerTextDocumentContentProvider("kanko-rev", {
      provideTextDocumentContent(uri) {
        const text = documents.get(uri.toString());
        if (text === undefined)
          throw new Error("This tour source is unavailable. Reload the tour.");
        return text;
      },
    }),
    vscode.window.tabGroups.onDidChangeTabs(() => {
      reconcile();
      changed();
    }),
    vscode.window.tabGroups.onDidChangeTabGroups(() => {
      reconcile();
      changed();
    }),
  ];
  function revisionUri(
    state: SourceState,
    anchor: TourAnchor,
    side: SourceSide,
  ) {
    const uri = vscode.Uri.from({
      scheme: "kanko-rev",
      path: `/${anchor.path}`,
      query: JSON.stringify({
        path: path.join(state.workspace, anchor.path),
        ref: anchor.rev[side],
        side,
        kanko: "tour",
        identity: state.identity,
      }),
    });
    documents.set(uri.toString(), sourceText(state, anchor.path)[side] ?? "");
    return uri;
  }
  function matchesWorking(uri: Uri, expected: string | null) {
    if (expected === null) return false;
    try {
      if (
        !fs.lstatSync(uri.fsPath).isFile() ||
        fs.realpathSync(uri.fsPath) !== uri.fsPath
      )
        return false;
      if (!fs.readFileSync(uri.fsPath).equals(Buffer.from(expected)))
        return false;
      const doc = vscode.workspace.textDocuments.find(
        (d) => key(d.uri) === key(uri),
      );
      return !doc || doc.getText() === expected;
    } catch {
      return false;
    }
  }
  function describe(state: SourceState, anchor: TourAnchor): AnchorRecord {
    const file = vscode.Uri.file(path.join(state.workspace, anchor.path));
    const base = revisionUri(state, anchor, "base");
    const head = matchesWorking(file, sourceText(state, anchor.path).head)
      ? file
      : revisionUri(state, anchor, "head");
    return { anchor, base, head, target: anchor.view === "base" ? base : head };
  }
  function find(record: AnchorRecord, companion = false) {
    const target = companion ? record.base : record.target;
    // Reuse an open file; matching diffs must also use the same base revision.
    return entries().find(
      ({ tab }) =>
        key(tabInput(tab).uri) === key(target) ||
        (!companion &&
          key(tabInput(tab).modified) === key(target) &&
          key(tabInput(tab).original) === key(record.base)),
    );
  }
  async function open(
    record: AnchorRecord,
    column: number | undefined,
    { focus = false, companion = false } = {},
  ) {
    const existing = find(record, companion);
    // Reuse matching tabs without creating groups outside the layout budget.
    const targetColumn = existing?.column ?? column;
    if (!vscode.window.tabGroups.all.some((g) => g.viewColumn === targetColumn))
      return null;
    const group = vscode.window.tabGroups.all.find(
      (g) => g.viewColumn === targetColumn,
    );
    if (
      !group ||
      (!existing && group.tabs.some((t) => t.isPreview && !disposable(t)))
    )
      return null;
    const before = new Set(entries().map((e) => e.tab));
    const options = {
      preview: true,
      preserveFocus: !focus,
      viewColumn: targetColumn,
    };
    if (
      (!companion &&
        record.anchor.view === "diff" &&
        !tabInput(existing?.tab).uri) ||
      tabInput(existing?.tab).modified
    ) {
      const short = (ref: string) =>
        ref.startsWith("WORKTREE:") ? "working snapshot" : ref.slice(0, 7);
      await vscode.commands.executeCommand(
        "vscode.diff",
        record.base,
        record.head,
        `${filename(record.anchor.path)} (${short(record.anchor.rev.base)} ↔ ${short(record.anchor.rev.head)})`,
        options,
      );
    } else {
      const doc = await vscode.workspace.openTextDocument(
        companion ? record.base : record.target,
      );
      await vscode.window.showTextDocument(doc, options);
    }
    const entry = find(record, companion);
    if (!entry) throw new Error("The requested tour editor did not open.");
    if (!before.has(entry.tab))
      owned.set(entry.tab, { column: entry.column, detached: false });
    return entry;
  }
  async function move(record: AnchorRecord, column: number) {
    const existing = await open(record, find(record)?.column, { focus: true });
    if (!existing) return null;
    // Move the existing tab to preserve its identity and unsaved edits.
    const destination = vscode.window.tabGroups.all.find(
      (g) => g.viewColumn === column,
    );
    await vscode.commands.executeCommand("moveActiveEditor", {
      to: "position",
      by: "group",
      value: column,
    });
    const moved = find(record);
    if (!moved || !destination?.tabs.includes(moved.tab))
      throw new Error("The editor could not move to that group.");
    return moved;
  }
  async function closeExcept(keep: (tab: Tab) => boolean) {
    reconcile();
    for (const entry of entries())
      if (disposable(entry.tab) && !keep(entry.tab)) {
        await vscode.window.tabGroups.close(entry.tab, true);
        owned.delete(entry.tab);
      }
  }
  function prune(sources: Uri[] = []) {
    const retained = new Set([
      ...sources.map(key),
      ...entries().flatMap(({ tab }) => [
        key(tabInput(tab).uri),
        key(tabInput(tab).original),
        key(tabInput(tab).modified),
      ]),
    ]);
    for (const uri of documents.keys())
      if (!retained.has(uri)) documents.delete(uri);
  }
  return {
    keep(tab: Tab) {
      const owner = owned.get(tab);
      if (owner) owner.detached = true;
    },
    prune,
    describe,
    find,
    open,
    move,
    entries,
    async reshape<T>(action: () => PromiseLike<T>) {
      reconcile();
      movingGroups = true;
      try {
        return await action();
      } finally {
        for (const entry of entries()) {
          const owner = owned.get(entry.tab);
          if (owner) owner.column = entry.column;
        }
        movingGroups = false;
      }
    },
    matchesWorking,
    disposable,
    closeExcept,
    dispose() {
      subscriptions.forEach((s) => s.dispose());
      documents.clear();
      owned.clear();
    },
  };
}
export { createAnchorOpener };
