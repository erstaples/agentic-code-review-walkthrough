"use strict";
const fs = require("node:fs");
const { tourSources } = require("./tour-sources.js");
const { validateTourPlan } = require("./tour-contract.js");
const { createDecorationRegistry } = require("./decoration-registry.js");
const { createAnchorOpener } = require("./anchor-opener.js");
const { sourceHunks } = require("./source-diff.js");
const { mapRange, seamLineFor, removedBaseLines0 } = require("./hunks.js");
const { anchorNumber, filename, colorIndex } = require("./narration.js");

function createTourHost(vscode, { changed = () => {}, explore = () => {} } = {}) {
  const registry = createDecorationRegistry(vscode);
  const badgeEvents = new vscode.EventEmitter();
  let current = null, records = [], navigating = 0, timer;
  const key = uri => uri?.toString();
  const opener = createAnchorOpener(vscode, schedule);
  const settings = () => vscode.workspace.getConfiguration("relay.presentation");
  const inline = () => { const c = vscode.workspace.getConfiguration("diffEditor"); return !c.get("renderSideBySide", true) || c.get("useInlineViewWhenSpaceIsLimited", true); };
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
      return { tourId: body.tourId, plan: checked.plan, findings: checked.findings, workspace, texts, hunks: new Map([...texts].map(([file, text]) => [file, sourceHunks(text)])), identity: body.change.manifestDigest };
    } catch (error) {
      throw Object.assign(new Error(error.message), { code: "invalid_tour_plan", details: error.details || { findings: [{ severity: "error", code: "source_unavailable", location: "tour", message: error.message }] } });
    }
  }
  function orderedRecords() {
    if (!current) return [];
    const beat = current.plan.stops[current.stopIndex].beats[current.beatIndex];
    const priority = [...new Set([current.selectedAnchor, ...beat.active, ...records.map(r => r.anchor.n)].filter(Boolean))];
    return priority.map(n => records.find(r => r.anchor.n === n));
  }
  function representative(record) { return orderedRecords().find(r => key(r.target) === key(record.target)); }
  function stale(record) { return record.head.scheme === "file" && !opener.matchesWorking(record.head, current.texts.get(record.anchor.path).head); }
  function snapshot() {
    if (!current) return { anchors: [] };
    return { anchors: records.map(record => {
      const entry = opener.find(record), companion = record.companion && opener.find(record, true);
      const visible = entry && representative(record) === record && vscode.window.visibleTextEditors.some(e => key(e.document.uri) === key(record.target));
      return { n: record.anchor.n, path: record.anchor.path, status: stale(record) ? "stale" : visible ? "visible" : entry ? "open" : "not-open", column: entry?.column ?? null,
        source: record.target.scheme, companionColumn: companion?.column ?? null, removedCode: record.removedCode || null };
    }) };
  }
  function clearPaint() { for (const editor of vscode.window.visibleTextEditors) registry.clear(editor); }
  function paint() {
    clearPaint(); if (!current || current.mode === "paused") return;
    registry.configure(settings().get("dimOpacity", 0.45));
    const painted = new Set();
    for (const record of orderedRecords()) {
      const { anchor } = record;
      if (!opener.find(record)) continue;
      const isStale = stale(record), hunks = current.hunks.get(anchor.path);
      for (const editor of vscode.window.visibleTextEditors) {
        const side = key(editor.document.uri) === key(record.head) ? "head" : key(editor.document.uri) === key(record.base) ? "base" : null;
        if (!side || painted.has(editor)) continue;
        painted.add(editor);
        const focus = anchor.focus.filter(f => f.side === side).map(f => f.range);
        const context = side === anchor.side ? anchor.context : mapRange(anchor.context, hunks, anchor.side);
        const seams = record.removedCode && side === "head" ? anchor.focus.filter(f => f.side === "base").flatMap(f => {
          const line = seamLineFor(f.range.startLine - 1, hunks); if (line === undefined) return [];
          const hover = new vscode.MarkdownString("Removed code. ");
          // Command links cross a JSON boundary. Resolve the current anchor in
          // the extension so showReferences receives actual API value objects.
          const args = [current.tourId, current.stopIndex, anchor.n, f.range.startLine, f.range.endLine];
          hover.appendMarkdown(`[Peek removed code](command:relay.tour.peekRemoved?${encodeURIComponent(JSON.stringify(args))})`);
          hover.isTrusted = { enabledCommands: ["relay.tour.peekRemoved"] };
          return [{ line, hover, label: `${anchorNumber(anchor.n)} ${f.range.endLine - f.range.startLine + 1} lines removed · ${record.companion ? "shown beside" : "peek"}` }];
        }) : [];
        registry.forAnchor(anchor.n).paint(editor, { context: [context], focus, seams, removedLines: side === "base" && record.companion ? removedBaseLines0(hunks) : [],
          state: isStale ? "stale" : current.mode, showLabels: settings().get("showLabels", true),
          label: `${anchorNumber(anchor.n)} ${filename(anchor.path)}:${anchor.context.startLine}–${anchor.context.endLine} · ${anchor.label}` });
      }
    }
  }
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(() => { paint(); badgeEvents.fire(undefined); changed(); }, 30);
  }
  function reveal(record) {
    const editor = vscode.window.visibleTextEditors.find(e => key(e.document.uri) === key(record.anchor.side === "base" ? record.base : record.head));
    editor?.revealRange(new vscode.Range(record.anchor.context.startLine - 1, 0, record.anchor.context.endLine - 1, 0), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  }
  async function present(state, { focus = false } = {}) {
    navigating++;
    try {
      const stop = state.plan.stops[state.stopIndex], beat = stop.beats[state.beatIndex];
      current = state;
      const previous = records;
      records = stop.anchors.map(anchor => {
        const record = opener.describe(state, anchor);
        const retained = previous.find(r => r.anchor === anchor && key(r.target) === key(record.target));
        if (retained) { record.companion = retained.companion; record.removedCode = retained.removedCode; }
        return record;
      });
      const active = [...new Set([state.selectedAnchor, ...beat.active].filter(Boolean))];
      if (state.mode === "following" || focus) {
        // Keep every anchor of this stop, including inactive previews. Obsolete
        // previews and companions are closed only if they are still tour-owned.
        const targets = new Set(records.map(r => key(r.target)));
        await opener.closeExcept(tab => targets.has(key(tab.input?.uri)) || targets.has(key(tab.input?.modified)));
        const used = new Set();
        const candidates = (focus && state.mode !== "following" ? [state.selectedAnchor] : active).map(n => records.find(r => r.anchor.n === n));
        const desired = candidates.filter((r, i) => candidates.findIndex(other => key(other.target) === key(r.target)) === i).slice(0, 3);
        // Reserve existing target groups before opening anything so opening an
        // earlier anchor cannot replace a later anchor's preview.
        for (const record of desired) { const found = opener.find(record); if (found) used.add(found.column); }
        for (let i = 0; i < desired.length; i++) {
          const record = desired[i], existing = opener.find(record);
          if (existing) used.delete(existing.column);
          const entry = await opener.open(record, used, { focus: i === 0 });
          if (entry) reveal(record);
        }
        for (const record of desired) {
          if (!opener.find(record) || record.anchor.view !== "diff" || !inline() || !record.anchor.focus.some(f => f.side === "base")) continue;
          const companion = settings().get("removedCode", "companion") === "companion" && await opener.open(record, used, { companion: true });
          record.companion = Boolean(companion); record.removedCode = companion ? "companion" : "peek";
          if (companion) {
            const editor = vscode.window.visibleTextEditors.find(e => key(e.document.uri) === key(record.base));
            const first = record.anchor.focus.find(f => f.side === "base");
            editor?.revealRange(new vscode.Range(first.range.startLine - 1, 0, first.range.endLine - 1, 0), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
          }
        }
      }
      paint(); badgeEvents.fire(undefined); opener.prune(records.flatMap(r => [r.base, r.head])); return snapshot();
    } finally { navigating--; }
  }
  const subscriptions = [
    vscode.commands.registerCommand("relay.tour.peekRemoved", async (tourId, stopIndex, n, startLine, endLine) => {
      if (!current || current.tourId !== tourId || current.stopIndex !== stopIndex || current.mode === "paused") return;
      const record = records.find(r => r.anchor.n === n);
      if (!record || stale(record) || !record.anchor.focus.some(f => f.side === "base" && f.range.startLine === startLine && f.range.endLine === endLine)) return;
      const editor = vscode.window.visibleTextEditors.find(e => key(e.document.uri) === key(record.head));
      const seam = seamLineFor(startLine - 1, current.hunks.get(record.anchor.path));
      if (!editor || seam === undefined) return;
      return vscode.commands.executeCommand("editor.action.showReferences", record.head,
        new vscode.Position(Math.max(0, Math.min(seam, editor.document.lineCount - 1)), 0),
        [new vscode.Location(record.base, new vscode.Range(startLine - 1, 0, endLine - 1, 0))]);
    }),
    vscode.window.registerFileDecorationProvider({ onDidChangeFileDecorations: badgeEvents.event, provideFileDecoration(uri) {
      if (!current || current.mode === "paused") return;
      const record = orderedRecords().find(r => key(r.target) === key(uri) || (r.companion && key(r.base) === key(uri)));
      if (!record) return;
      const a = record.anchor;
      return { badge: String(a.n), color: new vscode.ThemeColor(`relay.anchor${colorIndex(a.n)}`), tooltip: `Stop ${current.stopIndex + 1} · ${a.n} ${a.label}${stale(record) ? " · source changed" : ""}` };
    } }),
    vscode.window.onDidChangeVisibleTextEditors(schedule),
    vscode.workspace.onDidChangeTextDocument(schedule),
    vscode.workspace.onDidChangeConfiguration(e => { if (e.affectsConfiguration("relay.presentation") || e.affectsConfiguration("diffEditor")) schedule(); }),
    vscode.window.onDidChangeTextEditorSelection(e => { if ([vscode.TextEditorSelectionChangeKind.Keyboard, vscode.TextEditorSelectionChangeKind.Mouse].includes(e.kind) && !navigating && current?.mode === "following") explore(); }),
    badgeEvents,
  ];
  return { prepare, present, snapshot,
    citation(uri) { const r = current && records.find(r => key(r.head) === key(uri) && !stale(r)); return r ? { side: "head", ref: r.anchor.rev.head } : null; },
    async clear() { navigating++; try { current = null; records = []; clearPaint(); badgeEvents.fire(undefined); await opener.closeExcept(() => false); opener.prune(); } finally { navigating--; } },
    dispose() { clearTimeout(timer); subscriptions.forEach(s => s.dispose()); opener.dispose(); registry.dispose(); },
  };
}
module.exports = { createTourHost };
