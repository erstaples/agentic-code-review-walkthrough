import {
  anchor as makeAnchor,
  stop as makeStop,
  state as makeState,
} from "./factories.js";
import { snapshot as uiSnapshot } from "./ui/snapshot.js";
import type { TourState } from "../src/host/state.js";
import type {
  TourSnapshot,
  LoadedTourSnapshot,
} from "../src/shared/snapshot.js";
import { record, present } from "../../test/assertions.js";
import { errorFields } from "../../generated/mcp/lib/input.js";
import { test } from "node:test";
import assert = require("node:assert/strict");
import { createTourController } from "../src/host/tour-controller.js";
import { renderNarration } from "../../generated/shared/narration.js";
const anchor = makeAnchor({
  n: 1,
  path: "src/check.js",
  label: "the check",
  side: "head",
  context: { startLine: 2, endLine: 4 },
  rev: { base: "a".repeat(40), head: "b".repeat(40) },
});
const plan = {
  presentationVersion: 2 as const,
  id: "p",
  title: "Tour",
  stops: [
    {
      ...makeStop(),
      id: "s1",
      anchors: [anchor],
      beats: [
        { id: "b1", narration: "Inspect {{a:1}}.", active: [1] },
        { id: "b2", narration: "Confirm {{a:1}}.", active: [1] },
      ],
    },
    {
      ...makeStop(),
      id: "s2",
      anchors: [anchor],
      beats: [{ id: "b3", narration: "End at {{a:1}}.", active: [] }],
    },
  ],
};
function harness() {
  const presented: TourState[] = [],
    published: TourSnapshot[] = [];
  const controller = createTourController({
    prepare: async (body) => {
      if (record(body).invalid) throw new Error("Invalid tour");
      return {
        ...makeState(),
        plan: structuredClone(plan),
        tourId: "t",
        findings: [],
      };
    },
    present: async (state) => {
      presented.push(state);
      return { anchors: [] };
    },
    clear: async () => {},
    layoutAction: async () => ({ anchors: [] }),
    publish: (value) => published.push(value),
  });
  function loaded(value: TourSnapshot): LoadedTourSnapshot {
    assert.ok(value.loaded);
    return value;
  }
  const checked = {
    ...controller,
    load: async (body: unknown) => loaded(await controller.load(body)),
    navigate: async (body: unknown) => loaded(await controller.navigate(body)),
    setState: async (body: unknown) => loaded(await controller.setState(body)),
    focus: async (body: unknown) => loaded(await controller.focus(body)),
    snapshot: () => loaded(controller.snapshot()),
  };
  return { controller: checked, presented, published, loaded };
}
test("load, navigation, goto and state return complete snapshots", async () => {
  const { controller: c } = harness();
  await assert.rejects(
    c.navigate({ action: "nextBeat" }),
    (e) => errorFields(e).code === "no_tour",
  );
  let s = await c.load({});
  assert.equal(s.stopIndex, 0);
  assert.equal(s.mode, "following");
  assert.match(s.narration, /① check.js:2/);
  assert.match(s.receiptNarration, /src\/check.js:2–4 @bbbbbbb/);
  s = await c.navigate({ action: "nextBeat" });
  assert.equal(s.beat.id, "b2");
  s = await c.navigate({ action: "nextBeat" });
  assert.equal(s.stop.id, "s2");
  await assert.rejects(
    c.navigate({ action: "nextBeat" }),
    (e) => errorFields(e).code === "navigation_boundary",
  );
  s = await c.navigate({ action: "previousBeat" });
  assert.equal(s.beat.id, "b2");
  s = await c.navigate({ action: "goto", stopId: "s2", beatId: "b3" });
  assert.equal(s.selectedAnchor, null);
  s = await c.setState({ mode: "exploring" });
  assert.equal(s.mode, "exploring");
  s = await c.setState({ mode: "paused" });
  assert.equal(s.mode, "paused");
  assert.deepEqual(await c.clear(), { revision: 8, loaded: false });
});
test("rejected load and stale or malformed intents preserve the current presentation", async () => {
  const { controller: c, presented } = harness();
  const original = await c.load({});
  for (const action of [
    () => c.load({ invalid: true }),
    () => c.navigate({ action: "goto", stopId: "missing" }),
    () => c.setState({ mode: "wrong" }),
    () => c.focus({ anchor: 99 }),
    () => c.navigate({ action: "nextBeat", expectedRevision: 0 }),
  ])
    await assert.rejects(action());
  assert.deepEqual(c.snapshot(), original);
  assert.equal(presented.length, 1);
});
test("concurrent operations serialize and failed commands do not poison the queue", async () => {
  const { controller: c } = harness();
  await c.load({});
  const values = await Promise.all([
    c.navigate({ action: "nextBeat" }),
    c.navigate({ action: "nextBeat" }),
  ]);
  assert.deepEqual(
    values.map((s) => s.beat.id),
    ["b2", "b3"],
  );
  await assert.rejects(c.navigate({ action: "nextBeat" }));
  assert.equal((await c.navigate({ action: "previousStop" })).beat.id, "b1");
});
test("chip focus does not rewrite the authored active list, and snapshots are detached", async () => {
  const { controller: c } = harness();
  await c.load({});
  const s = await c.focus({ anchor: 1 });
  s.stop.anchors[0].path = "bad";
  assert.equal(c.snapshot().stop.anchors[0].path, "src/check.js");
  assert.deepEqual(c.snapshot().beat.active, [1]);
});
test("narration escapes hostile HTML and exposes only numbered focus intents", () => {
  const html = renderNarration(
    '<img src=x onerror="alert(1)"> **Proof** {{a:1}} [run](command:evil)',
    [anchor],
    "sidebar",
  );
  assert.match(html, /&lt;img/);
  assert.match(html, /<strong>Proof<\/strong>/);
  assert.match(html, /data-anchor="1"/);
  assert.match(html, /title="src\/check.js:2–4/);
  assert.doesNotMatch(html, /<img|<a |onclick=/);
  assert.throws(
    () => renderNarration("{{a:2}}", [anchor], "sidebar"),
    /Unknown anchor/,
  );
  const a99 = { ...anchor, n: 99 };
  assert.match(renderNarration("{{a:99}}", [a99], "sidebar"), />99<\/button>/);
});
test("asynchronous editor observation finishes before navigation changes the stop", async () => {
  const { controller: c, published, loaded } = harness();
  await c.load({});
  let release = () => {},
    started = () => {};
  const ready = new Promise<void>((resolve) => {
    started = resolve;
  });
  const observation = c.updatePresentation(async () => {
    started();
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    assert.equal(c.snapshot().stop.id, "s1");
    return {
      anchors: [],
      layout: { ...uiSnapshot().presentation.layout, customized: true },
    };
  });
  await ready;
  const navigation = c.navigate({ action: "nextStop" });
  await Promise.resolve();
  assert.equal(c.snapshot().stop.id, "s1");
  release();
  await observation;
  await navigation;
  assert.equal(
    present(loaded(present(published.at(-2))).presentation.layout).customized,
    true,
  );
  assert.equal(c.snapshot().stop.id, "s2");
});
