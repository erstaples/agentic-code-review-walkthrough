import type { TestContext } from "node:test";
import type { Selection } from "../../generated/mcp/lib/review-map/types.js";
import { errorFields } from "../../generated/mcp/lib/input.js";
import { record, records, openedMap, findings } from "../../test/assertions.js";

import { test } from "node:test";
import * as assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { ReviewMapService } from "../../generated/mcp/lib/review-map/service.js";
import { tourSources } from "../../generated/shared/tour-sources.js";
import { createDispatcher } from "../../generated/mcp/lib/rpc.js";
import { TOOLS, createCallTool } from "../../generated/mcp/lib/tools.js";
import { hashText } from "../../generated/shared/tour.js";

const actor = { kind: "agent", id: "test" };
const provenance = [{ kind: "execution-observed", source: { type: "test" } }];
function fixture(
  t: TestContext,
  serviceOptions: ConstructorParameters<typeof ReviewMapService>[0] = {},
) {
  const root = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "kanko-tour-contract-")),
  );
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const workspace = path.join(root, "repo");
  fs.mkdirSync(workspace);
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", workspace, ...args], {
      encoding: "utf8",
    }).trim();
  const write = (name: string, value: string | Buffer) =>
    fs.writeFileSync(path.join(workspace, name), value);
  git("init", "-q");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  write("feature.txt", "before\nshared\nthird\n");
  write("deleted.txt", "removed\n");
  write("old.txt", "renamed\n");
  write("Makefile", "all:\n");
  git("add", ".");
  git("commit", "-qm", "base");
  const base = git("rev-parse", "HEAD");
  write("feature.txt", "after\nshared\nthird\n");
  write("added.txt", "added\n");
  git("rm", "deleted.txt");
  git("mv", "old.txt", "new.txt");
  git("add", ".");
  git("commit", "-qm", "head");
  const head = git("rev-parse", "HEAD");
  const stateRoot = path.join(root, "state");
  const service = new ReviewMapService({ root: stateRoot, ...serviceOptions });
  return { root, workspace, git, write, base, head, stateRoot, service };
}
const open = (
  f: ReturnType<typeof fixture>,
  selection: Selection = { kind: "committed", base: f.base, head: f.head },
) => openedMap(f.service.open({ workspace: f.workspace, selection, actor }));
const apply = (
  f: ReturnType<typeof fixture>,
  opened: ReturnType<typeof open>,
  commands: unknown[],
  expectedRevision = opened.aggregateRevision,
) =>
  f.service.apply({
    workspace: f.workspace,
    mapId: opened.mapId,
    expectedRevision,
    actor,
    commands,
  });
const getTour = (
  f: ReturnType<typeof fixture>,
  opened: ReturnType<typeof open>,
) =>
  f.service.get({
    workspace: f.workspace,
    mapId: opened.mapId,
    selector: { kind: "tour" },
  }).plan;
function anchor(
  f: ReturnType<typeof fixture>,
  data: Record<string, unknown> = {},
) {
  return {
    n: 1,
    role: "change",
    label: "Behavior",
    path: "feature.txt",
    view: "diff",
    change: "modified",
    rev: { base: f.base, head: f.head },
    context: { startLine: 1, endLine: 1 },
    contentHash: hashText("after"),
    ...data,
  };
}
function command(anchors: ReturnType<typeof anchor>[]) {
  return {
    type: "CreateTourPlan",
    presentationVersion: 2,
    stops: [
      {
        id: "stop1",
        title: "Behavior",
        type: "context",
        risk: "low",
        anchors,
        beats: [{ id: "beat1", narration: "Inspect {{a:1}}.", active: [1] }],
      },
    ],
  };
}

