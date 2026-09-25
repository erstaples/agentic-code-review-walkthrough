"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  validateTourPlan,
  hashText,
  rangeText,
} = require("../generated/shared/tour.js");

const text =
  Array.from({ length: 120 }, (_, n) => `line ${n + 1}`).join("\n") + "\n";
const options = {
  readSource: () => ({ base: text, head: text }),
  revisions: { base: "base-sha", head: "head-sha" },
};
function anchor(n, range = { startLine: n, endLine: n }) {
  return {
    n,
    role: "context",
    label: "Source context",
    path: "src/feature.js",
    view: "head",
    change: "unchanged",
    rev: { ...options.revisions },
    context: range,
    contentHash: hashText(rangeText(text, range)),
  };
}
function plan(count = 1) {
  return {
    presentationVersion: 2,
    stops: [
      {
        id: "s1",
        title: "Behavior",
        risk: "low",
        anchors: Array.from({ length: count }, (_, n) => anchor(n + 1)),
        beats: [{ id: "b1", narration: "Inspect {{a:1}}.", active: [1] }],
      },
    ],
  };
}

test("valid v2 tours round-trip without mutating input and retain priority and sides", () => {
  const input = plan(3);
  input.stops[0].beats[0].active = [3, 1, 2];
  input.stops[0].anchors[0].focus = [
    {
      side: "base",
      range: { startLine: 2, endLine: 3 },
      contentHash: hashText("line 2\nline 3"),
    },
  ];
  const before = structuredClone(input);
  const result = validateTourPlan(input, options);
  assert.equal(result.ok, true);
  assert.deepEqual(result.findings, []);
  assert.deepEqual(input, before);
  assert.deepEqual(result.plan.stops[0].beats[0].active, [3, 1, 2]);
  assert.equal(result.plan.stops[0].anchors[0].side, "head");
  assert.deepEqual(
    validateTourPlan(JSON.parse(JSON.stringify(result.plan)), options).plan,
    result.plan,
  );
});

test("tour plans require the current version explicitly", () => {
  for (const presentationVersion of [undefined, null, 1, 3, "2"]) {
    const input = plan();
    input.presentationVersion = presentationVersion;
    const result = validateTourPlan(input, options);
    assert.equal(result.ok, false);
    assert.equal(result.plan, null);
    assert.ok(result.findings.some((f) => f.code === "unsupported_version"));
  }
});

