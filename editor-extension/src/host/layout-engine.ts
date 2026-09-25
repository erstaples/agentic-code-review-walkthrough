import type { Tab, TabGroup, Uri } from "vscode";
import type { LayoutApi } from "./native.js";
import { tabInput } from "./native.js";
import type { AnchorOpener } from "./anchor-opener.js";
import type { TourState, AnchorRecord } from "./state.js";
import type { AnchorRole } from "../shared/tour.js";
import type { LayoutSnapshot } from "../shared/snapshot.js";
import type {
  EditorLayout,
  EditorGroupLayout,
  ShapeName,
  SlotLabel,
  RolePreference,
  SavedStopLayout,
  LayoutOrientationSetting,
  PlacementChoice,
  PreviewCell,
} from "../shared/layout.js";
import { isRecord } from "./requests.js";
interface Slot {
  slot: SlotLabel;
  column: number;
  anchor?: number;
  pinned: boolean;
  lastActive: number;
  group: TabGroup;
  record?: AnchorRecord;
}
interface TabState {
  tab: Tab;
  group: TabGroup;
  column: number;
  active: boolean;
}
interface PreviewNode {
  size?: number;
  orientation?: number;
  groups?: PreviewNode[];
  anchor?: number | null;
}
import {
  SHAPES,
  shapeFor,
  splitShape,
  geometry,
  cramped,
} from "./layout-model.js";
import { createLayoutState, stopIdentity, compatible } from "./layout-state.js";
const uriKey = (uri: Uri | undefined) => uri?.toString();
const invalid = (message: string) =>
  Object.assign(new Error(message), { code: "bad_request" });

