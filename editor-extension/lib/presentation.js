"use strict";

const path = require("node:path");
const { mapRange, seamLineFor, removedBaseLines0 } = require("../src/host/hunks.js");
const { normalizeAnchor, checkAnchor, hashText, rangeText } = require("./anchors.js");

function createPresentation(vscode, editor, store, sideResolver, git = require("./git.js")) {
  const { diffHunks, changedFiles, blobText } = git;
  let active = null, saved = null, generation = 0, reconciling = false;
  let navigating = 0;
  let repaintTimer, driftTimer;
  const cache = new Map(), companions = new Map();
  const config = () => vscode.workspace.getConfiguration("kanko.presentation");
  // VS Code 1.139 exposes original TextEditors (and visibleRanges) even in
  // inline mode. Presence alone cannot prove the original is on screen.
  // In automatic layout, conservatively provide the requested fallback.
  const originalIsVisible = (uri) => {
    const diff = vscode.workspace.getConfiguration("diffEditor");
    return diff.get("renderSideBySide", true) && !diff.get("useInlineViewWhenSpaceIsLimited", true) &&
      vscode.window.visibleTextEditors.some((e) => uriKey(e.document.uri) === uriKey(uri));
  };
  const uriKey = (uri) => uri.toString();
  const repaint = () => editor.applyAll(store, sideResolver);
  const tabs = () => vscode.window.tabGroups.all.flatMap((g) => g.tabs.map((tab) => ({ tab, group: g.viewColumn })));

  const provider = vscode.workspace.registerTextDocumentContentProvider("kanko-rev", {
    provideTextDocumentContent(uri) {
      const q = JSON.parse(uri.query);
      const root = editor.workspaceRoot();
      const rel = path.relative(root, q.path);
      if (!rel || rel === ".." || rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel) || !/^[0-9a-f]{40,64}$/.test(q.ref)) throw new Error("invalid revision URI");
      return q.empty ? "" : blobText(root, q.ref, rel);
    },
  });

  function revisionUri(source, ref, canonical, companion = false, empty = false) {
    const root = editor.workspaceRoot();
    return vscode.Uri.file(path.join(root, source)).with({ scheme: "kanko-rev", query: JSON.stringify({
      path: path.join(root, source), canonicalPath: path.join(root, canonical), ref,
      ...(companion ? { kanko: "companion" } : {}),
      ...(empty ? { empty: true } : {}),
    }) });
  }

  async function closeCompanions(reason, keep) {
    const policy = config().get("closeCompanion", "onBeatChange");
    for (const [key, owned] of companions) {
      const entry = tabs().find(({ tab }) => tab.input?.uri?.toString() === key);
      if (!entry) { companions.delete(key); continue; }
      // A pinned or moved tab becomes the reviewer's, permanently.
      if (!entry.tab.isPreview || entry.group !== owned.group) owned.detached = true;
      if (owned.detached || key === keep || policy === "never" || (reason === "beat" && policy === "onTourEnd")) continue;
      await vscode.window.tabGroups.close(entry.tab, true);
      companions.delete(key);
    }
  }

  async function waitForBase(uri) {
    const find = () => originalIsVisible(uri);
    if (find()) return;
    await new Promise((resolve) => {
      const finish = () => { clearTimeout(timer); sub.dispose(); resolve(); };
      const sub = vscode.window.onDidChangeVisibleTextEditors(() => { if (find()) finish(); });
      const timer = setTimeout(finish, 500);
    });
  }

  function hover(text) {
    const md = new vscode.MarkdownString();
    md.appendText(text || "");
    return md;
  }

  async function activate(anchor, stop, label, options = {}) {
    navigating++;
    try { return await activateBeat(anchor, stop, label, options); }
    finally { navigating--; }
  }

  async function activateBeat(anchor, stop, label, options) {
    const token = ++generation;
    clearTimeout(driftTimer);
    active = null;
    store.clearPaint();
    const a = normalizeAnchor(anchor);
    const root = editor.workspaceRoot();
    const relative = path.relative(root, path.resolve(root, a.path));
    if (!relative || relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) throw new Error("anchor path must stay inside the workspace");
    let source = a.path, hunks = [], changeStatus;
    if (stop?.base && stop?.head) {
      const key = JSON.stringify([root, stop.base.sha, stop.head.sha, a.path]);
      let data = cache.get(key);
      if (!data) {
        const changes = stop.head.sha === "WORKTREE" ? [] : await changedFiles(root, stop.base.sha, stop.head.sha);
        const change = changes.find((c) => c.targetPath === a.path);
        source = change?.sourcePath || a.path;
        data = { source, hunks: await diffHunks(root, stop.base.sha, stop.head.sha, [...new Set([source, a.path])]), changeStatus: change?.status };
        if (stop.head.sha !== "WORKTREE") cache.set(key, data);
      }
      ({ source, hunks, changeStatus } = data);
      if (stop.head.sha === "WORKTREE" && !await git.hasBlob(root, stop.base.sha, a.path)) changeStatus = "A";
    }
    if (token !== generation) return;
    const readText = async (side) => {
      if (side === "worktree" || side === "working" || (side === "head" && (stop?.head?.sha === "WORKTREE" || ["worktree", "working"].includes(a.side)))) {
        return (await vscode.workspace.openTextDocument(vscode.Uri.file(editor.absolute(a.path)))).getText();
      }
      return blobText(root, stop?.[side]?.sha || a.rev, side === "base" ? source : a.path);
    };
    const checked = await checkAnchor(a, readText);
    if (token !== generation) return;
    // Preserve the first activation's independent span hashes on Return.
    a.focus = a.focus.map((f, i) => ({ ...f, contentHash: f.contentHash || checked.focusHashes[i],
      kind: f.kind || (hunks.some((h) => h[`${f.side}Len`] > 0 && f.range.startLine < h[`${f.side}Start`] + h[`${f.side}Len`] && f.range.endLine >= h[`${f.side}Start`]) ? f.side === "base" ? "removed" : "added" : "unchanged"),
    }));
    active = { anchor: a, stop, label, source, hunks, readText, hashes: checked.focusHashes, stale: checked.stale, token, claimIds: options.claimIds || [] };
    store.setState(checked.stale ? "stale" : options.detour ? "detour" : "following");
    if (stop?.base && stop?.head && changeStatus !== "A") {
      active.baseUri = revisionUri(source, stop.base.sha, a.path);
      if (token !== generation) return;
      active.headUri = stop.head.sha === "WORKTREE" ? vscode.Uri.file(editor.absolute(a.path)) :
        revisionUri(a.path, stop.head.sha, a.path, false, changeStatus === "D");
      await vscode.commands.executeCommand("vscode.diff", active.baseUri, active.headUri, stop.label || a.path, { preview: true, preserveFocus: false });
      if (token !== generation) return;
      if (a.focus.some((f) => f.side === "base")) await waitForBase(active.baseUri);
    }
    if (token !== generation) return;
    await reconcile(true);
    if (token !== generation) return;
    const first = a.focus[0];
    if (first && !checked.stale) await editor.reveal(a.path, first.side === "head" && stop?.head?.sha === "WORKTREE" ? "working" : first.side, first.range.startLine, first.range.endLine, sideResolver);
  }

  async function reconcile(reveal = false) {
    if (!active || reconciling) return;
    reconciling = true;
    const beat = active;
    try {
      const { anchor: a, hunks, stop } = beat;
      const baseFocus = a.focus.filter((f) => f.side === "base");
      const original = beat.baseUri && originalIsVisible(beat.baseUri);
      const fallback = baseFocus.length && beat.baseUri && !original && !beat.stale;
      const useCompanion = fallback && config().get("removedCode", "companion") === "companion";
      const companionUri = useCompanion ? revisionUri(beat.source, stop.base.sha, a.path, true) : null;
      await closeCompanions("beat", companionUri && uriKey(companionUri));
      if (active !== beat) return;
      if (useCompanion && !["exploring", "paused"].includes(store.state())) {
        const key = uriKey(companionUri);
        const visible = vscode.window.visibleTextEditors.find((e) => uriKey(e.document.uri) === key);
        const owned = companions.get(key);
        if (!visible && !owned?.detached) {
          const doc = await vscode.workspace.openTextDocument(companionUri);
          if (active !== beat) return;
          const e = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true, preview: true });
          companions.set(key, { group: e.viewColumn, detached: false });
          if (reveal && active === beat) e.revealRange(new vscode.Range(baseFocus[0].range.startLine - 1, 0, baseFocus[0].range.endLine - 1, 0), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
        }
      }
      if (active !== beat) return;
      store.clearPaint();
      const contextSide = ["worktree", "working"].includes(a.side) ? "head" : a.side;
      const narrationHover = hover(beat.label);
      for (const id of beat.claimIds) {
        narrationHover.appendMarkdown(`\n\n[Open claim](command:kanko.presentation.openClaim?${encodeURIComponent(JSON.stringify([id]))})`);
      }
      narrationHover.isTrusted = { enabledCommands: ["kanko.presentation.openClaim"] };
      for (const side of ["base", "head"]) {
        const focus = a.focus.filter((f) => f.side === side).map((f) => f.range);
        const context = side === contextSide ? a.context : mapRange(a.context, hunks, contextSide);
        const seams = fallback && side === "head" ? baseFocus.flatMap((f) => {
          const line = seamLineFor(f.range.startLine - 1, hunks);
          if (line === undefined) return [];
          const md = hover("Removed code. ");
          const headEditor = vscode.window.visibleTextEditors.find((e) => uriKey(e.document.uri) === uriKey(beat.headUri));
          const peekLine = Math.max(0, Math.min(line, (headEditor?.document.lineCount || line + 1) - 1));
          const args = [beat.headUri, new vscode.Position(peekLine, 0), [new vscode.Location(beat.baseUri, new vscode.Range(f.range.startLine - 1, 0, f.range.endLine - 1, 0))]];
          md.appendMarkdown(`[Peek removed code](command:editor.action.showReferences?${encodeURIComponent(JSON.stringify(args))})`);
          md.isTrusted = { enabledCommands: ["editor.action.showReferences"] };
          return [{ line, hover: md, label: `${f.range.endLine - f.range.startLine + 1} lines removed${useCompanion ? " · shown beside" : " · peek"}` }];
        }) : [];
        store.setPaint(a.path, side === "head" && (stop?.head?.sha === "WORKTREE" || ["working", "worktree"].includes(a.side)) ? "working" : side, {
          context: [context], focus, label: beat.label, hover: narrationHover, seams,
          removedLines: side === "base" ? removedBaseLines0(hunks) : [],
        });
      }
      repaint();
    } finally { reconciling = false; }
  }

  async function focus(body, stop) {
    const ranges = stop?.files?.find((f) => f.path === body.path)?.ranges || [];
    const context = ranges.find((r) => r.side === body.side) || { startLine: body.startLine, endLine: body.endLine };
    const side = body.side === "working" ? "worktree" : body.side;
    const anchor = { path: body.path, side, rev: stop?.[body.side]?.sha || "WORKTREE", context,
      focus: [{ side: body.side === "working" ? "head" : body.side, range: { startLine: body.startLine, endLine: body.endLine } }] };
    if (side === "worktree") {
      const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(editor.absolute(body.path)));
      anchor.contentHash = hashText(rangeText(doc.getText(), context) || "");
    }
    await activate(anchor, stop, body.note);
  }

  function schedule() {
    repaint();
    clearTimeout(repaintTimer);
    repaintTimer = setTimeout(() => reconcile().catch(report), 30);
  }
  const report = (err) => vscode.window.showWarningMessage(`Tour presentation: ${err.message}`);
  const subscriptions = [provider,
    vscode.window.onDidChangeVisibleTextEditors(schedule),
    vscode.workspace.onDidChangeConfiguration((e) => { if (e.affectsConfiguration("diffEditor") || e.affectsConfiguration("kanko.presentation")) schedule(); }),
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (!active || !["worktree", "working"].includes(active.anchor.side) || editor.describe({ document: e.document })?.path !== active.anchor.path) return;
      const beat = active;
      clearTimeout(driftTimer);
      driftTimer = setTimeout(async () => {
        try {
          const result = await checkAnchor(beat.anchor, beat.readText, beat.hashes);
          if (active !== beat) return;
          beat.stale = result.stale;
          store.setState(result.stale ? "stale" : "exploring");
          await reconcile();
        } catch (err) { report(err); }
      }, 300);
    }),
    vscode.window.onDidChangeTextEditorSelection((e) => {
      if (e.kind && !navigating && store.state() === "following") { store.setState("exploring"); repaint(); }
    }),
  ];

  return {
    focus, activate,
    async reset(end = false) {
      generation++; active = null; saved = null;
      clearTimeout(driftTimer); store.clearPaint();
      if (end) cache.clear();
      await closeCompanions(end ? "end" : "beat");
    },
    setState(state) {
      store.setState(active?.stale ? "stale" : state);
      repaint();
      if (state === "following") return reconcile(true);
    },
    status() { return { state: store.state(), stale: Boolean(active?.stale), anchor: active ? structuredClone(active.anchor) : null }; },
    async detour(anchor, stop, label) { saved = active; await activate(anchor, stop, label, { detour: true }); },
    async returnFromDetour() {
      const prior = saved; saved = null;
      if (prior) await activate(prior.anchor, prior.stop, prior.label, { claimIds: prior.claimIds });
    },
    dispose() { generation++; active = null; clearTimeout(repaintTimer); clearTimeout(driftTimer); for (const s of subscriptions) s.dispose(); },
  };
}

module.exports = { createPresentation };
