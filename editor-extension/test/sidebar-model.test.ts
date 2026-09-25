import { snapshot as uiSnapshot } from "./ui/snapshot.js";
import { anchor } from "./factories.js";
import type { AnchorRole } from "../src/shared/tour.js";
import test = require("node:test");
import assert = require("node:assert/strict");
import * as model from "../src/shared/sidebar-model.js";
function snapshot(count: number, active = [1, 2]): model.RowSource {
  return {
    stop: {
      ...uiSnapshot().stop,
      anchors: Array.from({ length: count }, (_, i) =>
        anchor({
          n: i + 1,
          path: `src/file-${i + 1}.js`,
          label: `Source ${i + 1}`,
          role: Object.keys(model.roles)[i % 7] as AnchorRole,
          context: { startLine: 1, endLine: 9 },
        }),
      ),
    },
    beat: { active },
    presentation: {
      anchors: [],
      layout: {
        ...uiSnapshot().presentation.layout,
        slots: [
          { anchor: 1, column: 1, slot: "top", pinned: true },
          { anchor: 2, column: 2, slot: "bottomLeft", pinned: false },
        ],
        options: {},
      },
    },
  };
}
test("all stop anchors retain identity across beats, including unopened and inactive sources", () => {
  const first = model.rows(snapshot(9)),
    next = model.rows(snapshot(9, [3, 5]));
  assert.equal(first.length, 9);
  assert.deepEqual(
    first.map((r) => r.n),
    next.map((r) => r.n),
  );
  assert.equal(first[0].slot, "top");
  assert.equal(first[0].pinned, true);
  assert.equal(first[8].status, "not-open");
  assert.equal(next[0].active, false);
  assert.equal(next[4].active, true);
  assert.deepEqual(
    new Set(first.map((r) => r.role)),
    new Set(Object.keys(model.roles)),
  );
});
test("compact stops stay ordered; larger stops put In view before every remaining role", () => {
  assert.deepEqual(
    model
      .entries(model.rows(snapshot(3)))
      .map((e) => ("row" in e ? e.row.n : undefined)),
    [1, 2, 3],
  );
  const entries = model.entries(model.rows(snapshot(9)));
  assert.equal("key" in entries[0] ? entries[0].key : undefined, "view");
  assert.deepEqual(
    entries
      .filter((e): e is model.RowEntry => "row" in e)
      .map((e) => e.row.n)
      .sort((a, b) => a - b),
    [1, 2, 3, 4, 5, 6, 7, 8, 9],
  );
  assert.equal(
    model
      .entries(model.rows(snapshot(9)), { filter: "file-9" })
      .filter((e): e is model.RowEntry => "row" in e)[0].row.n,
    9,
  );
});
test("large inactive role sections collapse, but filtering and explicit expansion reveal their anchors", () => {
  const rows = model.rows(snapshot(24, [1, 2, 5])),
    initial = model.entries(rows);
  assert.equal(
    initial.find(
      (e): e is model.SectionEntry => "key" in e && e.key === "schema",
    )?.closed,
    true,
  );
  assert.equal(
    initial.find(
      (e): e is model.SectionEntry => "key" in e && e.key === "config",
    )?.closed,
    false,
  );
  assert.ok(
    model
      .entries(rows, { filter: "file-20" })
      .some((e) => ("row" in e ? e.row.n : undefined) === 20),
  );
  assert.equal(
    model
      .entries(rows, { collapsed: { schema: false } })
      .find((e): e is model.SectionEntry => "key" in e && e.key === "schema")
      ?.closed,
    false,
  );
});
test("virtual windows bound mounted rows and preserve offsets through anchor 99", () => {
  const entries = model.entries(model.rows(snapshot(99)), { order: "order" }),
    start = model.windowed(entries, 0, 340),
    end = model.windowed(entries, 68 * 95, 340);
  assert.ok(start.visible.length < 10);
  assert.ok(end.visible.length < 10);
  assert.equal(start.total, 99 * 68);
  assert.equal(
    end.visible.at(-1)?.type === "row"
      ? (end.visible.at(-1) as model.RowEntry).row.n
      : undefined,
    99,
  );
  assert.equal(end.after, 0);
});

test("role icons appear only where a role heading does not already identify the row", () => {
  const rows = model.rows(snapshot(9));
  const grouped = model
    .entries(rows)
    .filter((e): e is model.RowEntry => "row" in e);
  assert.deepEqual(
    grouped
      .filter((e) => e.showRoleIcon)
      .map((e) => ("row" in e ? e.row.n : undefined)),
    [1, 2],
  );
  assert.ok(grouped.filter((e) => !e.row.slot).every((e) => !e.showRoleIcon));
  assert.ok(
    model
      .entries(rows, { order: "order" })
      .every((e) => "row" in e && e.showRoleIcon),
  );
  assert.ok(
    model
      .entries(model.rows(snapshot(3)))
      .every((e) => "row" in e && e.showRoleIcon),
  );
  assert.ok(
    model
      .entries(rows, { filter: "file-9" })
      .some((e) => e.type === "section" && e.key === rows[8].role),
  );
});
