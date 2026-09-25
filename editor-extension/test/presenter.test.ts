import type {
  Range,
  DecorationOptions,
  TextEditorDecorationType,
} from "vscode";
import type { PaintEditor } from "../src/host/presenter.js";
import { decorationFixture } from "./decoration-fixture.js";
import { present, record } from "../../test/assertions.js";
import test = require("node:test");
import assert = require("node:assert/strict");
import { createPresenter } from "../src/host/presenter.js";
import {
  parseHunks,
  seamLineFor,
  removedBaseLines0,
  mapRange,
} from "../src/host/hunks.js";

function fixture() {
  const { api: vscode, decoration } = decorationFixture();
  const captured = new Map<TextEditorDecorationType, readonly Range[]>();
  const calls = (type: TextEditorDecorationType) => present(captured.get(type));
  const texts = ["long first line", "x", "third", "outside", "last"];
  const editor = {
    document: {
      lineCount: texts.length,
      lineAt: (i: number) => ({ text: texts[i] }),
    },
    setDecorations: (
      t: TextEditorDecorationType,
      rs: readonly (Range | DecorationOptions)[],
    ) =>
      captured.set(
        t,
        rs.map((value) => ("range" in value ? value.range : value)),
      ),
  };
  return {
    presenter: createPresenter(vscode),
    calls,
    decoration,
    editor: editor as unknown as PaintEditor,
  };
}

test("presenter preserves diff backgrounds and uses text-only dimming", () => {
  const { presenter: p, calls, decoration, editor } = fixture();
  for (const [name, t] of Object.entries(p.types))
    if (name !== "companionRemoved")
      assert.equal(decoration(t).options.backgroundColor, undefined);
  assert.equal(
    record(decoration(p.types.companionRemoved).options.backgroundColor).id,
    "diffEditor.removedLineBackground",
  );
  p.paint(editor, {
    context: [{ startLine: 1, endLine: 5 }],
    focus: [{ startLine: 1, endLine: 3 }],
    label: "claim",
    state: "following",
  });
  assert.deepEqual(
    calls(p.types.dim).map((r) => r.start.line),
    [3, 4],
  );
  assert.equal(calls(p.types.label)[0].start.line, 1);
  assert.equal(calls(p.types.boxTop)[0].start.line, 0);
  assert.equal(calls(p.types.boxMid)[0].start.line, 1);
  assert.equal(calls(p.types.boxBot)[0].start.line, 2);
});

test("state changes clear old paint, retain rails, and suppress stale focus", () => {
  const { presenter: p, calls, editor } = fixture();
  const paint = {
    context: [{ startLine: 1, endLine: 5 }],
    focus: [{ startLine: 2, endLine: 2 }],
    label: "claim",
  };
  for (const state of ["following", "exploring", "paused", "detour", "stale"]) {
    Reflect.apply(p.paint, undefined, [editor, { ...paint, state }]);
    assert.equal(calls(p.types.dim).length > 0, state === "following");
    assert.equal(calls(p.types.label).length > 0, state !== "exploring");
    assert.equal(calls(p.types.boxOne).length, state === "stale" ? 0 : 1);
    assert.equal(
      calls(state === "stale" ? p.types.railStale : p.types.rail).length,
      5,
    );
  }
  p.paint(editor, { context: paint.context, state: "following" });
  assert.equal(calls(p.types.dim).length, 0);
  assert.equal(calls(p.types.label).length, 0);
});

test("EOF seams use bottom borders; configuration replaces and disposes dim", () => {
  const { presenter: p, calls, decoration, editor } = fixture();
  const old = p.types.dim;
  p.configure(1);
  assert.ok(decoration(old).disposed);
  p.paint(editor, {
    state: "following",
    context: [{ startLine: 1, endLine: 5 }],
    focus: [{ startLine: 1, endLine: 1 }],
    seams: [{ line: 5, label: "removed" }],
  });
  assert.equal(calls(p.types.seam).length, 0);
  assert.equal(calls(p.types.seamBottom)[0].start.line, 4);
  assert.equal(calls(p.types.dim).length, 0);
  p.dispose();
  assert.ok(Object.values(p.types).every((t) => decoration(t).disposed));
});

test("zero-context hunks map deletions, replacements, insertions, and renames", () => {
  const hunks = parseHunks(
    "diff --git a/old b/new\n@@ -2,2 +1,0 @@\n-old\n@@ -6 +4,2 @@\n@@ -9,0 +9 @@\n",
  );
  assert.equal(seamLineFor(1, hunks), 1);
  assert.equal(seamLineFor(5, hunks), 3);
  assert.equal(seamLineFor(0, hunks), undefined);
  assert.deepEqual(removedBaseLines0(hunks), [1, 2, 5]);
  assert.deepEqual(mapRange({ startLine: 4, endLine: 5 }, hunks, "base"), {
    startLine: 2,
    endLine: 3,
  });
  assert.deepEqual(mapRange({ startLine: 2, endLine: 3 }, hunks, "head"), {
    startLine: 4,
    endLine: 5,
  });
});
