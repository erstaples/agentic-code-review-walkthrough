import { createLayoutEditors } from "./layout-editors.js";
import { createLayoutPersistence } from "./layout-persistence.js";
import {
  choosePlacementSlot,
  identifyShape,
  placementPreview,
  type LayoutSlot,
} from "./layout-placement.js";
import type { Tab, TabGroup, Uri } from "vscode";
import type { LayoutApi } from "./native.js";
import { tabInput } from "./native.js";
import type { AnchorOpener } from "./anchor-opener.js";
import type { TourState, AnchorRecord } from "./state.js";
import type { LayoutSnapshot } from "../shared/snapshot.js";
import type {
  EditorLayout,
  ShapeName,
  SavedStopLayout,
  LayoutOrientationSetting,
  PlacementChoice,
  PreviewCell,
} from "../shared/layout.js";
import { isRecord } from "./requests.js";
interface TabState {
  tab: Tab;
  group: TabGroup;
  column: number;
  active: boolean;
}
import {
  SHAPES,
  shapeFor,
  splitShape,
  geometry,
  cramped,
} from "./layout-model.js";
import { createLayoutState, stopIdentity } from "./layout-state.js";
const uriKey = (uri: Uri | undefined) => uri?.toString();
const invalid = (message: string) =>
  Object.assign(new Error(message), { code: "bad_request" });

