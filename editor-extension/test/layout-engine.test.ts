import {
  anchor as makeAnchor,
  stop as makeStop,
  state as makeState,
  uri,
} from "./factories.js";
import { present, record } from "../../test/assertions.js";
import type { Uri } from "vscode";
import type { AnchorRecord } from "../src/host/state.js";
import type { AnchorOpener } from "../src/host/anchor-opener.js";
import type { LayoutApi } from "../src/host/native.js";
import type {
  EditorLayout,
  EditorGroupLayout,
  LayoutOrientationSetting,
} from "../src/shared/layout.js";
import type { ViewportEditor } from "../src/host/layout-model.js";
import {
  createLayoutState,
  type LayoutState,
} from "../src/host/layout-state.js";
type FakeTab = { owned?: boolean; isPreview: boolean; input: { uri: Uri } };
type FakeGroup = { viewColumn: number; tabs: FakeTab[]; activeTab?: FakeTab };
import test = require("node:test");
import assert = require("node:assert/strict");
import {
  SHAPES,
  geometry,
  cramped,
  shapeFor,
} from "../src/host/layout-model.js";
import { createLayoutEngine } from "../src/host/layout-engine.js";
function fixture({
  cap = 3,
  orientation = "stacked",
  diff = false,
  storage,
}: {
  cap?: number;
  orientation?: LayoutOrientationSetting;
  diff?: boolean;
  storage?: LayoutState;
} = {}) {
  let layout = structuredClone(SHAPES.single.layout),
    current = 1;
  const groups: FakeGroup[] = [{ viewColumn: 1, tabs: [] }];
  const calls: EditorLayout[] = [],
    opened: number[] = [],
    closed: FakeTab[] = [];
  const records: AnchorRecord[] = Array.from({ length: 8 }, (_, i) => ({
    anchor: makeAnchor({
      n: i + 1,
      role: i % 2 ? "evidence" : "change",
      view: diff ? "diff" : "head",
      context: { startLine: 1, endLine: 3 },
    }),
    base: uri(`base:${i + 1}`),
    head: uri(`head:${i + 1}`),
    target: uri(`head:${i + 1}`),
  }));
  const opener = {
    keep: (tab: FakeTab) => {
      tab.owned = false;
    },
    disposable: (tab: FakeTab | undefined) => !!tab?.owned,
    reshape: (action: () => Promise<void>) => action(),
    closeExcept: async (keep: (tab: FakeTab) => boolean) => {
      for (const g of groups) {
        g.tabs = g.tabs.filter(keep);
        if (!g.activeTab || !g.tabs.includes(g.activeTab))
          g.activeTab = g.tabs[0];
      }
    },
    find: (r: AnchorRecord) =>
      groups
        .flatMap((g) => g.tabs.map((tab) => ({ tab, column: g.viewColumn })))
        .find((e) => e.tab.input.uri.toString() === r.target.toString()),
    async open(r: AnchorRecord, column: number) {
      const existing = this.find(r),
        g = groups.find((g) => g.viewColumn === (existing?.column ?? column));
      if (!g) return null;
      let tab = existing?.tab;
      if (!tab) {
        tab = { owned: true, isPreview: true, input: { uri: r.target } };
        g.tabs.push(tab);
        opened.push(r.anchor.n);
      }
      g.activeTab = tab;
      return { tab, column: g.viewColumn };
    },
  };
  const vscode = {
    workspace: {
      getConfiguration: (_section: string) => ({
        get: (key: string, fallback: unknown) =>
          (
            ({ maxGroups: cap, orientation, renderSideBySide: diff }) as Record<
              string,
              unknown
            >
          )[key] ?? fallback,
      }),
    },
    window: {
      tabGroups: {
        all: groups,
        close: async (tab: FakeTab) => {
          for (const g of groups) {
            g.tabs = g.tabs.filter((t) => t !== tab);
            if (g.activeTab === tab) g.activeTab = g.tabs.at(-1);
          }
          closed.push(tab);
        },
      },
      visibleTextEditors: [] as ViewportEditor[],
    },
    commands: {
      executeCommand: async (command: string, arg?: EditorLayout) => {
        if (command === "vscode.getEditorLayout")
          return structuredClone(layout);
        if (command === "vscode.setEditorLayout") {
          assert.ok(arg);
          calls.push(arg);
          layout = structuredClone(arg);
          const leaves = (n: EditorGroupLayout): number =>
            n.groups ? n.groups.reduce((s, g) => s + leaves(g), 0) : 1;
          const count = leaves(arg);
          while (groups.length < count)
            groups.push({ viewColumn: groups.length + 1, tabs: [] });
          while (groups.length > count) {
            const g = present(groups.pop());
            groups[0].tabs.push(...g.tabs);
          }
        }
      },
    },
  };
  const engine = createLayoutEngine(
      vscode as unknown as LayoutApi,
      opener as unknown as AnchorOpener,
      storage,
    ),
    state = makeState({
      tourId: "t",
      mode: "following",
      identity: "revision-1",
      workspace: "/fixture",
      plan: {
        presentationVersion: 2,
        stops: [makeStop({ id: "a", anchors: records.map((r) => r.anchor) })],
      },
      stopIndex: 0,
    });
  const apply = async (...numbers: number[]) => {
    await engine.begin(state, records);
    return engine.apply(
      state,
      numbers.map((n) => records[n - 1]),
    );
  };
  return {
    engine,
    state,
    records,
    groups,
    calls,
    opened,
    closed,
    apply,
    vscode,
    resize() {
      layout.groups[0].size = 0.7;
      layout.groups[1].size = 0.3;
    },
    reviewerTab(column = 1) {
      const g = groups[column - 1];
      g.activeTab = {
        input: { uri: uri(`user:${current++}`) },
        isPreview: true,
      };
      g.tabs.push(g.activeTab);
    },
  };
}
test("shape choice and viewport detection respect diff orientation, short files, EOF and folds", () => {
  assert.equal(shapeFor(2, "auto", true), "stack");
  assert.equal(shapeFor(2, "auto", false), "columns");
  assert.equal(shapeFor(2, "stacked", false), "stack");
  assert.equal(shapeFor(4, "stacked", false), "grid");
  const e = (lineCount: number, start: number, end: number) => ({
    document: { lineCount },
    visibleRanges: [{ start: { line: start }, end: { line: end } }],
  });
  assert.equal(cramped(e(3, 0, 2)), false);
  assert.equal(cramped(e(100, 90, 99)), false);
  assert.equal(cramped(e(100, 0, 16)), true);
  assert.equal(cramped(e(100, 0, 17)), false);
  assert.equal(
    geometry({ orientation: 1, groups: [{ size: 400 }, { size: 400 }] }),
    geometry(SHAPES.stack.layout),
  );
});
test("growth preserves visible anchors, cap 2–4 bounds replacement, and all-visible beats never reshape", async () => {
  for (const cap of [2, 3, 4]) {
    const f = fixture({ cap });
    await f.apply(1);
    const one = f.groups[0].activeTab;
    await f.apply(1, 2);
    assert.equal(f.groups[0].activeTab, one);
    const before = f.calls.length;
    await f.apply(2, 1);
    assert.equal(f.calls.length, before);
    await f.apply(1, 2, 3, 4, 5);
    assert.equal(f.groups.length, cap);
    assert.deepEqual(
      f.engine.snapshot().unplaced,
      [3, 4, 5].filter((n) => n > cap),
    );
  }
});
test("pins retain anchors through beats; all-pinned groups leave missing anchors unopened", async () => {
  const f = fixture({ cap: 2 });
  await f.apply(1, 2);
  for (const n of [1, 2])
    await f.engine.action({ action: "pin", anchor: n, pinned: true }, f.state);
  await f.apply(3, 4);
  assert.deepEqual(f.opened, [1, 2]);
  assert.deepEqual(f.engine.snapshot().unplaced, [3, 4]);
  await f.engine.action({ action: "pin", anchor: 2, pinned: false }, f.state);
  await f.apply(3);
  assert.equal(present(f.groups[0].activeTab).input.uri.toString(), "head:1");
  assert.equal(present(f.groups[1].activeTab).input.uri.toString(), "head:3");
});
test("least recently active replacement reserves wanted sources before placing missing ones", async () => {
  const f = fixture({ cap: 3 });
  await f.apply(1, 2, 3);
  await f.apply(1);
  await f.apply(4, 1);
  assert.equal(present(f.groups[0].activeTab).input.uri.toString(), "head:1");
  assert.equal(present(f.groups[1].activeTab).input.uri.toString(), "head:4");
  assert.equal(present(f.groups[2].activeTab).input.uri.toString(), "head:3");
});
test("resize customizes while scroll does not; custom layouts cannot grow and Exploring does nothing", async () => {
  const f = fixture();
  await f.apply(1, 2);
  await f.engine.observe();
  assert.equal(f.engine.snapshot().customized, false);
  f.resize();
  await f.apply(1, 3, 4);
  assert.equal(f.engine.snapshot().customized, true);
  assert.equal(f.groups.length, 2);
  assert.equal(f.calls.length, 1);
  const before = [...f.opened];
  f.state.mode = "exploring";
  await f.apply(5);
  assert.deepEqual(f.opened, before);
});
test("reviewer previews and existing groups beyond cap survive without any added groups", async () => {
  const f = fixture({ cap: 2 });
  f.reviewerTab();
  await f.apply(1, 2);
  assert.deepEqual(f.opened, []);
  assert.equal(present(f.groups[0].activeTab).owned, undefined);
  assert.equal(f.engine.snapshot().customized, true);
});
test("explicit placement is validated, preserves pins, and remembers destination by role", async () => {
  const f = fixture();
  await f.apply(1);
  assert.ok(f.engine.snapshot().options[2].some((p) => p.kind === "below"));
  await f.engine.action(
    {
      action: "place",
      anchor: 2,
      placement: { kind: "below", of: 1 },
      remember: true,
    },
    f.state,
  );
  assert.equal(f.groups.length, 2);
  assert.equal(f.engine.snapshot().preferences.evidence?.slot, "bottom");
  await f.apply(1, 4);
  assert.equal(present(f.groups[1].activeTab).input.uri.toString(), "head:4");
  await f.engine.action({ action: "pin", anchor: 4, pinned: true }, f.state);
  await assert.rejects(
    f.engine.action(
      { action: "place", anchor: 5, placement: { kind: "replace", of: 4 } },
      f.state,
    ),
    /no longer available/,
  );
});
test("Sequence collapses only untouched engine arrangements and override prevents a second collapse", async () => {
  const f = fixture();
  f.vscode.window.visibleTextEditors = [
    {
      document: { lineCount: 100 },
      visibleRanges: [{ start: { line: 0 }, end: { line: 10 } }],
    },
  ];
  await f.apply(1, 2);
  assert.equal(f.engine.snapshot().sequence, true);
  assert.equal(f.groups.length, 1);
  await f.engine.action({ action: "overrideSequence" }, f.state);
  await f.apply(1, 2);
  assert.equal(f.groups.length, 2);
  assert.equal(f.engine.snapshot().sequence, false);
  const pinned = fixture();
  await pinned.apply(1, 2);
  await pinned.engine.action(
    { action: "pin", anchor: 1, pinned: true },
    pinned.state,
  );
  pinned.vscode.window.visibleTextEditors = f.vscode.window.visibleTextEditors;
  await pinned.apply(2, 3);
  assert.equal(pinned.engine.snapshot().sequence, false);
});

