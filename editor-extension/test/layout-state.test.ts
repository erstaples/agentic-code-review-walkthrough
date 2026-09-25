import { anchor } from "./factories.js";
import type { SavedStopLayout } from "../src/shared/layout.js";
import test = require("node:test");
import assert = require("node:assert/strict");
import {
  createLayoutState,
  compatible,
  stopIdentity,
} from "../src/host/layout-state.js";
const state = {
    workspace: "/workspace",
    tourId: "tour",
    identity: "sha256:one",
  },
  stop = { anchors: [anchor()], beats: [] };
const saved = (): SavedStopLayout => ({
  identity: stopIdentity(state, stop),
  layout: { orientation: 1, groups: [{}] },
  slots: [{ anchor: 1, pinned: true, lastActive: 1 }],
  customized: true,
  sequence: false,
  override: false,
});
test("profile state is isolated by workspace and tour, while revision changes retain only role choices", async () => {
  const data = new Map<string, unknown>(),
    store = createLayoutState({
      get: (k) => data.get(k),
      update: async (k, v) => {
        data.set(k, v);
      },
    });
  await store.write(state, {
    layouts: { one: saved() },
    preferences: Object.assign(
      {
        evidence: { kind: "replace" as const, slot: "bottom" as const },
        change: Object.assign(
          { kind: "replace" as const, slot: "top" as const },
          { kind: "command" },
        ),
      },
      { invalid: { kind: "peek" } },
    ),
  });
  assert.deepEqual(store.read(state).preferences, {
    evidence: { kind: "replace" as const, slot: "bottom" as const },
  });
  assert.deepEqual(store.read({ ...state, identity: "changed" }).layouts, {});
  assert.deepEqual(store.read({ ...state, tourId: "another" }), {
    preferences: {},
    layouts: {},
  });
  assert.deepEqual(store.read({ ...state, workspace: "/other" }), {
    preferences: {},
    layouts: {},
  });
});
test("untrusted state cannot restore unknown anchors, duplicate anchors, invalid geometry, or wrong source identity", () => {
  assert.equal(compatible(saved(), state, stop, 3), true);
  for (const mutate of [
    (s: SavedStopLayout) => (s.identity = "old"),
    (s: SavedStopLayout) => (s.slots[0].anchor = 99),
    (s: SavedStopLayout) => (s.layout.groups[0].size = -1),
    (s: SavedStopLayout) => Object.assign(s.layout, { orientation: 8 }),
    (s: SavedStopLayout) => Object.assign(s.slots[0], { pinned: "yes" }),
    (s: SavedStopLayout) => {
      s.layout.groups.push({});
      s.slots.push(s.slots[0]);
    },
  ]) {
    const value = saved();
    mutate(value);
    assert.equal(compatible(value, state, stop, 3), false);
  }
  assert.equal(compatible(null, state, stop, 3), false);
});

test("saved editor layouts require a root split and object-shaped child groups", () => {
  const invalid = [
    {},
    [],
    { orientation: 0 },
    { groups: [{}] },
    { orientation: 7 },
    { orientation: 0, groups: null },
    { orientation: 0, groups: [[]] },
    { orientation: 0, groups: [{ groups: false }] },
    { orientation: 0, groups: [{ groups: 0 }] },
    { orientation: 0, groups: [{ orientation: 7 }] },
  ];
  for (const layout of invalid) {
    assert.equal(
      compatible({ ...saved(), layout }, state, stop, 3),
      false,
      JSON.stringify(layout),
    );
  }
  const nested = saved();
  nested.layout = {
    orientation: 1,
    groups: [{ groups: [{ size: 0.6 }, {}] }, {}],
  };
  nested.slots = [
    nested.slots[0],
    ...Array.from({ length: 2 }, () => ({
      anchor: null,
      pinned: false,
      lastActive: 0,
    })),
  ];
  assert.equal(compatible(nested, state, stop, 3), true);
  assert.equal(compatible(nested, state, stop, 2), false);
});