test("source-backed tours survive restart with additions, deletions, renames, and base focus", (t) => {
  const f = fixture(t);
  const opened = open(f);
  const cmd = command([
    anchor(f, {
      focus: [
        {
          side: "base",
          range: { startLine: 1, endLine: 1 },
          contentHash: hashText("before"),
        },
      ],
    }),
    anchor(f, {
      n: 2,
      path: "added.txt",
      view: "head",
      change: "added",
      contentHash: hashText("added"),
    }),
    anchor(f, {
      n: 3,
      path: "deleted.txt",
      view: "base",
      change: "deleted",
      contentHash: hashText("removed"),
    }),
    anchor(f, {
      n: 4,
      path: "new.txt",
      view: "diff",
      change: "unchanged",
      contentHash: hashText("renamed"),
    }),
  ]);
  apply(f, opened, [cmd]);
  const stored = getTour(f, opened);
  f.service = new ReviewMapService({ root: f.stateRoot });
  assert.deepEqual(getTour(f, opened), stored);
  assert.ok(stored);
  assert.equal(stored.presentationVersion, 2);
  assert.equal(stored.version, 1);
  assert.equal(stored.stops[0].anchors[2].side, "base");
  assert.equal(
    f.service.check({ workspace: f.workspace, mapId: opened.mapId }).ok,
    true,
  );
  f.write("feature.txt", "unrelated working edits\n");
  assert.equal(
    f.service.check({ workspace: f.workspace, mapId: opened.mapId }).ok,
    true,
  );
});

test("invalid tour rejects an entire command batch and does not navigate the editor", async (t) => {
  const f = fixture(t);
  const opened = open(f);
  let editorRequests = 0;
  const dispatcher = createDispatcher({
    serverInfo: { name: "kanko", version: "test" },
    tools: TOOLS,
    callTool: createCallTool({
      mapService: f.service,
      resolveLock: () => {
        editorRequests++;
        throw new Error("Unexpected editor access");
      },
    }),
  });
  const result = await dispatcher.handle({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "kanko_map_apply",
      arguments: {
        workspace: f.workspace,
        mapId: opened.mapId,
        expectedRevision: opened.aggregateRevision,
        actor,
        commands: [
          {
            type: "AddClaim",
            entity: { statement: "Must not be persisted", provenance },
          },
          command([anchor(f, { path: "missing.txt" })]),
        ],
      },
    },
  });
  assert.ok(result && "result" in result && "content" in result.result);
  assert.equal(result.result.isError, true);
  const failure = record(JSON.parse(result.result.content[0].text));
  assert.equal(failure.code, "invalid_tour_plan");
  assert.ok(
    records(record(failure.details).findings).some(
      (finding) => finding.code === "range_out_of_bounds",
    ),
  );
  assert.equal(editorRequests, 0);
  const state = f.service.get({
    workspace: f.workspace,
    mapId: opened.mapId,
    selector: { kind: "overview" },
  });
  assert.equal(state.aggregateRevision, 1);
  assert.equal(state.counts.claims, 0);
  assert.equal(getTour(f, opened), null);
});

test("normalized tour plans persist rewritten anchor references", (t) => {
  const f = fixture(t);
  const opened = open(f);
  const cmd = command([
    anchor(f),
    anchor(f, {
      n: 2,
      context: { startLine: 1, endLine: 2 },
      contentHash: hashText("after\nshared"),
    }),
  ]);
  cmd.stops[0].beats[0] = {
    id: "b",
    narration: "Compare {{a:2}} to {{a:1}}.",
    active: [2, 1],
  };
  const result = apply(f, opened, [cmd]);
  assert.ok(
    result.findings.some((finding) => finding.code === "overlapping_anchors"),
  );
  const current = getTour(f, opened);
  assert.ok(current);
  assert.equal(current.stops[0].anchors.length, 1);
  assert.deepEqual(current.stops[0].beats[0].active, [1]);
  f.service = new ReviewMapService({ root: f.stateRoot });
  assert.deepEqual(getTour(f, opened), current);
  assert.equal(
    f.service.check({ workspace: f.workspace, mapId: opened.mapId })
      .eventChainValid,
    true,
  );
});