test("a pin prevents automatic shape growth even below the cap", async () => {
  const f = fixture({ cap: 4 });
  await f.apply(1, 2);
  await f.engine.action({ action: "pin", anchor: 1, pinned: true }, f.state);
  await f.apply(1, 2, 3);
  assert.equal(f.groups.length, 2);
  assert.deepEqual(f.engine.snapshot().unplaced, [3]);
});

test("picker previews show the actual resulting anchor slots and remove pinned replacements", async () => {
  const f = fixture();
  await f.apply(1, 2);
  const option = f.engine
    .snapshot()
    .options[3].find((o) => o.kind === "beside" && o.of === 1);
  assert.ok(option);
  assert.deepEqual(
    option.preview.map((c) => c.anchor),
    [1, 3, 2],
  );
  assert.equal(option.preview[2].y, 0.53);
  assert.ok(
    f.engine
      .snapshot()
      .options[1].some((o) => o.kind === "replace" && o.of === 2),
  );
  await f.engine.action({ action: "pin", anchor: 1, pinned: true }, f.state);
  assert.deepEqual(
    f.engine.snapshot().options[1].map((o) => o.kind),
    ["auto", "peek"],
  );
  assert.ok(
    !f.engine.snapshot().options[3].some((o) => "of" in o && o.of === 1),
  );
});
test("reset clears tour pins and customization but preserves role preferences and reviewer tabs", async () => {
  const f = fixture();
  f.state.plan.stops[0].beats = [
    { id: "beat", narration: "Inspect {{a:1}}.", active: [1, 2] },
  ];
  f.state.beatIndex = 0;
  await f.apply(1);
  await f.engine.action(
    {
      action: "place",
      anchor: 2,
      placement: { kind: "below", of: 1 },
      remember: true,
    },
    f.state,
  );
  await f.engine.action({ action: "pin", anchor: 1, pinned: true }, f.state);
  await f.engine.action({ action: "reset" }, f.state);
  assert.ok(f.engine.snapshot().slots.every((s) => !s.pinned));
  assert.equal(f.engine.snapshot().preferences.evidence?.slot, "bottom");
  f.reviewerTab();
  const protectedTab = f.groups[0].activeTab;
  await f.engine.action({ action: "reset" }, f.state);
  assert.ok(f.groups[0].tabs.includes(present(protectedTab)));
});