function createLayoutEngine(
  vscode: LayoutApi,
  opener: AnchorOpener,
  storage = createLayoutState(),
) {
  let records: AnchorRecord[] = [];
  let shape: ShapeName | null = "single";
  let customized = false;
  const pins = new Set<string>();
  const pinnedTabs = new Set<Tab>();
  const savedLayouts = createLayoutPersistence(storage);
  let tourId: string | undefined;
  let stopId: string | undefined;
  let expectedGeometry: string | undefined;
  let observedTabs: TabState[] = [];
  // Ignore observations until the outermost editor operation finishes.
  let transactionDepth = 0;
  let sequenceMode = false;
  let sequenceOverride = false;
  let unplaced: number[] = [];
  let activityClock = 0;
  const activity = new Map<Tab, number>();
  let state: TourState | undefined;
  let actualLayout: EditorLayout | undefined;
  // Keep the restored arrangement for the first automatic presentation.
  let restoredLayoutPending = false;
  let persistenceSuspended = false;
  let restoreDeferred = false;
  const editors = createLayoutEditors(vscode, opener);
  const { groups, tabState } = editors;
  const config = () => vscode.workspace.getConfiguration("kanko.layout");
  const maxGroups = () =>
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
  const anchorUriKey = (record: AnchorRecord) => record.target.toString();
  function slots(): LayoutSlot[] {
    return groups().map((group, i) => {
      const record = recordForTab(group.activeTab);
      return {
        slot:
          (shape ? SHAPES[shape].slots[i] : undefined) ||
          `group${group.viewColumn}`,
        column: group.viewColumn,
        anchor: record?.anchor.n,
        pinned:
          Boolean(record && pins.has(anchorUriKey(record))) ||
          Boolean(group.activeTab?.isPinned) ||
          (!!group.activeTab && pinnedTabs.has(group.activeTab)),
        lastActive: (group.activeTab ? activity.get(group.activeTab) : 0) || 0,
        group: group,
        record: record,
      };
    });
  }
  async function capture() {
    const layout = await editors.readLayout();
    actualLayout = layout;
    expectedGeometry = geometry(layout);
    shape = identifyShape(layout);
    observedTabs = tabState();
  }
  async function observe() {
    if (transactionDepth || !tourId || persistenceSuspended) return;
    const layout = await editors.readLayout();
    const actual = geometry(layout);
    shape = identifyShape(layout);
    if (transactionDepth) return;
    const now = tabState();
    if (
      expectedGeometry &&
      (actual !== expectedGeometry ||
        observedTabs.length !== now.length ||
        observedTabs.some(
          (tab, i) =>
            tab.tab !== now[i]?.tab ||
            tab.column !== now[i]?.column ||
            tab.active !== now[i]?.active,
        ))
    )
      customized = true;
    expectedGeometry = actual;
    actualLayout = layout;
    observedTabs = now;
    // Closed anchors lose their pins; moved tabs are resolved from live groups.
    for (const record of records)
      if (!opener.find(record)) pins.delete(anchorUriKey(record));
    for (const tab of pinnedTabs)
      if (!now.some((entry) => entry.tab === tab)) pinnedTabs.delete(tab);
    await save();
  }
  async function transaction<T>(action: () => PromiseLike<T>) {
    transactionDepth++;
    try {
      return await action();
    } finally {
      try {
        await capture();
        if (transactionDepth === 1) await save();
      } finally {
        transactionDepth--;
      }
    }
  }
  async function setShape(name: ShapeName) {
    await editors.setShape(name);
    shape = name;
  }
  function canReplaceSlot(slot: LayoutSlot, reserved = new Set<number>()) {
    if (slot.pinned || reserved.has(slot.column)) return false;
    // Opening a preview must not close a reviewer-owned preview, even an inactive one.
    return (
      slot.group.tabs.every(
        (tab) => !tab.isPreview || opener.disposable(tab),
      ) &&
      (!slot.group.activeTab || opener.disposable(slot.group.activeTab))
    );
  }
  function chooseSlot(record: AnchorRecord, reserved: Set<number>) {
    const currentSlots = slots();
    return choosePlacementSlot(
      record,
      currentSlots,
      currentSlots.filter((slot) => canReplaceSlot(slot, reserved)),
      shape,
      savedLayouts.preference(record.anchor.role),
    );
  }
  async function openInSlot(
    record: AnchorRecord,
    slot: LayoutSlot | undefined,
    focus: boolean,
  ) {
    const entry = await editors.openInSlot(record, slot, focus);
    if (entry) activity.set(entry.tab, ++activityClock);
    return entry;
  }
  const uniqueSources = (wanted: AnchorRecord[]) =>
    wanted.filter(
      (record, i) =>
        wanted.findIndex(
          (other) => anchorUriKey(other) === anchorUriKey(record),
        ) === i,
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
    if (!state || persistenceSuspended || restoreDeferred || !actualLayout)
      return;
    await savedLayouts.save(state, {
      layout: structuredClone(actualLayout),
      customized,
      sequence: sequenceMode,
      override: sequenceOverride,
      slots: slots().map((slot) => ({
        anchor: slot.anchor ?? null,
        pinned: Boolean(slot.anchor && slot.pinned),
        lastActive: slot.lastActive,
      })),
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
    sequenceMode = saved.sequence;
    sequenceOverride = saved.override;
    for (const [i, entry] of saved.slots.entries()) {
      const record = records.find((record) => record.anchor.n === entry.anchor);
      if (!record) continue;
      const existing = opener.find(record);
      const slot =
        slots().find((slot) => slot.column === existing?.column) || slots()[i];
      if (
        !slot ||
        (slot.group.activeTab !== existing?.tab && !canReplaceSlot(slot))
      )
        continue;
      const opened = await openInSlot(record, slot, false);
      if (!opened) continue;
      activity.set(opened.tab, entry.lastActive);
      activityClock = Math.max(activityClock, entry.lastActive);
      if (entry.pinned) {
        pins.add(anchorUriKey(record));
        pinnedTabs.add(opened.tab);
      }
    }
    restoredLayoutPending = true;
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
    const resume = persistenceSuspended && nextState.mode !== "paused";
    if (changedStop) {
      restoreDeferred = nextState.mode !== "following";
      for (const tab of pinnedTabs) opener.keep(tab);
      pins.clear();
      pinnedTabs.clear();
      activity.clear();
      activityClock = 0;
      sequenceMode = false;
      sequenceOverride = false;
      unplaced = [];
      restoredLayoutPending = false;
      if (newTour) {
        savedLayouts.load(nextState);
      }
      customized =
        groups().some((group) =>
          group.tabs.some((tab) => !opener.disposable(tab)),
        ) || groups().length > maxGroups();
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
    if (!expectedGeometry) await capture();
    if (
      (changedStop || resume || restoreDeferred) &&
      state.mode === "following"
    ) {
      persistenceSuspended = restoreDeferred = false;
      const saved = savedLayouts.readCompatibleStop(
        state,
        nextStop,
        maxGroups(),
      );
      if (saved) await transaction(() => restore(saved));
    }
  }
  async function apply(
    state: TourState,
    wanted: AnchorRecord[],
    { focus = false } = {},
  ) {
    if (state.mode !== "following" && !focus) return;
    await observe();
    if (restoredLayoutPending && !focus) {
      restoredLayoutPending = false;
      unplaced = uniqueSources(wanted)
        .filter((record) => !visible(record))
        .map((record) => record.anchor.n);
      return;
    }
    restoredLayoutPending = false;
    return transaction(async () => {
      const all = uniqueSources(wanted);
      const requested = sequenceMode
        ? all.slice(0, 1)
        : all.slice(0, maxGroups());
      unplaced = all
        .slice(requested.length)
        .filter((record) => !visible(record))
        .map((record) => record.anchor.n);
      const missing = requested.filter((record) => !visible(record));
      if (missing.length && safeToReshape() && !sequenceMode) {
        const empty = slots().filter((slot) => !slot.group.activeTab).length;
        const required = Math.min(
          maxGroups(),
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
          if (open.activeTab) activity.set(open.activeTab, ++activityClock);
          if (focus && record === requested[0])
            await opener.open(record, open.viewColumn, { focus: true });
          continue;
        }
        const existing = opener.find(record);
        let slot = existing
          ? slots().find(
              (slot) =>
                slot.column === existing.column &&
                canReplaceSlot(slot, reserved),
            )
          : null;
        if (!existing) slot = chooseSlot(record, reserved);
        if (!slot) {
          unplaced.push(record.anchor.n);
          continue;
        }
        const entry = await openInSlot(
          record,
          slot,
          focus || record === requested[0],
        );
        if (entry) reserved.add(entry.column);
        else unplaced.push(record.anchor.n);
      }
      // Collapse only untouched tour layouts; short files do not indicate crowding.
      if (
        config().get("sequenceFallback", true) &&
        !sequenceMode &&
        !sequenceOverride &&
        groups().length > 1 &&
        safeToCollapse() &&
        vscode.window.visibleTextEditors.some(cramped)
      ) {
        const before = geometry(await editors.readLayout());
        await new Promise((resolve) => setTimeout(resolve, 100));
        if (before !== geometry(await editors.readLayout())) customized = true;
      }
      if (
        config().get("sequenceFallback", true) &&
        !sequenceMode &&
        !sequenceOverride &&
        groups().length > 1 &&
        safeToCollapse() &&
        vscode.window.visibleTextEditors.some(cramped)
      ) {
        sequenceMode = true;
        const first = requested[0];
        const retained = first && opener.find(first)?.tab;
        await opener.closeExcept((tab) => tab === retained);
        await setShape("single");
        if (first) await openInSlot(first, slots()[0], true);
        unplaced = all
          .filter((record) => !visible(record))
          .map((record) => record.anchor.n);
      }
    });
  }
  async function companion(record: AnchorRecord, reserved: Set<number>) {
    if (sequenceMode) return null;
    const found = opener.find(record, true);
    if (found && !reserved.has(found.column))
      return opener.open(record, found.column, { companion: true });
    let slot = slots().find(
      (slot) => canReplaceSlot(slot, reserved) && !slot.record,
    );
    if (!slot && groups().length < maxGroups() && safeToReshape()) {
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
  function options(anchorNumber: number): PlacementChoice[] {
    const record = records.find((record) => record.anchor.n === anchorNumber);
    if (!record) return [];
    const result: PlacementChoice[] = [{ kind: "auto" }, { kind: "peek" }];
    const origin = slots().find(
      (slot) => slot.column === opener.find(record)?.column,
    );
    if (origin?.pinned || pins.has(anchorUriKey(record))) return result;
    for (const slot of slots())
      if (slot.anchor && slot.column !== origin?.column && !slot.pinned) {
        // Replacement may cover a kept tab, but must preserve pins and reviewer previews.
        if (
          slot.group.tabs.every(
            (tab) => !tab.isPreview || opener.disposable(tab),
          )
        )
          result.push({ kind: "replace", of: slot.anchor });
        if (shape && groups().length < maxGroups())
          for (const kind of ["below", "beside"] as const) {
            const next = splitShape(shape, slot.slot, kind);
            if (next && SHAPES[next[0]].slots.length <= maxGroups())
              result.push({ kind, of: slot.anchor });
          }
      }
    return result;
  }
  async function resetLayout(state: TourState) {
    // Reset closes only disposable tour previews.
    pins.clear();
    pinnedTabs.clear();
    sequenceMode = false;
    sequenceOverride = false;
    restoredLayoutPending = false;
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
  }
  function setAnchorPinned(record: AnchorRecord, pinned: unknown) {
    if (typeof pinned !== "boolean" || !visible(record))
      throw invalid("Only a visible anchor can be pinned.");
    const tab = visible(record)?.activeTab;
    if (pinned) {
      pins.add(anchorUriKey(record));
      if (tab) pinnedTabs.add(tab);
    } else {
      pins.delete(anchorUriKey(record));
      if (tab) pinnedTabs.delete(tab);
    }
  }
  async function action(body: Record<string, unknown>, state: TourState) {
    await observe();
    return transaction(async () => {
      if (body.action === "overrideSequence") {
        sequenceMode = false;
        sequenceOverride = true;
        return;
      }
      if (body.action === "reset") {
        await resetLayout(state);
        return;
      }
      const record = records.find((record) => record.anchor.n === body.anchor);
      if (!record) throw invalid("Choose an anchor from the current stop.");
      if (body.action === "pin") {
        setAnchorPinned(record, body.pinned);
        return;
      }
      if (body.action !== "place") throw invalid("Unknown layout action.");
      const input = body.placement;
      const placement = isRecord(input)
        ? options(record.anchor.n).find(
            (option) =>
              option.kind === input.kind &&
              ("of" in option ? option.of : undefined) === input.of,
          )
        : undefined;
      if (!placement) throw invalid("That placement is no longer available.");
      if (body.remember !== undefined && typeof body.remember !== "boolean")
        throw invalid("Remember must be true or false.");
      if (placement.kind === "peek") {
        await editors.peek(record);
        return;
      }
      if (placement.kind === "auto") {
        await apply(state, [record], { focus: true });
        return;
      }
      let slot = slots().find((slot) => slot.anchor === placement.of);
      if (!slot) throw invalid("That placement is no longer available.");
      const preference = { kind: placement.kind, slot: slot.slot };
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
        await editors.closeReplacedPreview(prior, placed?.tab);
      } else placed = await openInSlot(record, slot, true);
      if (!placed)
        throw invalid("That editor is protected. Choose another placement.");
      await capture();
      const destination = slots().find((slot) => slot.column === placed.column);
      customized = true;
      sequenceMode = false;
      if (body.remember)
        savedLayouts.remember(record.anchor.role, {
          ...preference,
          kind: "replace",
          slot: destination?.slot || slot.slot,
        });
    });
  }
  function preview(
    anchorNumber: number,
    option: PlacementChoice,
  ): PreviewCell[] {
    if (option.kind === "auto" || option.kind === "peek") return [];
    const moving = records.find((record) => record.anchor.n === anchorNumber);
    const originColumn = moving ? opener.find(moving)?.column : undefined;
    const closeEmptyGroups = vscode.workspace
      .getConfiguration("workbench.editor")
      .get("closeEmptyGroups", true);
    return placementPreview(
      anchorNumber,
      option,
      shape,
      slots(),
      originColumn,
      closeEmptyGroups,
    );
  }
  function snapshot(): LayoutSnapshot {
    return {
      shape: shape || "custom",
      cap: maxGroups(),
      customized,
      sequence: sequenceMode,
      sequenceOverride,
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
      preferences: savedLayouts.preferences(),
    };
  }
  async function suspend() {
    await observe();
    await save();
    persistenceSuspended = true;
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
    savedLayouts.clear();
    activity.clear();
    tourId = undefined;
    stopId = undefined;
    expectedGeometry = undefined;
    observedTabs = [];
    customized = false;
    sequenceMode = false;
    sequenceOverride = false;
    shape = "single";
    unplaced = [];
    state = undefined;
    actualLayout = undefined;
    restoredLayoutPending = false;
    persistenceSuspended = false;
    restoreDeferred = false;
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