const invalid = [
  ["invalid_stop_id", (p) => p.stops.push(structuredClone(p.stops[0]))],
  ["invalid_risk", (p) => (p.stops[0].risk = "critical")],
  ["invalid_number", (p) => (p.stops[0].anchors[0].n = 2)],
  ["invalid_role", (p) => (p.stops[0].anchors[0].role = "test")],
  [
    "invalid_label",
    (p) => (p.stops[0].anchors[0].label = "This label has far too many words"),
  ],
  ["invalid_path", (p) => (p.stops[0].anchors[0].path = "../escape.js")],
  ["invalid_path", (p) => (p.stops[0].anchors[0].path = "C:\\escape.js")],
  ["invalid_path", (p) => (p.stops[0].anchors[0].path = "src/../escape.js")],
  ["invalid_path", (p) => (p.stops[0].anchors[0].path = "/escape.js")],
  ["invalid_path", (p) => (p.stops[0].anchors[0].path = "src/./escape.js")],
  ["revision_mismatch", (p) => (p.stops[0].anchors[0].rev.head = "other")],
  ["invalid_side", (p) => (p.stops[0].anchors[0].side = "base")],
  ["invalid_range", (p) => (p.stops[0].anchors[0].context.startLine = 0)],
  [
    "invalid_range",
    (p) => (p.stops[0].anchors[0].context = { startLine: 2, endLine: 1 }),
  ],
  ["range_out_of_bounds", (p) => (p.stops[0].anchors[0].context.endLine = 121)],
  [
    "invalid_focus",
    (p) =>
      (p.stops[0].anchors[0].focus = [
        { side: "working", range: { startLine: 1, endLine: 1 } },
      ]),
  ],
  [
    "range_out_of_bounds",
    (p) =>
      (p.stops[0].anchors[0].focus = [
        { side: "base", range: { startLine: 121, endLine: 121 } },
      ]),
  ],
  [
    "content_mismatch",
    (p) => (p.stops[0].anchors[0].contentHash = hashText("wrong")),
  ],
  [
    "content_mismatch",
    (p) =>
      (p.stops[0].anchors[0].focus = [
        {
          side: "base",
          range: { startLine: 1, endLine: 1 },
          contentHash: hashText("wrong"),
        },
      ]),
  ],
  ["change_mismatch", (p) => (p.stops[0].anchors[0].change = "added")],
  [
    "invalid_beat_id",
    (p) => p.stops[0].beats.push(structuredClone(p.stops[0].beats[0])),
  ],
  [
    "missing_anchor",
    (p) => (p.stops[0].beats[0].narration = "Inspect {{a:2}}."),
  ],
  [
    "invalid_anchor_token",
    (p) => (p.stops[0].beats[0].narration = "Inspect {{a:01}}."),
  ],
  [
    "invalid_anchor_token",
    (p) => (p.stops[0].beats[0].narration = "Inspect {{a:1}."),
  ],
  ["invalid_active", (p) => (p.stops[0].beats[0].active = [1, 1])],
  ["invalid_active", (p) => (p.stops[0].beats[0].active = [0])],
  ["invalid_active", (p) => (p.stops[0].beats[0].active = [2])],
  ["invalid_active", (p) => (p.stops[0].beats[0].active = null)],
  [
    "raw_path",
    (p) => (p.stops[0].beats[0].narration = "Inspect src/feature.js:1."),
  ],
  [
    "raw_path",
    (p) => (p.stops[0].beats[0].narration = "Inspect `missing.js`."),
  ],
  [
    "raw_path",
    (p) => (p.stops[0].beats[0].narration = "Inspect src/missing.js."),
  ],
  ["invalid_beats", (p) => (p.stops[0].beats = [])],
  ["invalid_anchor", (p) => (p.stops[0].anchors[0] = null)],
];
for (const [code, mutate] of invalid)
  test(`rejects ${code}: ${mutate}`, () => {
    const input = plan();
    mutate(input);
    const result = validateTourPlan(input, options);
    assert.equal(result.ok, false);
    assert.equal(result.plan, null);
    assert.ok(
      result.findings.some(
        (f) =>
          f.code === code &&
          f.severity === "error" &&
          f.location.startsWith("stops["),
      ),
      JSON.stringify(result.findings),
    );
  });

test("anchor limits are configurable through 99 and active overflow is advisory", () => {
  assert.deepEqual(validateTourPlan(plan(7), options).findings, []);
  assert.ok(
    validateTourPlan(plan(8), options).findings.some(
      (f) => f.code === "anchor_budget",
    ),
  );
  assert.equal(validateTourPlan(plan(24), options).ok, true);
  assert.equal(validateTourPlan(plan(25), options).ok, false);
  assert.equal(
    validateTourPlan(plan(99), { ...options, hardLimit: 99 }).ok,
    true,
  );
  assert.equal(
    validateTourPlan(plan(100), { ...options, hardLimit: 99 }).ok,
    false,
  );
  for (const hardLimit of [0, 100, 1.5, "24", NaN])
    assert.throws(
      () => validateTourPlan(plan(), { ...options, hardLimit }),
      RangeError,
    );
  const input = plan(4);
  input.stops[0].beats[0].active = [4, 2, 1, 3];
  const result = validateTourPlan(input, options);
  assert.equal(result.ok, true);
  assert.ok(result.findings.some((f) => f.code === "active_budget"));
});

