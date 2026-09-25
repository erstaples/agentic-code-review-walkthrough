function snapshot(count = 7, overrides = {}) {
  const roles = [
    "change",
    "evidence",
    "caller",
    "callee",
    "config",
    "schema",
    "context",
  ];
  const anchors = Array.from({ length: count }, (_, i) => ({
    n: i + 1,
    role: roles[i % 7],
    path: `src/file-${i + 1}.ts`,
    label: `Source ${i + 1}`,
    view: "head",
    change: "added",
    rev: { base: "abcdef0123", head: "123456abcd" },
    context: { startLine: 1, endLine: 10 },
    contentHash: "sha256:test",
  }));
  const beat = { id: "first", narration: "Inspect {{a:1}}", active: [1] };
  return {
    loaded: true,
    revision: 1,
    tourId: "tour",
    title: "Review the change",
    mode: "following",
    stopIndex: 0,
    beatIndex: 0,
    stopCount: 2,
    beatCount: 2,
    selectedAnchor: null,
    findings: [],
    stop: {
      id: "stop",
      title: "Keep the sources visible",
      risk: "low",
      anchors,
      beats: [beat],
    },
    beat,
    presentation: {
      anchors: anchors.map((a) => ({
        n: a.n,
        path: a.path,
        status: a.n === 1 ? "visible" : "not-open",
        column: a.n === 1 ? 1 : null,
        source: "file",
        companionColumn: null,
        removedCode: null,
      })),
      layout: {
        shape: "single",
        cap: 3,
        customized: false,
        sequence: false,
        sequenceOverride: false,
        unplaced: [],
        slots: [{ slot: "top", column: 1, anchor: 1, pinned: false }],
        preferences: {},
        options: Object.fromEntries(
          anchors.map((a) => [
            a.n,
            [
              { kind: "auto" },
              { kind: "replace", of: 1, preview: [] },
              { kind: "below", of: 1, preview: [] },
              { kind: "peek" },
            ],
          ]),
        ),
      },
    },
    narrationHtml:
      '<p>Inspect <button class="chip color-1" data-anchor="1" aria-label="Inspect source one">1</button> &lt;img src=x onerror=alert(1)&gt;</p>',
    narration: "Inspect source one",
    receiptNarration: "Inspect source one",
    ...overrides,
  };
}
module.exports = { snapshot };