test("unversioned and incomplete plans cannot bypass authoring validation", (t) => {
  const f = fixture(t);
  const opened = open(f);
  const unversioned = command([anchor(f)]);
  Reflect.deleteProperty(unversioned, "presentationVersion");
  const metadataOnly = {
    type: "CreateTourPlan",
    stops: [{ type: "context", title: "Incomplete" }],
  };
  for (const cmd of [
    unversioned,
    metadataOnly,
    { ...metadataOnly, presentationVersion: 2 },
  ]) {
    assert.throws(
      () => apply(f, opened, [cmd]),
      (e) =>
        errorFields(e).code === "invalid_tour_plan" && findings(e).length > 0,
    );
  }
  assert.equal(getTour(f, opened), null);
  assert.equal(
    f.service.get({
      workspace: f.workspace,
      mapId: opened.mapId,
      selector: { kind: "overview" },
    }).aggregateRevision,
    1,
  );
});

test("checking a stored plan always validates its version and required fields", (t) => {
  const f = fixture(t);
  const opened = open(f);
  apply(f, opened, [command([anchor(f)])]);
  const located = f.service.locate(f.workspace, opened.mapId);
  const stored = located.state.tourPlans[located.state.currentTourPlanId || ""];
  Reflect.deleteProperty(stored, "presentationVersion");
  Reflect.deleteProperty(stored.stops[0], "anchors");
  // Inject an invalid projection to test the read boundary independently of
  // authoring, which already prevents storing this shape.
  f.service.locate = () => located;
  const result = f.service.check({
    workspace: f.workspace,
    mapId: opened.mapId,
  });
  assert.equal(result.ok, false);
  assert.ok(result.findings.some((f) => f.code === "unsupported_version"));
  assert.ok(result.findings.some((f) => f.code === "invalid_anchors"));
});

test("staged-only tours bind index blobs and ignore unstaged bytes", (t) => {
  const f = fixture(t);
  f.write("feature.txt", "staged\n");
  f.git("add", "feature.txt");
  f.write("feature.txt", "unstaged\n");
  const opened = open(f, {
    kind: "working-tree",
    baseline: f.head,
    includeUnstaged: false,
    includeUntracked: false,
  });
  const rev = tourSources(f.workspace, opened.changeRevision).revisions;
  assert.match(rev.head, /^WORKTREE:sha256:/);
  apply(f, opened, [
    command([anchor(f, { rev, contentHash: hashText("staged") })]),
  ]);
  f.write("feature.txt", "more unstaged bytes\n");
  assert.equal(
    f.service.check({ workspace: f.workspace, mapId: opened.mapId }).ok,
    true,
  );
});

test("working-tree tours reject drift before storage and report stale hashes on check", (t) => {
  const f = fixture(t);
  f.write("feature.txt", "working\n");
  f.write("untracked.txt", "new\n");
  const opened = open(f, { kind: "working-tree", baseline: f.head });
  const rev = tourSources(f.workspace, opened.changeRevision).revisions;
  const cmd = command([
    anchor(f, { rev, contentHash: hashText("working") }),
    anchor(f, {
      n: 2,
      path: "untracked.txt",
      rev,
      view: "head",
      change: "added",
      contentHash: hashText("new"),
    }),
  ]);
  const result = apply(f, opened, [cmd]);
  f.write("feature.txt", "changed again\n");
  assert.throws(
    () => apply(f, opened, [cmd], result.aggregateRevision),
    (e) => errorFields(e).code === "stale_change",
  );
  const check = f.service.check({
    workspace: f.workspace,
    mapId: opened.mapId,
  });
  assert.equal(check.ok, false);
  assert.equal(check.freshness, "stale");
  assert.ok(
    check.findings.some((finding) => finding.code === "source_unavailable"),
  );
});

test("selected working renames remove the old head path and preserve base coordinates", (t) => {
  const f = fixture(t);
  f.git("mv", "feature.txt", "moved.txt");
  const opened = open(f, { kind: "working-tree", baseline: f.head });
  const source = tourSources(f.workspace, opened.changeRevision);
  const moved = source.readSource(
    anchor(f, { path: "moved.txt", rev: source.revisions }),
  );
  assert.equal(moved.base, "after\nshared\nthird\n");
  assert.equal(moved.head, moved.base);
  const old = source.readSource(anchor(f, { rev: source.revisions }));
  assert.equal(old.head, null);
});