function createLayoutEngine(
  vscode: LayoutApi,
  opener: AnchorOpener,
  storage = createLayoutState(),
) {
  let records: AnchorRecord[] = [],
    shape: ShapeName | null = "single",
    customized = false;
  const pins = new Set<string>(),
    pinnedTabs = new Set<Tab>();
  let prefs = new Map<string, RolePreference>();
  let tourId: string | undefined,
    stopId: string | undefined,
    expected: string | undefined;
  let tabs: TabState[] = [],
    internal = 0,
    sequence = false,
    override = false,
    unplaced: number[] = [];
  let clock = 0;
  const activity = new Map<Tab, number>();
  let state: TourState | undefined,
    layouts: Record<string, unknown> = {},
    actualLayout: EditorLayout | undefined;
  let restored = false,
    suspended = false,
    deferred = false;
  // Sort by visual position; VS Code may retain creation order after a split.
  const groups = () =>
    [...vscode.window.tabGroups.all].sort(
      (a, b) => a.viewColumn - b.viewColumn,
    );
  const config = () => vscode.workspace.getConfiguration("kanko.layout");
  const cap = () =>
    Math.max(
      2,
      Math.min(4, Math.floor(Number(config().get("maxGroups", 3)) || 3)),
    );
  const recordForTab = (tab: Tab | undefined) =>
    records.find(
      (record) =>
        (uriKey(tabInput(tab).uri) === uriKey(record.target) &&
          tabInput(tab).uri) ||
        (tabInput(tab).modified &&
          uriKey(tabInput(tab).modified) === uriKey(record.target) &&
          uriKey(tabInput(tab).original) === uriKey(record.base)),
    );
  const visible = (record: AnchorRecord) =>
    groups().find(
      (group) =>
        recordForTab(group.activeTab)?.target.toString() ===
        record.target.toString(),
    );
  const token = (record: AnchorRecord) => record.target.toString();
  function slots(): Slot[] {
    return groups().map((group, i) => {
      const record = recordForTab(group.activeTab);
      return {
        slot:
          (shape ? SHAPES[shape].slots[i] : undefined) ||
          `group${group.viewColumn}`,
        column: group.viewColumn,
        anchor: record?.anchor.n,
        pinned:
          Boolean(record && pins.has(token(record))) ||
          Boolean(group.activeTab?.isPinned) ||
          (!!group.activeTab && pinnedTabs.has(group.activeTab)),
        lastActive: (group.activeTab ? activity.get(group.activeTab) : 0) || 0,
        group: group,
        record: record,
      };
    });
  }
  const tabState = () =>
    groups().flatMap((group) =>
      group.tabs.map((tab) => ({
        tab,
        group: group,
        column: group.viewColumn,
        active: group.activeTab === tab,
      })),
    );
  function identifyShape(layout: EditorLayout) {
    const topology = (node: EditorGroupLayout): object =>
      node.groups
        ? { orientation: node.orientation, groups: node.groups.map(topology) }
        : {};
    const structure = JSON.stringify(topology(layout));
    return (
      (Object.keys(SHAPES) as ShapeName[]).find(
        (name) => JSON.stringify(topology(SHAPES[name].layout)) === structure,
      ) || null
    );
  }
  async function capture() {
    const layout = await vscode.commands.executeCommand<EditorLayout>(
      "vscode.getEditorLayout",
    );
    actualLayout = layout;
    expected = geometry(layout);
    shape = identifyShape(layout);
    tabs = tabState();
  }
  async function observe() {
    if (internal || !tourId || suspended) return;
    const layout = await vscode.commands.executeCommand<EditorLayout>(
      "vscode.getEditorLayout",
    );
    const actual = geometry(layout);
    shape = identifyShape(layout);
    if (internal) return;
    const now = tabState();
    if (
      expected &&
      (actual !== expected ||
        tabs.length !== now.length ||
        tabs.some(
          (tab, i) =>
            tab.tab !== now[i]?.tab ||
            tab.column !== now[i]?.column ||
            tab.active !== now[i]?.active,
        ))
    )
      customized = true;
    expected = actual;
    actualLayout = layout;
    tabs = now;
    // Closed anchors lose their pins; moved tabs are resolved from live groups.
    for (const record of records)
      if (!opener.find(record)) pins.delete(token(record));
    for (const tab of pinnedTabs)
      if (!now.some((entry) => entry.tab === tab)) pinnedTabs.delete(tab);
    await save();
  }
  async function transaction<T>(action: () => PromiseLike<T>) {
    internal++;
    try {
      return await action();
    } finally {
      try {
        await capture();
        if (internal === 1) await save();
      } finally {
        internal--;
      }
    }
  }
  async function setShape(name: ShapeName) {
    await opener.reshape(() =>
      vscode.commands.executeCommand(
        "vscode.setEditorLayout",
        structuredClone(SHAPES[name].layout),
      ),
    );
    shape = name;
  }
  function eligible(slot: Slot, reserved = new Set<number>()) {
    if (slot.pinned || reserved.has(slot.column)) return false;
    // Opening a preview must not close a reviewer-owned preview, even an inactive one.
    return (
      slot.group.tabs.every(
        (tab) => !tab.isPreview || opener.disposable(tab),
      ) &&
      (!slot.group.activeTab || opener.disposable(slot.group.activeTab))
    );
  }
  function preferred(role: AnchorRole, reserved: Set<number>) {
    const pref = prefs.get(role);
    if (!pref || pref.kind !== "replace") return null;
    return slots().find(
      (slot) => slot.slot === pref.slot && eligible(slot, reserved),
    );
  }
  function choose(record: AnchorRecord, reserved: Set<number>) {
    const currentSlots = slots(),
      available = currentSlots.filter((slot) => eligible(slot, reserved));
    // Only the grid can place repeated colors diagonally.
    const collisions = (slot: Slot) =>
      shape !== "grid"
        ? 0
        : currentSlots.filter(
            (other) =>
              other.record &&
              other.column !== slot.column &&
              other.column + slot.column !== 5 &&
              (other.record.anchor.n - 1) % 6 === (record.anchor.n - 1) % 6,
          ).length;
    return (
      available
        .filter((slot) => !slot.group.activeTab)
        .sort(
          (a, b) => collisions(a) - collisions(b) || a.column - b.column,
        )[0] ||
      preferred(record.anchor.role, reserved) ||
      available.sort(
        (a, b) =>
          a.lastActive - b.lastActive ||
          collisions(a) - collisions(b) ||
          a.column - b.column,
      )[0]
    );
  }
  async function put(
    record: AnchorRecord,
    slot: Slot | undefined,
    focus: boolean,
  ) {
    const prior = slot?.group.activeTab;
    const entry = await opener.open(record, slot?.column, { focus });
    if (!entry) return null;
    // Reusing a hidden tab must still retire the preview it replaces.
    if (
      prior &&
      prior !== entry.tab &&
      entry.column === slot?.column &&
      opener.disposable(prior)
    )
      await vscode.window.tabGroups.close(prior, true);
    activity.set(entry.tab, ++clock);
    return entry;
  }
  const unique = (wanted: AnchorRecord[]) =>
    wanted.filter(
      (record, i) =>
        wanted.findIndex((other) => token(other) === token(record)) === i,
    );
  function safeToReshape() {
    return !customized && pins.size === 0;
  }
  function safeToCollapse() {
    return (
      !customized &&
      pins.size === 0 &&
      groups().every((group) =>
        group.tabs.every((tab) => opener.disposable(tab)),
      )
    );
  }
  async function save() {
    if (!state || suspended || deferred || !actualLayout) return;
    const stop = state.plan.stops[state.stopIndex];
    layouts[stop.id] = {
      identity: stopIdentity(state, stop),
      layout: structuredClone(actualLayout),
      customized,
      sequence,
      override,
      slots: slots().map((slot) => ({
        anchor: slot.anchor ?? null,
        pinned: Boolean(slot.anchor && slot.pinned),
        lastActive: slot.lastActive,
      })),
    };
    await storage.write(state, {
      layouts,
      preferences: Object.fromEntries(prefs),
    });
  }
  async function restore(saved: SavedStopLayout) {
    // Restore around reviewer tabs without moving or replacing them.
    const protectedWork = groups().some((group) =>
      group.tabs.some((tab) => !opener.disposable(tab)),
    );
    if (!protectedWork) {
      await opener.closeExcept(() => false);
      await opener.reshape(() =>
        vscode.commands.executeCommand(
          "vscode.setEditorLayout",
          structuredClone(saved.layout),
        ),
      );
      await capture();
    }
    customized = saved.customized || protectedWork;
    sequence = saved.sequence;
    override = saved.override;
    for (const [i, entry] of saved.slots.entries()) {
      const record = records.find((record) => record.anchor.n === entry.anchor);
      if (!record) continue;
      const existing = opener.find(record);
      const slot =
        slots().find((slot) => slot.column === existing?.column) || slots()[i];
      if (!slot || (slot.group.activeTab !== existing?.tab && !eligible(slot)))
        continue;
      const opened = await put(record, slot, false);
      if (!opened) continue;
      activity.set(opened.tab, entry.lastActive);
      clock = Math.max(clock, entry.lastActive);
      if (entry.pinned) {
        pins.add(token(record));
        pinnedTabs.add(opened.tab);
      }
    }
    restored = true;
  }
  async function begin(nextState: TourState, nextRecords: AnchorRecord[]) {
    await observe();
    const nextStop = nextState.plan.stops[nextState.stopIndex];
    const newTour =
      !state ||
      state.tourId !== nextState.tourId ||
      state.workspace !== nextState.workspace ||
      state.identity !== nextState.identity;
    const changedStop =
      newTour ||
      stopId !== nextStop.id ||
      (state && stopIdentity(state, state.plan.stops[state.stopIndex])) !==
        stopIdentity(nextState, nextStop);
    const resume = suspended && nextState.mode !== "paused";
    if (changedStop) {
      deferred = nextState.mode !== "following";
      for (const tab of pinnedTabs) opener.keep(tab);
      pins.clear();
      pinnedTabs.clear();
      activity.clear();
      clock = 0;
      sequence = false;
      override = false;
      unplaced = [];
      restored = false;
      if (newTour) {
        const stored = storage.read(nextState);
        layouts = stored.layouts;
        prefs = new Map(Object.entries(stored.preferences));
      }
      customized =
        groups().some((group) =>
          group.tabs.some((tab) => !opener.disposable(tab)),
        ) || groups().length > cap();
    }
    state = nextState;
    tourId = state.tourId;
    stopId = nextStop.id;
    const priority = [
      state.selectedAnchor,
      ...(nextStop.beats?.[state.beatIndex]?.active || []),
    ];
    records = [...nextRecords].sort((a, b) => {
      const rank = (record: AnchorRecord) =>
        priority.includes(record.anchor.n)
          ? priority.indexOf(record.anchor.n)
          : priority.length;
      return rank(a) - rank(b);
    });
    if (!expected) await capture();
    if ((changedStop || resume || deferred) && state.mode === "following") {
      suspended = deferred = false;
      const saved = layouts[stopId];
      if (compatible(saved, state, nextStop, cap()))
        await transaction(() => restore(saved));
      else delete layouts[stopId];
    }
  }
  async function apply(
    state: TourState,
    wanted: AnchorRecord[],
    { focus = false } = {},
  ) {
    if (state.mode !== "following" && !focus) return;
    await observe();
    if (restored && !focus) {
      restored = false;
      unplaced = unique(wanted)
        .filter((record) => !visible(record))
        .map((record) => record.anchor.n);
      return;
    }
    restored = false;
    return transaction(async () => {
      const all = unique(wanted),
        requested = sequence ? all.slice(0, 1) : all.slice(0, cap());
      unplaced = all
        .slice(requested.length)
        .filter((record) => !visible(record))
        .map((record) => record.anchor.n);
      const missing = requested.filter((record) => !visible(record));
      if (missing.length && safeToReshape() && !sequence) {
        const empty = slots().filter((slot) => !slot.group.activeTab).length;
        const required = Math.min(
          cap(),
          groups().length + Math.max(0, missing.length - empty),
        );
        if (required > groups().length) {
          const sideBySide =
            [
              ...requested,
              ...slots().flatMap((slot) => (slot.record ? [slot.record] : [])),
            ].some((record) => record.anchor.view === "diff") &&
            vscode.workspace
              .getConfiguration("diffEditor")
              .get("renderSideBySide", true);
          await setShape(
            shapeFor(
              required,
              config().get<LayoutOrientationSetting>("orientation", "auto"),
              sideBySide,
            ),
          );
        }
      }
      const reserved = new Set(
        requested.flatMap((record) => {
          const column = visible(record)?.viewColumn;
          return column ? [column] : [];
        }),
      );
      for (const record of requested) {
        const open = visible(record);
        if (open) {
          if (open.activeTab) activity.set(open.activeTab, ++clock);
          if (focus && record === requested[0])
            await opener.open(record, open.viewColumn, { focus: true });
          continue;
        }
        const existing = opener.find(record);
        let slot = existing
          ? slots().find(
              (slot) =>
                slot.column === existing.column && eligible(slot, reserved),
            )
          : null;
        if (!existing) slot = choose(record, reserved);
        if (!slot) {
          unplaced.push(record.anchor.n);
          continue;
        }
        const entry = await put(record, slot, focus || record === requested[0]);
        if (entry) reserved.add(entry.column);
        else unplaced.push(record.anchor.n);
      }
      // Collapse only untouched tour layouts; short files do not indicate crowding.
      if (
        config().get("sequenceFallback", true) &&
        !sequence &&
        !override &&
        groups().length > 1 &&
        safeToCollapse() &&
        vscode.window.visibleTextEditors.some(cramped)
      ) {
        const before = geometry(
          await vscode.commands.executeCommand<EditorLayout>(
            "vscode.getEditorLayout",
          ),
        );
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (
          before !==
          geometry(
            await vscode.commands.executeCommand<EditorLayout>(
              "vscode.getEditorLayout",
            ),
          )
        )
          customized = true;
      }
      if (
        config().get("sequenceFallback", true) &&
        !sequence &&
        !override &&
        groups().length > 1 &&
        safeToCollapse() &&
        vscode.window.visibleTextEditors.some(cramped)
      ) {
        sequence = true;
        const first = requested[0];
        const retained = first && opener.find(first)?.tab;
        await opener.closeExcept((tab) => tab === retained);
        await setShape("single");
        if (first) await put(first, slots()[0], true);
        unplaced = all
          .filter((record) => !visible(record))
          .map((record) => record.anchor.n);
      }
    });
  }
  async function companion(record: AnchorRecord, reserved: Set<number>) {
    if (sequence) return null;
    const found = opener.find(record, true);
    if (found && !reserved.has(found.column))
      return opener.open(record, found.column, { companion: true });
    let slot = slots().find((slot) => eligible(slot, reserved) && !slot.record);
    if (!slot && groups().length < cap() && safeToReshape()) {
      const name = shapeFor(
        groups().length + 1,
        config().get<LayoutOrientationSetting>("orientation", "auto"),
        vscode.workspace
          .getConfiguration("diffEditor")
          .get("renderSideBySide", true),
      );
      await setShape(name);
      slot = slots().find(
        (slot) => !slot.group.activeTab && !reserved.has(slot.column),
      );
    }
    return slot ? opener.open(record, slot.column, { companion: true }) : null;
  }
  function options(n: number): PlacementChoice[] {
    const record = records.find((record) => record.anchor.n === n);
    if (!record) return [];
    const result: PlacementChoice[] = [{ kind: "auto" }, { kind: "peek" }];
    const origin = slots().find(
      (slot) => slot.column === opener.find(record)?.column,
    );
    if (origin?.pinned || pins.has(token(record))) return result;
    for (const slot of slots())
      if (slot.anchor && slot.column !== origin?.column && !slot.pinned) {
        // Replacement may cover a kept tab, but must preserve pins and reviewer previews.
        if (
          slot.group.tabs.every(
            (tab) => !tab.isPreview || opener.disposable(tab),
          )
        )
          result.push({ kind: "replace", of: slot.anchor });
        if (shape && groups().length < cap())
          for (const kind of ["below", "beside"] as const) {
            const next = splitShape(shape, slot.slot, kind);
            if (next && SHAPES[next[0]].slots.length <= cap())
              result.push({ kind, of: slot.anchor });
          }
      }
    return result;
  }
  async function action(body: Record<string, unknown>, state: TourState) {
    await observe();
    return transaction(async () => {
      if (body.action === "overrideSequence") {
        sequence = false;
        override = true;
        return;
      }
      if (body.action === "reset") {
        // Reset closes only disposable tour previews.
        pins.clear();
        pinnedTabs.clear();
        sequence = false;
        override = false;
        restored = false;
        const protectedTabs = groups().some((group) =>
          group.tabs.some((tab) => !opener.disposable(tab)),
        );
        if (!protectedTabs) {
          await opener.closeExcept(() => false);
          await setShape("single");
        }
        customized = protectedTabs;
        const beat = state.plan.stops[state.stopIndex].beats[state.beatIndex];
        await apply(
          state,
          beat.active.flatMap((n) =>
            records.filter((record) => record.anchor.n === n).slice(0, 1),
          ),
          { focus: true },
        );
        return;
      }
      const record = records.find((record) => record.anchor.n === body.anchor);
      if (!record) throw invalid("Choose an anchor from the current stop.");
      if (body.action === "pin") {
        if (typeof body.pinned !== "boolean" || !visible(record))
          throw invalid("Only a visible anchor can be pinned.");
        const tab = visible(record)?.activeTab;
        if (body.pinned) {
          pins.add(token(record));
          if (tab) pinnedTabs.add(tab);
        } else {
          pins.delete(token(record));
          if (tab) pinnedTabs.delete(tab);
        }
        return;
      }
      if (body.action !== "place") throw invalid("Unknown layout action.");
      const input = body.placement;
      const placement = isRecord(input)
        ? options(record.anchor.n).find(
            (o) =>
              o.kind === input.kind &&
              ("of" in o ? o.of : undefined) === input.of,
          )
        : undefined;
      if (!placement) throw invalid("That placement is no longer available.");
      if (body.remember !== undefined && typeof body.remember !== "boolean")
        throw invalid("Remember must be true or false.");
      if (placement.kind === "peek") {
        const editor = vscode.window.activeTextEditor;
        if (!editor) throw invalid("Focus an editor before peeking.");
        await vscode.commands.executeCommand(
          "editor.action.goToLocations",
          editor.document.uri,
          editor.selection.active,
          [
            new vscode.Location(
              record.target,
              new vscode.Range(
                record.anchor.context.startLine - 1,
                0,
                record.anchor.context.endLine - 1,
                0,
              ),
            ),
          ],
          "peek",
          undefined,
          true,
        );
        return;
      }
      if (placement.kind === "auto") {
        await apply(state, [record], { focus: true });
        return;
      }
      let slot = slots().find((slot) => slot.anchor === placement.of);
      if (!slot) throw invalid("That placement is no longer available.");
      const pref = { kind: placement.kind, slot: slot.slot };
      if (placement.kind !== "replace") {
        const split = shape && splitShape(shape, slot.slot, placement.kind);
        if (!split) throw invalid("That placement is no longer available.");
        const [next, destination] = split;
        const originalSlot = slot;
        if (!originalSlot.record)
          throw invalid("That placement is no longer available.");
        const splitRecord = originalSlot.record;
        // Insert at the split before resizing; appending a group would replace the wrong editor.
        await opener.reshape(async () => {
          await opener.open(splitRecord, originalSlot.column, {
            focus: true,
          });
          await vscode.commands.executeCommand(
            placement.kind === "below"
              ? "workbench.action.newGroupBelow"
              : "workbench.action.newGroupRight",
          );
          await setShape(next);
        });
        slot = slots().find((slot) => slot.slot === destination);
        if (!slot) throw invalid("The new editor group did not open.");
      }
      const existing = opener.find(record);
      let placed;
      if (existing && existing.column !== slot.column) {
        const prior = slot.group.activeTab;
        placed = await opener.move(record, slot.column);
        if (prior && prior !== placed?.tab && opener.disposable(prior))
          await vscode.window.tabGroups.close(prior, true);
      } else placed = await put(record, slot, true);
      if (!placed)
        throw invalid("That editor is protected. Choose another placement.");
      await capture();
      const destination = slots().find((slot) => slot.column === placed.column);
      customized = true;
      sequence = false;
      if (body.remember)
        prefs.set(record.anchor.role, {
          ...pref,
          kind: "replace",
          slot: destination?.slot || slot.slot,
        });
    });
  }
  function preview(n: number, option: PlacementChoice): PreviewCell[] {
    if (option.kind === "auto" || option.kind === "peek") return [];
    const target = slots().find((slot) => slot.anchor === option.of);
    let nextShape = shape,
      destination = target?.slot;
    if (!target || !shape) return [];
    nextShape = shape;
    if (option.kind !== "replace") {
      const split = splitShape(shape, target.slot, option.kind);
      if (!split) return [];
      [nextShape, destination] = split;
    }
    if (!destination) return [];
    const values = new Map(
      slots().map((slot) => [
        slot.slot,
        slot.anchor === n ? null : slot.anchor,
      ]),
    );
    // Splitting renames the old target leaf to its first half.
    if (option.kind !== "replace") {
      const oldSlots = SHAPES[shape].slots,
        newSlots = SHAPES[nextShape].slots;
      const remaining = newSlots.filter((name) => name !== destination);
      oldSlots.forEach((_name, index) =>
        values.set(
          remaining[index],
          slots()[index]?.anchor === n ? null : slots()[index]?.anchor,
        ),
      );
    }
    values.set(destination, n);
    const moving = records.find((record) => record.anchor.n === n),
      existing = moving && opener.find(moving);
    const originIndex = slots().findIndex(
      (slot) => slot.column === existing?.column,
    );
    const closeOrigin =
      originIndex >= 0 &&
      groups()[originIndex].tabs.length === 1 &&
      vscode.workspace
        .getConfiguration("workbench.editor")
        .get("closeEmptyGroups", true);
    const remaining = SHAPES[nextShape].slots.filter(
      (name) => option.kind === "replace" || name !== destination,
    );
    const removedSlot = closeOrigin ? remaining[originIndex] : undefined;
    let index = 0;
    // Remove the empty source group before sizing the placement diagram.
    const prepare = (
      node: EditorGroupLayout,
      orientation: number,
    ): PreviewNode | null => {
      if (!node.groups) {
        const slot = SHAPES[nextShape].slots[index++];
        return slot === removedSlot
          ? null
          : { ...node, anchor: values.get(slot) };
      }
      const direction = node.orientation ?? orientation;
      const children = node.groups.flatMap((group) => {
        const child = prepare(group, 1 - direction);
        return child ? [child] : [];
      });
      if (!children.length) return null;
      if (children.length === 1) return { ...children[0], size: node.size };
      return { ...node, orientation: direction, groups: children };
    };
    const walk = (
      node: PreviewNode,
      x: number,
      y: number,
      w: number,
      h: number,
    ): PreviewCell[] => {
      if (!node.groups) return [{ x, y, w, h, anchor: node.anchor }];
      const direction = node.orientation,
        total = node.groups.reduce((v, group) => v + (group.size || 1), 0);
      let offset = 0;
      return node.groups.flatMap((group) => {
        const ratio = (group.size || 1) / total;
        const cells = walk(
          group,
          x + (direction === 0 ? offset * w : 0),
          y + (direction === 1 ? offset * h : 0),
          direction === 0 ? w * ratio : w,
          direction === 1 ? h * ratio : h,
        );
        offset += ratio;
        return cells;
      });
    };
    const tree = prepare(SHAPES[nextShape].layout, 0);
    return tree ? walk(tree, 0, 0, 1, 1) : [];
  }
  function snapshot(): LayoutSnapshot {
    return {
      shape: shape || "custom",
      cap: cap(),
      customized,
      sequence,
      sequenceOverride: override,
      unplaced: [...unplaced],
      slots: slots().map(({ slot, column, anchor, pinned }) => ({
        slot,
        column,
        anchor,
        pinned,
      })),
      options: Object.fromEntries(
        records.map((record) => [
          record.anchor.n,
          options(record.anchor.n).map((option) => ({
            ...option,
            preview: preview(record.anchor.n, option),
          })),
        ]),
      ),
      preferences: Object.fromEntries(prefs),
    };
  }
  async function suspend() {
    await observe();
    await save();
    suspended = true;
    // A pin protects its tab at exit, including after the engine is cleared.
    for (const tab of pinnedTabs) opener.keep(tab);
    await opener.reshape(() =>
      opener.closeExcept((tab) => pinnedTabs.has(tab)),
    );
    if (groups().every((group) => group.tabs.length === 0))
      await setShape("single");
  }
  function clear() {
    for (const tab of pinnedTabs) opener.keep(tab);
    records = [];
    pins.clear();
    pinnedTabs.clear();
    prefs.clear();
    activity.clear();
    tourId = stopId = expected = undefined;
    tabs = [];
    customized = sequence = override = false;
    shape = "single";
    unplaced = [];
    state = undefined;
    layouts = {};
    actualLayout = undefined;
    restored = suspended = deferred = false;
  }
  return {
    begin,
    apply,
    action,
    observe,
    transaction,
    companion,
    snapshot,
    clear,
    suspend,
    save,
    isPinnedTab: (tab: Tab) => pinnedTabs.has(tab),
    visible,
  };
}
export { createLayoutEngine };