function memory() {
  const values = new Map<string, unknown>();
  return createLayoutState({
    get: (k) => values.get(k),
    update: async (k, v) => {
      values.set(k, structuredClone(v));
    },
  });
}
test("returning to a stop restores its resized arrangement and excludes a closed anchor", async () => {
  const f = fixture({ storage: memory() });
  await f.apply(1, 2);
  f.resize();
  f.groups[1].tabs = [];
  f.groups[1].activeTab = undefined;
  await f.engine.observe();
  const saved = await f.vscode.commands.executeCommand(
    "vscode.getEditorLayout",
  );
  f.state = { ...f.state }; // apply uses the original state: change its stop selection below.
  const state = f.state;
  state.plan.stops.push(
    makeStop({ id: "b", anchors: f.records.map((r) => r.anchor) }),
  );
  await f.engine.begin({ ...state, stopIndex: 1 }, f.records);
  await f.engine.apply({ ...state, stopIndex: 1 }, [f.records[2]]);
  await f.engine.begin({ ...state, stopIndex: 0 }, f.records);
  await f.engine.apply({ ...state, stopIndex: 0 }, [
    f.records[0],
    f.records[1],
  ]);
  assert.deepEqual(
    await f.vscode.commands.executeCommand("vscode.getEditorLayout"),
    saved,
  );
  assert.deepEqual(
    f.engine.snapshot().slots.map((s) => s.anchor),
    [1, undefined],
  );
  assert.deepEqual(f.engine.snapshot().unplaced, [2]);
});
test("a new engine restores layout, pins and role preferences from profile storage", async () => {
  const storage = memory(),
    f = fixture({ storage });
  await f.apply(1);
  await f.engine.action(
    {
      action: "place",
      anchor: 2,
      placement: { kind: "below", of: 1 },
      remember: true,
    },
    f.state,
  );
  await f.engine.action({ action: "pin", anchor: 2, pinned: true }, f.state);
  f.resize();
  await f.engine.observe();
  const reloaded = fixture({ storage });
  await reloaded.apply(1, 3);
  assert.deepEqual(
    reloaded.engine.snapshot().slots.map((s) => s.anchor),
    [1, 2],
  );
  assert.equal(reloaded.engine.snapshot().slots[1].pinned, true);
  assert.equal(reloaded.engine.snapshot().customized, true);
  assert.equal(reloaded.engine.snapshot().preferences.evidence?.slot, "bottom");
  assert.deepEqual(reloaded.engine.snapshot().unplaced, [3]);
});
test("changed sources, changed stop definitions and a smaller cap discard incompatible arrangements", async () => {
  for (const change of ["revision", "anchor", "cap"]) {
    const storage = memory(),
      f = fixture({ storage });
    await f.apply(1, 2, 3);
    const next = fixture({ storage, cap: change === "cap" ? 2 : 3 });
    if (change === "revision") next.state.identity = "revision-2";
    if (change === "anchor")
      next.state.plan.stops[0].anchors[0].path = "renamed.js";
    await next.apply(4);
    assert.deepEqual(
      next.engine.snapshot().slots.map((s) => s.anchor),
      [4],
    );
  }
});
test("reload keeps reviewer tabs and geometry instead of replaying ownership", async () => {
  const storage = memory(),
    f = fixture({ storage });
  await f.apply(1, 2);
  const next = fixture({ storage });
  next.reviewerTab();
  const tab = next.groups[0].activeTab;
  await next.apply(1, 2);
  assert.equal(next.groups[0].activeTab, tab);
  assert.deepEqual(next.opened, []);
  assert.equal(next.groups.length, 1);
});
test("pause closes disposable previews, collapses empty groups, and resumes the saved arrangement", async () => {
  const f = fixture({ storage: memory() });
  await f.apply(1, 2);
  await f.engine.suspend();
  assert.ok(f.groups.every((g) => g.tabs.length === 0));
  assert.equal(f.groups.length, 1);
  await f.apply(1, 2);
  assert.deepEqual(
    f.engine.snapshot().slots.map((s) => s.anchor),
    [1, 2],
  );
  await f.engine.action({ action: "pin", anchor: 1, pinned: true }, f.state);
  const tab = f.groups[0].activeTab;
  await f.engine.suspend();
  assert.ok(f.groups[0].tabs.includes(present(tab)));
  assert.equal(present(tab).owned, false);
});
test("visiting a saved stop while Exploring defers restoration until Following", async () => {
  const f = fixture({ storage: memory() });
  await f.apply(1, 2);
  f.resize();
  await f.engine.observe();
  f.state.plan.stops.push(
    makeStop({ id: "b", anchors: f.records.map((r) => r.anchor) }),
  );
  await f.engine.begin({ ...f.state, stopIndex: 1 }, f.records);
  await f.engine.apply({ ...f.state, stopIndex: 1 }, [f.records[2]]);
  const before = f.groups.map((g) => g.activeTab);
  await f.engine.begin({ ...f.state, mode: "exploring" }, f.records);
  await f.engine.observe();
  assert.deepEqual(
    f.groups.map((g) => g.activeTab),
    before,
  );
  await f.engine.begin({ ...f.state, mode: "following" }, f.records);
  await f.engine.apply(f.state, [f.records[0]]);
  assert.deepEqual(
    f.engine.snapshot().slots.map((s) => s.anchor),
    [1, 2],
  );
});