test("source readers reject escaped symlink parents and binary sources", (t) => {
  const f = fixture(t);
  const outside = path.join(f.root, "outside");
  fs.mkdirSync(outside);
  fs.writeFileSync(path.join(outside, "secret.txt"), "secret\n");
  fs.symlinkSync(outside, path.join(f.workspace, "escape"));
  f.write("binary.txt", Buffer.from([0, 1, 2]));
  f.git("add", "binary.txt");
  f.git("commit", "-qm", "binary");
  const opened = open(f, {
    kind: "committed",
    base: f.base,
    head: f.git("rev-parse", "HEAD"),
  });
  const source = tourSources(f.workspace, opened.changeRevision);
  assert.throws(
    () =>
      source.readSource(
        anchor(f, { rev: source.revisions, path: "binary.txt" }),
      ),
    (e) => errorFields(e).code === "binary_anchor",
  );
  const fakeWorking = structuredClone(opened.changeRevision);
  fakeWorking.manifest = {
    kind: "working-tree",
    baselineCommit: f.base,
    currentHead: f.head,
    files: [
      {
        path: "escape/secret.txt",
        untracked: true,
        working: { digest: hashText("secret\n") },
      },
    ],
  };
  const reader = tourSources(f.workspace, fakeWorking);
  assert.throws(
    () =>
      reader.readSource(
        anchor(f, { path: "escape/secret.txt", rev: reader.revisions }),
      ),
    (e) => errorFields(e).code === "path_outside_workspace",
  );
});

test("source validation rejects wrong revisions, EOF ranges, and raw catalog paths", (t) => {
  const f = fixture(t);
  const opened = open(f);
  for (const [data, code] of [
    [{ rev: { base: f.base, head: "HEAD" } }, "revision_mismatch"],
    [{ context: { startLine: 4, endLine: 4 } }, "range_out_of_bounds"],
    [
      { focus: [{ side: "base", range: { startLine: 4, endLine: 4 } }] },
      "range_out_of_bounds",
    ],
  ] as [Record<string, unknown>, string][])
    assert.throws(
      () => apply(f, opened, [command([anchor(f, data)])]),
      (e) => findings(e).some((finding) => finding.code === code),
    );
  const cmd = command([anchor(f)]);
  cmd.stops[0].beats[0].narration = "Inspect Makefile.";
  assert.throws(
    () => apply(f, opened, [cmd]),
    (e) => findings(e).some((finding) => finding.code === "raw_path"),
  );
});

test("observed claim warnings use the staged command state and existing claim ids", (t) => {
  const f = fixture(t);
  const opened = open(f);
  const add = {
    type: "AddClaim",
    entity: {
      id: "claim1",
      statement: "The source supports this",
      truthStatus: "observed",
      provenance,
    },
  };
  const result = apply(f, opened, [add, command([anchor(f)])]);
  assert.ok(
    result.findings.some(
      (finding) => finding.code === "observed_without_evidence",
    ),
  );
  const supported = apply(
    f,
    opened,
    [command([anchor(f, { role: "evidence", claimRefs: ["claim1"] })])],
    result.aggregateRevision,
  );
  assert.deepEqual(supported.findings, []);
});

test("load resolves a current plan without mutating the review map and rejects missing or stale plans", (t) => {
  const f = fixture(t);
  f.write("feature.txt", "working\n");
  const opened = open(f, { kind: "working-tree", baseline: f.head });
  const args = { workspace: f.workspace, mapId: opened.mapId };
  assert.throws(
    () => f.service.loadTour(args),
    (e) => errorFields(e).code === "invalid_tour_plan",
  );
  const rev = tourSources(f.workspace, opened.changeRevision).revisions;
  const saved = apply(f, opened, [
    command([anchor(f, { rev, contentHash: hashText("working") })]),
  ]);
  const loaded = f.service.loadTour(args);
  assert.equal(loaded.tourId, opened.mapId);
  assert.equal(loaded.plan.stops[0].beats[0].id, "beat1");
  assert.equal(
    f.service.get({ ...args, selector: { kind: "overview" } })
      .aggregateRevision,
    saved.aggregateRevision,
  );
  f.write("feature.txt", "drift\n");
  assert.throws(
    () => f.service.loadTour(args),
    (e) => errorFields(e).code === "stale_change",
  );
});
