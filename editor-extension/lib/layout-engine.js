"use strict";
const { SHAPES, shapeFor, splitShape, geometry, cramped } = require("./layout-model.js");
const uriKey = uri => uri?.toString();
const invalid = message => Object.assign(new Error(message), { code: "bad_request" });

function createLayoutEngine(vscode, opener) {
  let records = [], shape = "single", customized = false, pins = new Set(), pinnedTabs = new Set(), prefs = new Map();
  let tourId, stopId, expected, tabs = [], internal = 0, sequence = false, override = false, unplaced = [];
  let clock = 0, activity = new Map();
  // TabGroup array order can retain creation order after inserting a split.
  // viewColumn is the current visual leaf order; tab identity survives moves.
  const groups = () => [...vscode.window.tabGroups.all].sort((a, b) => a.viewColumn - b.viewColumn);
  const config = () => vscode.workspace.getConfiguration("kanko.layout");
  const cap = () => Math.max(2, Math.min(4, Math.floor(Number(config().get("maxGroups", 3)) || 3)));
  const recordForTab = tab => records.find(r => uriKey(tab?.input?.uri) === uriKey(r.target) && tab?.input?.uri ||
    (tab?.input?.modified && uriKey(tab.input.modified) === uriKey(r.target) && uriKey(tab.input.original) === uriKey(r.base)));
  const visible = r => groups().find(g => recordForTab(g.activeTab)?.target.toString() === r.target.toString());
  const token = r => uriKey(r.target);
  function slots() {
    return groups().map((g, i) => {
      const r = recordForTab(g.activeTab);
      return { slot: SHAPES[shape]?.slots[i] || `group${g.viewColumn}`,
        column: g.viewColumn, anchor: r?.anchor.n, pinned: Boolean(r && pins.has(token(r))) || Boolean(g.activeTab?.isPinned) || pinnedTabs.has(g.activeTab),
        lastActive: activity.get(g.activeTab) || 0, group: g, record: r };
    });
  }
  const tabState = () => groups().flatMap(g => g.tabs.map(tab => ({ tab, group: g, column: g.viewColumn, active: g.activeTab === tab })));
  async function capture() { expected = geometry(await vscode.commands.executeCommand("vscode.getEditorLayout")); tabs = tabState(); }
  async function observe() {
    if (internal || !tourId) return;
    const layout = await vscode.commands.executeCommand("vscode.getEditorLayout");
    const actual = geometry(layout);
    const topology = node => node.groups ? { orientation: node.orientation, groups: node.groups.map(topology) } : {};
    const structure = JSON.stringify(topology(layout));
    shape = Object.keys(SHAPES).find(name => JSON.stringify(topology(SHAPES[name].layout)) === structure) || null;
    if (internal) return;
    const now = tabState();
    if (expected && (actual !== expected || tabs.length !== now.length || tabs.some((t, i) => t.tab !== now[i]?.tab || t.column !== now[i]?.column || t.active !== now[i]?.active))) customized = true;
    expected = actual; tabs = now;
  }
  async function transaction(action) {
    internal++;
    try { return await action(); }
    finally { try { await capture(); } finally { internal--; } }
  }
  async function setShape(name) {
    await opener.reshape(() => vscode.commands.executeCommand("vscode.setEditorLayout", structuredClone(SHAPES[name].layout)));
    shape = name;
  }
  function eligible(slot, reserved = new Set()) {
    if (slot.pinned || reserved.has(slot.column)) return false;
    // Replacing a group must not displace a reviewer tab, including an inactive
    // preview that VS Code would silently close when another preview opens.
    return slot.group.tabs.every(t => !t.isPreview || opener.disposable(t)) && (!slot.group.activeTab || opener.disposable(slot.group.activeTab));
  }
  function preferred(role, reserved) {
    const pref = prefs.get(role);
    if (!pref || pref.kind !== "replace") return null;
    return slots().find(s => s.slot === pref.slot && eligible(s, reserved));
  }
  function choose(record, reserved) {
    const available = slots().filter(s => eligible(s, reserved));
    return available.find(s => !s.group.activeTab) || preferred(record.anchor.role, reserved) || available.sort((a, b) => a.lastActive - b.lastActive || a.column - b.column)[0];
  }
  async function put(record, slot, focus) {
    const prior = slot?.group.activeTab;
    const entry = await opener.open(record, slot?.column, { focus });
    if (!entry) return null;
    // A hidden reusable tab can leave an old tour preview behind. Retain only
    // reviewer tabs; a replace placement has the promised "not open" result.
    if (prior && prior !== entry.tab && entry.column === slot.column && opener.disposable(prior)) await vscode.window.tabGroups.close(prior, true);
    activity.set(entry.tab, ++clock); return entry;
  }
  const unique = wanted => wanted.filter((r, i) => wanted.findIndex(other => token(other) === token(r)) === i);
  function safeToReshape() { return !customized && pins.size === 0; }
  function safeToCollapse() { return !customized && pins.size === 0 && groups().every(g => g.tabs.every(t => opener.disposable(t))); }
  async function begin(state, nextRecords) {
    await observe();
    const newTour = tourId !== state.tourId;
    if (newTour) { for (const tab of pinnedTabs) opener.keep(tab); pins.clear(); pinnedTabs.clear(); prefs.clear(); activity.clear(); clock = 0; }
    if (newTour || stopId !== state.plan.stops[state.stopIndex].id) {
      sequence = false; override = false; unplaced = [];
      // Preserve an inherited reviewer arrangement. Persistence and restoration
      // are phase 7; a new stop must not erase evidence of customization.
      if (newTour) customized = groups().some(g => g.tabs.some(t => !opener.disposable(t))) || groups().length > cap();
      tourId = state.tourId; stopId = state.plan.stops[state.stopIndex].id;
    }
    const priority = [state.selectedAnchor, ...(state.plan.stops[state.stopIndex].beats?.[state.beatIndex]?.active || [])];
    records = [...nextRecords].sort((a, b) => {
      const rank = r => priority.includes(r.anchor.n) ? priority.indexOf(r.anchor.n) : priority.length;
      return rank(a) - rank(b);
    });
    if (!expected) await capture();
  }
  async function apply(state, wanted, { focus = false } = {}) {
    if (state.mode !== "following" && !focus) return;
    await observe();
    return transaction(async () => {
      const all = unique(wanted), requested = (sequence ? all.slice(0, 1) : all.slice(0, cap()));
      unplaced = all.slice(requested.length).filter(r => !visible(r)).map(r => r.anchor.n);
      const missing = requested.filter(r => !visible(r));
      if (missing.length && safeToReshape() && !sequence) {
        const empty = slots().filter(s => !s.group.activeTab).length;
        const required = Math.min(cap(), groups().length + Math.max(0, missing.length - empty));
        if (required > groups().length) {
          const sideBySide = [...requested, ...slots().map(s => s.record).filter(Boolean)].some(r => r.anchor.view === "diff") && vscode.workspace.getConfiguration("diffEditor").get("renderSideBySide", true);
          await setShape(shapeFor(required, config().get("orientation", "auto"), sideBySide));
        }
      }
      const reserved = new Set(requested.map(r => visible(r)?.viewColumn).filter(Boolean));
      for (const r of requested) {
        const open = visible(r);
        if (open) { activity.set(open.activeTab, ++clock); if (focus && r === requested[0]) await opener.open(r, open.viewColumn, { focus: true }); continue; }
        const existing = opener.find(r);
        let slot = existing ? slots().find(s => s.column === existing.column && eligible(s, reserved)) : null;
        if (!existing) slot = choose(r, reserved);
        if (!slot) { unplaced.push(r.anchor.n); continue; }
        const entry = await put(r, slot, focus || r === requested[0]);
        if (entry) reserved.add(entry.column); else unplaced.push(r.anchor.n);
      }
      // Never collapse reviewer work, tour pins, or a customized geometry.
      // Short files/EOF are not evidence of a cramped viewport (phase 1 finding).
      if (config().get("sequenceFallback", true) && !sequence && !override && groups().length > 1 && safeToCollapse() && vscode.window.visibleTextEditors.some(cramped)) {
        const before = geometry(await vscode.commands.executeCommand("vscode.getEditorLayout"));
        await new Promise(resolve => setTimeout(resolve, 100));
        if (before !== geometry(await vscode.commands.executeCommand("vscode.getEditorLayout"))) customized = true;
      }
      if (config().get("sequenceFallback", true) && !sequence && !override && groups().length > 1 && safeToCollapse() && vscode.window.visibleTextEditors.some(cramped)) {
        sequence = true;
        const first = requested[0];
        const retained = first && opener.find(first)?.tab;
        await opener.closeExcept(tab => tab === retained);
        await setShape("single");
        if (first) await put(first, slots()[0], true);
        unplaced = all.filter(r => !visible(r)).map(r => r.anchor.n);
      }
    });
  }
  async function companion(record, reserved) {
    if (sequence) return null;
    const found = opener.find(record, true);
    if (found && !reserved.has(found.column)) return opener.open(record, found.column, { companion: true });
    let slot = slots().find(s => eligible(s, reserved) && !s.record);
    if (!slot && groups().length < cap() && safeToReshape()) {
      const name = shapeFor(groups().length + 1, config().get("orientation", "auto"), vscode.workspace.getConfiguration("diffEditor").get("renderSideBySide", true));
      await setShape(name); slot = slots().find(s => !s.group.activeTab && !reserved.has(s.column));
    }
    return slot ? opener.open(record, slot.column, { companion: true }) : null;
  }
  function options(n) {
    const r = records.find(r => r.anchor.n === n); if (!r) return [];
    const result = [{ kind: "auto" }, { kind: "peek" }];
    const origin = slots().find(s => s.anchor === n);
    if (origin?.pinned) return result;
    for (const s of slots()) if (s.anchor && s.anchor !== n && !s.pinned) {
      // Explicit replacement can cover a kept tab, but cannot destroy a preview
      // the reviewer owns. Pins are respected even for explicit placements.
      if (s.group.tabs.every(t => !t.isPreview || opener.disposable(t))) result.push({ kind: "replace", of: s.anchor });
      if (shape && groups().length < cap()) for (const kind of ["below", "beside"]) {
        const next = splitShape(shape, s.slot, kind);
        if (next && SHAPES[next[0]].slots.length <= cap()) result.push({ kind, of: s.anchor });
      }
    }
    return result;
  }
  async function action(body, state) {
    await observe();
    return transaction(async () => {
      if (body.action === "overrideSequence") { sequence = false; override = true; return; }
      if (body.action === "reset") {
        // Reset is an explicit reviewer action. Native pinned/dirty/kept tabs
        // still belong to the reviewer; only disposable tour previews close.
        pins.clear(); pinnedTabs.clear(); sequence = false; override = false;
        const protectedTabs = groups().some(g => g.tabs.some(t => !opener.disposable(t)));
        if (!protectedTabs) { await opener.closeExcept(() => false); await setShape("single"); }
        customized = protectedTabs;
        const beat = state.plan.stops[state.stopIndex].beats[state.beatIndex];
        await apply(state, beat.active.map(n => records.find(r => r.anchor.n === n)), { focus: true }); return;
      }
      const r = records.find(r => r.anchor.n === body.anchor);
      if (!r) throw invalid("Choose an anchor from the current stop.");
      if (body.action === "pin") {
        if (typeof body.pinned !== "boolean" || !visible(r)) throw invalid("Only a visible anchor can be pinned.");
        if (body.pinned) { pins.add(token(r)); pinnedTabs.add(visible(r).activeTab); }
        else { pins.delete(token(r)); pinnedTabs.delete(visible(r).activeTab); } return;
      }
      if (body.action !== "place") throw invalid("Unknown layout action.");
      const p = body.placement;
      if (!p || !options(r.anchor.n).some(o => o.kind === p.kind && o.of === p.of)) throw invalid("That placement is no longer available.");
      if (body.remember !== undefined && typeof body.remember !== "boolean") throw invalid("Remember must be true or false.");
      if (p.kind === "peek") {
        const editor = vscode.window.activeTextEditor; if (!editor) throw invalid("Focus an editor before peeking.");
        await vscode.commands.executeCommand("editor.action.peekLocations", editor.document.uri, editor.selection.active,
          [new vscode.Location(r.target, new vscode.Range(r.anchor.context.startLine - 1, 0, r.anchor.context.endLine - 1, 0))], "peek"); return;
      }
      if (p.kind === "auto") { await apply(state, [r], { focus: true }); return; }
      let slot = slots().find(s => s.anchor === p.of);
      const pref = { kind: p.kind, slot: slot.slot };
      if (p.kind !== "replace") {
        const [next, destination] = splitShape(shape, slot.slot, p.kind);
        // Insert the new group at the split location before applying sizes.
        // Merely growing the layout appends a leaf and would replace an existing
        // editor when splitting the top row of a stack.
        await opener.reshape(async () => {
          await opener.open(slot.record, slot.column, { focus: true });
          await vscode.commands.executeCommand(p.kind === "below" ? "workbench.action.newGroupBelow" : "workbench.action.newGroupRight");
          await setShape(next);
        });
        slot = slots().find(s => s.slot === destination);
      }
      const existing = opener.find(r);
      let placed;
      if (existing && existing.column !== slot.column) {
        const prior = slot.group.activeTab;
        placed = await opener.move(r, slot.column);
        if (prior && prior !== placed?.tab && opener.disposable(prior)) await vscode.window.tabGroups.close(prior, true);
      } else placed = await put(r, slot, true);
      if (!placed) throw invalid("That editor is protected. Choose another placement.");
      customized = true; sequence = false;
      if (body.remember) prefs.set(r.anchor.role, { ...pref, kind: "replace", slot: slot.slot });
    });
  }
  function preview(n, option) {
    if (["auto", "peek"].includes(option.kind)) return [];
    const target = slots().find(s => s.anchor === option.of);
    let nextShape = shape, destination = target?.slot;
    if (!target || !SHAPES[shape]) return [];
    if (option.kind !== "replace") [nextShape, destination] = splitShape(shape, target.slot, option.kind);
    const values = new Map(slots().map(s => [s.slot, s.anchor === n ? null : s.anchor]));
    // Splitting renames the old target leaf to its first half.
    if (option.kind !== "replace") {
      const oldSlots = SHAPES[shape].slots, newSlots = SHAPES[nextShape].slots;
      const remaining = newSlots.filter(name => name !== destination);
      oldSlots.forEach((name, index) => values.set(remaining[index], slots()[index]?.anchor === n ? null : slots()[index]?.anchor));
    }
    values.set(destination, n);
    let index = 0;
    const walk = (node, orientation, x, y, w, h) => {
      if (!node.groups) return [{ x, y, w, h, anchor: values.get(SHAPES[nextShape].slots[index++]) }];
      const direction = node.orientation ?? orientation, total = node.groups.reduce((v, g) => v + (g.size || 1), 0); let offset = 0;
      return node.groups.flatMap(g => { const ratio = (g.size || 1) / total;
        const cells = walk(g, 1 - direction, x + (direction === 0 ? offset * w : 0), y + (direction === 1 ? offset * h : 0), direction === 0 ? w * ratio : w, direction === 1 ? h * ratio : h); offset += ratio; return cells;
      });
    };
    return walk(SHAPES[nextShape].layout, 0, 0, 0, 1, 1);
  }
  function snapshot() {
    return { shape: shape || "custom", cap: cap(), customized, sequence, sequenceOverride: override, unplaced: [...unplaced],
      slots: slots().map(({ slot, column, anchor, pinned }) => ({ slot, column, anchor, pinned })),
      options: Object.fromEntries(records.map(r => [r.anchor.n, options(r.anchor.n).map(option => ({ ...option, preview: preview(r.anchor.n, option) }))])),
      preferences: Object.fromEntries(prefs) };
  }
  function clear() { for (const tab of pinnedTabs) opener.keep(tab); records = []; pins.clear(); pinnedTabs.clear(); prefs.clear(); activity.clear(); tourId = stopId = expected = undefined; tabs = []; customized = sequence = override = false; shape = "single"; unplaced = []; }
  return { begin, apply, action, observe, transaction, companion, snapshot, clear,
    isPinnedTab: tab => pinnedTabs.has(tab), visible };
}
module.exports = { createLayoutEngine };
