"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { tourSources } = require("./tour-sources.js");
const { validateTourPlan } = require("./tour-contract.js");
const { createPresenter } = require("./presenter.js");
const { anchorNumber, filename } = require("./narration.js");

function createTourHost(vscode) {
  const presenter = createPresenter(vscode), documents = new Map();
  let shown = null;
  const provider = vscode.workspace.registerTextDocumentContentProvider("relay-rev", {
    provideTextDocumentContent(uri) {
      if (!documents.has(uri.toString())) throw new Error("This tour source is unavailable. Reload the tour.");
      return documents.get(uri.toString());
    },
  });
  function prepare(body) {
    try {
      if (!body || typeof body.workspace !== "string" || typeof body.tourId !== "string" || !body.tourId || !Array.isArray(body.claims)) throw new Error("Load requires workspace, tourId, plan, change, and claims.");
      const workspace = fs.realpathSync(body.workspace);
      if (!(vscode.workspace.workspaceFolders || []).some((f) => fs.realpathSync(f.uri.fsPath) === workspace)) throw new Error("The tour workspace is not open in this window.");
      const source = tourSources(workspace, body.change);
      const checked = validateTourPlan(body.plan, { ...source, claims: body.claims, hardLimit: vscode.workspace.getConfiguration("relay.tour").get("anchorLimit", 24) });
      if (!checked.ok) throw Object.assign(new Error("Fix tour validation findings before loading."), { details: { findings: checked.findings } });
      const texts = new Map();
      for (const stop of checked.plan.stops) for (const anchor of stop.anchors) if (!texts.has(anchor.path)) texts.set(anchor.path, source.readSource(anchor));
      return { tourId: body.tourId, plan: checked.plan, findings: checked.findings, workspace, texts, identity: body.change.manifestDigest };
    } catch (error) {
      throw Object.assign(new Error(error.message), { code: "invalid_tour_plan", details: error.details || { findings: [{ severity: "error", code: "source_unavailable", location: "tour", message: error.message }] } });
    }
  }
  function uri(state, anchor, side) {
    const value = vscode.Uri.from({ scheme: "relay-rev", path: `/${anchor.path}`, query: JSON.stringify({ path: path.join(state.workspace, anchor.path), ref: anchor.rev[side], side, relay: "tour", identity: state.identity }) });
    documents.set(value.toString(), state.texts.get(anchor.path)[side] ?? "");
    return value;
  }
  function clearPaint() { for (const editor of vscode.window.visibleTextEditors) presenter.clear(editor); }
  function paint(state) {
    clearPaint();
    const settings = vscode.workspace.getConfiguration("relay.presentation");
    presenter.configure(settings.get("dimOpacity", 0.45));
    if (!shown || state.mode === "paused") return;
    const { anchor, uris } = shown;
    for (const editor of vscode.window.visibleTextEditors) {
      const side = Object.keys(uris).find((side) => uris[side].toString() === editor.document.uri.toString());
      if (!side) continue;
      const focus = anchor.focus.filter((f) => f.side === side).map((f) => f.range);
      const context = side === anchor.side ? [anchor.context] : focus;
      presenter.paint(editor, { context, focus: focus.length ? focus : context, state: state.mode, showLabels: settings.get("showLabels", true),
        label: `${anchorNumber(anchor.n)} ${filename(anchor.path)}:${anchor.context.startLine}–${anchor.context.endLine} · ${anchor.label}` });
    }
  }
  async function present(state, { focus = false } = {}) {
    if (state.mode !== "following" && !focus) { paint(state); return; }
    const anchor = state.plan.stops[state.stopIndex].anchors.find((a) => a.n === state.selectedAnchor);
    if (!anchor) { clearPaint(); shown = null; return; }
    const uris = { base: uri(state, anchor, "base"), head: uri(state, anchor, "head") };
    if (anchor.view === "diff") {
      const short = (ref) => ref.startsWith("WORKTREE:") ? "working snapshot" : ref.slice(0, 7);
      await vscode.commands.executeCommand("vscode.diff", uris.base, uris.head, `${filename(anchor.path)} (${short(anchor.rev.base)} ↔ ${short(anchor.rev.head)})`, { preview: true, preserveFocus: !focus, viewColumn: vscode.ViewColumn.Active });
    } else {
      const doc = await vscode.workspace.openTextDocument(uris[anchor.view]);
      await vscode.window.showTextDocument(doc, { preview: true, preserveFocus: !focus, viewColumn: vscode.ViewColumn.Active });
    }
    shown = { anchor, uris }; paint(state);
    const target = vscode.window.visibleTextEditors.find((e) => e.document.uri.toString() === uris[anchor.side].toString());
    target?.revealRange(new vscode.Range(anchor.context.startLine - 1, 0, anchor.context.endLine - 1, 0), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }
  return { prepare, present, clear() { clearPaint(); shown = null; }, dispose() { provider.dispose(); presenter.dispose(); documents.clear(); } };
}
module.exports = { createTourHost };