test("normalization merges transitive overlaps and rewrites tokens simultaneously", () => {
  const input = plan(4);
  input.stops[0].anchors = [
    anchor(1, { startLine: 1, endLine: 2 }),
    anchor(2, { startLine: 5, endLine: 6 }),
    anchor(3, { startLine: 2, endLine: 5 }),
    anchor(4, { startLine: 8, endLine: 8 }),
  ];
  input.stops[0].beats[0] = {
    id: "b",
    narration: "{{a:4}}, {{a:2}}, {{a:3}}, {{a:1}}",
    active: [4, 2, 3, 1],
  };
  const result = validateTourPlan(input, options);
  assert.equal(result.ok, true);
  const stop = result.plan.stops[0];
  assert.equal(stop.anchors.length, 2);
  assert.deepEqual(stop.anchors[0].context, { startLine: 1, endLine: 6 });
  assert.equal(
    stop.anchors[0].contentHash,
    hashText(rangeText(text, stop.anchors[0].context)),
  );
  assert.equal(stop.anchors[0].focus.length, 3);
  assert.equal(stop.beats[0].narration, "{{a:2}}, {{a:1}}, {{a:1}}, {{a:1}}");
  assert.deepEqual(stop.beats[0].active, [2, 1]);
  assert.deepEqual(validateTourPlan(result.plan, options).plan, result.plan);
});

test("overlap cannot mask bad hashes or erase incompatible roles", () => {
  const input = plan(2);
  input.stops[0].anchors[1] = anchor(2, { startLine: 1, endLine: 2 });
  input.stops[0].anchors[1].role = "evidence";
  assert.ok(
    validateTourPlan(input, options).findings.some(
      (f) => f.code === "overlap_conflict",
    ),
  );
  input.stops[0].anchors[1].contentHash = hashText("wrong");
  const result = validateTourPlan(input, options);
  assert.ok(result.findings.some((f) => f.code === "content_mismatch"));
  assert.ok(!result.findings.some((f) => f.code === "overlapping_anchors"));
});

test("observed claims require claim-specific evidence anchors across the tour", () => {
  const input = plan();
  const claims = [
    { id: "clm_a", truthStatus: "observed" },
    { id: "clm_b", truthStatus: "observed" },
  ];
  input.stops[0].anchors[0].role = "evidence";
  input.stops[0].anchors[0].claimRefs = ["clm_b"];
  const result = validateTourPlan(input, { ...options, claims });
  assert.deepEqual(
    result.findings
      .filter((f) => f.code === "observed_without_evidence")
      .map((f) => f.claimId),
    ["clm_a"],
  );
  input.stops[0].anchors[0].claimRefs = ["missing"];
  assert.equal(validateTourPlan(input, { ...options, claims }).ok, false);
});

test("source failures are actionable and catalog paths include bare filenames", () => {
  assert.ok(
    validateTourPlan(plan()).findings.some(
      (f) => f.code === "source_reader_required",
    ),
  );
  assert.ok(
    validateTourPlan(plan(), {
      readSource: () => {
        throw new Error("Missing commit");
      },
    }).findings.some(
      (f) =>
        f.code === "source_unavailable" && /Missing commit/.test(f.message),
    ),
  );
  const input = plan();
  input.stops[0].beats[0].narration = "Inspect Makefile.";
  assert.ok(
    validateTourPlan(input, {
      ...options,
      repositoryPaths: ["Makefile"],
    }).findings.some((f) => f.code === "raw_path"),
  );
  input.stops[0].beats[0].narration =
    "Use Node.js with https://example.com/docs/file.html and {{a:1}}.";
  assert.equal(validateTourPlan(input, options).ok, true);
});

test("range hashing preserves established CRLF bytes but excludes nonexistent EOF lines", () => {
  const old = require("../editor-extension/test/legacy/anchors.js");
  const range = { startLine: 1, endLine: 2 };
  assert.equal(
    hashText(rangeText("a\r\nb\r\n", range)),
    old.hashText(old.rangeText("a\r\nb\r\n", range)),
  );
  assert.equal(rangeText("", { startLine: 1, endLine: 1 }), null);
  assert.equal(rangeText("a\n", { startLine: 2, endLine: 2 }), null);
});

test("optional metadata remains unchanged and is not treated as validated", () => {
  const input = plan();
  input.id = 42;
  input.title = { label: "unchecked" };
  input.stops[0].type = false;
  input.stops[0].coveredEntityIds = "unchecked";
  const result = validateTourPlan(input, options);
  assert.equal(result.ok, true);
  assert.equal(result.plan.id, 42);
  assert.deepEqual(result.plan.title, input.title);
  assert.equal(result.plan.stops[0].type, false);
  assert.equal(result.plan.stops[0].coveredEntityIds, "unchecked");
});