test("automatic grid placement separates repeated colors when a diagonal slot is available", async () => {
  const f = fixture({ cap: 4 });
  await f.apply(1, 7, 2, 3);
  assert.deepEqual(
    f.engine.snapshot().slots.map((s) => s.anchor),
    [1, 2, 3, 7],
  );
});

test("a corrupt saved root is discarded before any editor layout command", async () => {
  const storage = memory();
  const first = fixture({ storage });
  await first.apply(1);
  const value = storage.read(first.state);
  record(value.layouts.a).layout = {};
  await storage.write(first.state, { ...value, layouts: {} });
  // Inject malformed persisted data to exercise restoration checks.
  storage.read = () => value;
  const next = fixture({ storage });
  await next.apply(2);
  assert.deepEqual(next.calls, []);
  assert.deepEqual(
    next.engine.snapshot().slots.map((slot) => slot.anchor),
    [2],
  );
});

test("remembered destinations use column labels in a custom arrangement", async () => {
  const f = fixture();
  await f.vscode.commands.executeCommand("vscode.setEditorLayout", {
    orientation: 0,
    groups: [{}, {}, {}],
  });
  await f.apply(1, 2);
  await f.engine.action(
    {
      action: "place",
      anchor: 3,
      placement: { kind: "replace", of: 2 },
      remember: true,
    },
    f.state,
  );
  assert.equal(f.engine.snapshot().shape, "custom");
  assert.deepEqual(f.engine.snapshot().preferences.change, {
    kind: "replace",
    slot: "group2",
  });
});
