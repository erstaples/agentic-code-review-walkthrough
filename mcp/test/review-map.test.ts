import { errorFields } from "../../generated/mcp/lib/input.js";
import {
  record,
  records,
  string,
  openedMap,
  findings,
} from "../../test/assertions.js";

import { test } from "node:test";
import * as assert from "node:assert";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import {
  ReviewMapService,
  redactSensitive,
} from "../../generated/mcp/lib/review-map/service.js";
import { FileReviewMapStore } from "../../generated/mcp/lib/review-map/file-store.js";
import {
  resolveChange,
  repositoryIdentity,
} from "../../generated/mcp/lib/review-map/git-adapter.js";
import { tourSources } from "../../generated/shared/tour-sources.js";
import { hashText } from "../../generated/shared/tour.js";

const actor = { kind: "agent", id: "test-agent" };
const provenance = [
  {
    kind: "model-inferred",
    source: { type: "code-inspection", path: "feature.txt" },
    inferenceExplanation: "Observed in the diff.",
  },
];

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kanko-review-map-test-"));
  const workspace = path.join(root, "repo");
  const stateRoot = path.join(root, "state");
  fs.mkdirSync(workspace);
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", workspace, ...args], {
      encoding: "utf8",
    }).trim();
  git("init", "-q");
  git("config", "user.email", "test@example.com");
  git("config", "user.name", "Test");
  fs.writeFileSync(path.join(workspace, "feature.txt"), "before\n");
  git("add", ".");
  git("commit", "-qm", "base");
  const base = git("rev-parse", "HEAD");
  fs.writeFileSync(path.join(workspace, "feature.txt"), "after\n");
  git("commit", "-qam", "change");
  const head = git("rev-parse", "HEAD");
  return {
    root,
    workspace,
    stateRoot,
    git,
    base,
    head,
    service: new ReviewMapService({ root: stateRoot }),
  };
}

function open(f: ReturnType<typeof fixture>) {
  return openedMap(
    f.service.open({
      workspace: f.workspace,
      selection: { kind: "committed", base: f.base, head: f.head },
      actor,
      title: "Test change",
    }),
  );
}

function prepare(
  f: ReturnType<typeof fixture>,
  opened: ReturnType<typeof open>,
) {
  let result = f.service.apply({
    workspace: f.workspace,
    mapId: opened.mapId,
    expectedRevision: opened.aggregateRevision,
    actor,
    commands: [
      {
        type: "SetThesis",
        thesis: { summary: "Change the feature behavior.", provenance },
      },
      {
        type: "AddClaim",
        claim: {
          statement: "The feature now says after.",
          category: "behavior",
          provenance,
        },
      },
    ],
  });
  const claim = f.service.get({
    workspace: f.workspace,
    mapId: opened.mapId,
    selector: { kind: "entities", type: "claims" },
  }).entities[0];
  const source = tourSources(f.workspace, opened.changeRevision);
  const anchor = {
    contentHash: hashText(""),
    n: 1,
    role: "change",
    label: "Feature behavior",
    path: "feature.txt",
    view: "diff",
    change: "modified",
    rev: source.revisions,
    context: { startLine: 1, endLine: 1 },
  };
  anchor.contentHash = hashText(
    string(source.readSource(anchor).head).split("\n")[0],
  );
  result = f.service.apply({
    workspace: f.workspace,
    mapId: opened.mapId,
    expectedRevision: result.aggregateRevision,
    actor,
    commands: [
      {
        type: "CreateTourPlan",
        presentationVersion: 2,
        title: "Feature tour",
        stops: [
          {
            id: "behavior",
            title: "Behavior",
            risk: "low",
            type: "implementation",
            coveredEntityIds: [claim.id],
            anchors: [anchor],
            beats: [
              { id: "inspect", narration: "Inspect {{a:1}}.", active: [1] },
            ],
          },
        ],
      },
      { type: "MarkPrepared" },
      {
        type: "StartReviewSession",
        reviewer: { kind: "reviewer", id: "human" },
      },
    ],
  });
  const tour = f.service.get({
    workspace: f.workspace,
    mapId: opened.mapId,
    selector: { kind: "tour" },
  });
  assert.ok(tour.plan);
  return { result, claim, session: tour.sessions[0], stop: tour.plan.stops[0] };
}

test("a committed review map survives service restart with a verified event chain", () => {
  const f = fixture();
  const opened = open(f);
  const prepared = prepare(f, opened);
  const restarted = new ReviewMapService({ root: f.stateRoot });
  const overview = restarted.get({
    workspace: f.workspace,
    mapId: opened.mapId,
    selector: { kind: "overview" },
  });
  assert.strictEqual(overview.phase, "prepared");
  assert.strictEqual(
    overview.aggregateRevision,
    prepared.result.aggregateRevision,
  );
  const checked = restarted.check({
    workspace: f.workspace,
    mapId: opened.mapId,
  });
  assert.strictEqual(checked.eventChainValid, true);
  assert.strictEqual(checked.schemaValid, true);
});

test("optimistic aggregate revisions reject stale writers", () => {
  const f = fixture();
  const opened = open(f);
  f.service.apply({
    workspace: f.workspace,
    mapId: opened.mapId,
    expectedRevision: 1,
    actor,
    commands: [{ type: "SetThesis", thesis: { summary: "A", provenance } }],
  });
  assert.throws(
    () =>
      f.service.apply({
        workspace: f.workspace,
        mapId: opened.mapId,
        expectedRevision: 1,
        actor,
        commands: [{ type: "SetThesis", thesis: { summary: "B", provenance } }],
      }),
    (error) =>
      errorFields(error).code === "revision_conflict" &&
      record(errorFields(error).details).currentRevision === 2,
  );
});

test("working-tree byte changes are detected before review state is written", () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.workspace, "feature.txt"), "dirty one\n");
  const opened = f.service.open({
    workspace: f.workspace,
    selection: { kind: "working-tree" },
    actor,
    title: "Dirty change",
  });
  assert.ok("mapId" in opened);
  const prepared = prepare(f, opened);
  fs.writeFileSync(path.join(f.workspace, "feature.txt"), "dirty two\n");
  assert.strictEqual(
    f.service.check({ workspace: f.workspace, mapId: opened.mapId }).freshness,
    "stale",
  );
  assert.throws(
    () =>
      f.service.apply({
        workspace: f.workspace,
        mapId: opened.mapId,
        expectedRevision: prepared.result.aggregateRevision,
        actor,
        commands: [
          {
            type: "StartStop",
            sessionId: prepared.session.id,
            stopId: prepared.stop.id,
          },
        ],
      }),
    (error) => errorFields(error).code === "stale_change",
  );
});

test("refresh preserves history while invalidating review and evidence conservatively", () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.workspace, "feature.txt"), "dirty one\n");
  const opened = f.service.open({
    workspace: f.workspace,
    selection: { kind: "working-tree" },
    actor,
    title: "Dirty change",
  });
  assert.ok("mapId" in opened);
  let prepared = prepare(f, opened);
  let result = f.service.apply({
    workspace: f.workspace,
    mapId: opened.mapId,
    expectedRevision: prepared.result.aggregateRevision,
    actor,
    commands: [
      {
        type: "AddEvidence",
        evidence: {
          observation: "Manual inspection matched the claim.",
          freshness: "current",
          provenance,
        },
      },
      {
        type: "StartStop",
        sessionId: prepared.session.id,
        stopId: prepared.stop.id,
      },
      {
        type: "SetStopReviewState",
        sessionId: prepared.session.id,
        stopId: prepared.stop.id,
        reviewState: "reviewed",
      },
    ],
  });
  fs.writeFileSync(path.join(f.workspace, "feature.txt"), "dirty two\n");
  const refreshed = f.service.refresh({
    workspace: f.workspace,
    mapId: opened.mapId,
    expectedRevision: result.aggregateRevision,
    selection: { kind: "working-tree" },
    actor,
  });
  assert.strictEqual(refreshed.changed, true);
  assert.ok(refreshed.invalidationPlan);
  assert.deepStrictEqual(refreshed.invalidationPlan.invalidatedStops, [
    prepared.stop.id,
  ]);
  assert.strictEqual(refreshed.invalidationPlan.staleEvidence.length, 1);
  const tour = f.service.get({
    workspace: f.workspace,
    mapId: opened.mapId,
    selector: { kind: "tour" },
  });
  assert.strictEqual(tour.plan.stops[0].reviewState, "invalidated");
});

test("completed review emits immutable JSON and Markdown receipts", () => {
  const f = fixture();
  const opened = open(f);
  const prepared = prepare(f, opened);
  const result = f.service.apply({
    workspace: f.workspace,
    mapId: opened.mapId,
    expectedRevision: prepared.result.aggregateRevision,
    actor,
    commands: [
      {
        type: "StartStop",
        sessionId: prepared.session.id,
        stopId: prepared.stop.id,
      },
      {
        type: "SetStopReviewState",
        sessionId: prepared.session.id,
        stopId: prepared.stop.id,
        reviewState: "reviewed",
      },
      {
        type: "CompleteReviewSession",
        sessionId: prepared.session.id,
        outcome: "ready-to-approve",
      },
    ],
  });
  const preview = f.service.receipt({
    workspace: f.workspace,
    mapId: opened.mapId,
    sessionId: prepared.session.id,
    mode: "preview",
    actor,
  });
  assert.ok(preview.receipt && preview.markdown);
  assert.match(preview.markdown, /Outcome: \*\*ready-to-approve\*\*/);
  assert.match(preview.markdown, /## Tour narration/);
  assert.match(preview.receipt.stops[0].beats[0].narration, /① .+:1–1 @/);
  assert.doesNotMatch(preview.markdown, /\{\{a:/);
  const emitted = f.service.receipt({
    workspace: f.workspace,
    mapId: opened.mapId,
    sessionId: prepared.session.id,
    mode: "emit",
    expectedRevision: result.aggregateRevision,
    actor,
  });
  assert.ok(emitted.jsonPath && emitted.markdownPath);
  assert.ok(fs.existsSync(emitted.jsonPath));
  assert.ok(fs.existsSync(emitted.markdownPath));
  assert.throws(
    () => fs.openSync(emitted.jsonPath, "wx"),
    (error) => errorFields(error).code === "EEXIST",
  );
});

test("event corruption is detected instead of silently replayed", () => {
  const f = fixture();
  const opened = open(f);
  const store = new FileReviewMapStore({ root: f.stateRoot });
  const repositoryKey = repositoryIdentity(f.workspace).repositoryKey;
  const event = path.join(
    store.mapDir(repositoryKey, opened.mapId),
    "events",
    "000000000001.json",
  );
  const body = JSON.parse(fs.readFileSync(event, "utf8"));
  body.payload.title = "tampered";
  fs.writeFileSync(event, JSON.stringify(body));
  assert.throws(
    () => store.load(repositoryKey, opened.mapId),
    (error) => errorFields(error).code === "event_hash_invalid",
  );
});

test("staged-only identity ignores out-of-scope unstaged bytes", () => {
  const f = fixture();
  fs.writeFileSync(path.join(f.workspace, "feature.txt"), "staged\n");
  f.git("add", "feature.txt");
  const staged = resolveChange(f.workspace, {
    kind: "working-tree",
    includeStaged: true,
    includeUnstaged: false,
    includeUntracked: false,
  });
  fs.writeFileSync(
    path.join(f.workspace, "feature.txt"),
    "unstaged after index\n",
  );
  const stagedAgain = resolveChange(f.workspace, {
    kind: "working-tree",
    includeStaged: true,
    includeUnstaged: false,
    includeUntracked: false,
  });
  const all = resolveChange(f.workspace, { kind: "working-tree" });
  assert.strictEqual(stagedAgain.manifestDigest, staged.manifestDigest);
  assert.notStrictEqual(all.manifestDigest, staged.manifestDigest);
});

test("raw evidence is stored by digest and omitted from event JSON", () => {
  const f = fixture();
  const opened = open(f);
  const result = f.service.apply({
    workspace: f.workspace,
    mapId: opened.mapId,
    expectedRevision: 1,
    actor,
    commands: [
      {
        type: "AddEvidence",
        evidence: {
          observation: "A bounded test output.",
          rawOutput: "PASS secret-free output",
          provenance,
        },
      },
    ],
  });
  assert.match(result.warnings.join(" "), /evidence blob/);
  const evidence = f.service.get({
    workspace: f.workspace,
    mapId: opened.mapId,
    selector: { kind: "entities", type: "evidence" },
  }).entities[0];
  assert.match(string(record(evidence.blobRef).digest), /^sha256:/);
  assert.strictEqual(evidence.rawOutput, undefined);
  const repositoryKey = repositoryIdentity(f.workspace).repositoryKey;
  const eventPath = path.join(
    new FileReviewMapStore({ root: f.stateRoot }).mapDir(
      repositoryKey,
      opened.mapId,
    ),
    "events",
    "000000000002.json",
  );
  assert.doesNotMatch(
    fs.readFileSync(eventPath, "utf8"),
    /PASS secret-free output/,
  );
});

test("code references are resolved to exact revisions and content digests", () => {
  const f = fixture();
  const opened = open(f);
  f.service.apply({
    workspace: f.workspace,
    mapId: opened.mapId,
    expectedRevision: 1,
    actor,
    commands: [
      {
        type: "AddCodeReference",
        codeReference: {
          path: "feature.txt",
          side: "head",
          startLine: 1,
          endLine: 1,
          provenance,
        },
      },
    ],
  });
  const reference = f.service.get({
    workspace: f.workspace,
    mapId: opened.mapId,
    selector: { kind: "entities", type: "codeReferences" },
  }).entities[0];
  assert.strictEqual(reference.revision, f.head);
  assert.match(string(reference.contentDigest), /^sha256:[0-9a-f]{64}$/);
  assert.strictEqual(reference.changeRevisionId, opened.changeRevision.id);
});

test("material review questions use the RecordQuestion command vocabulary", () => {
  const f = fixture();
  const opened = open(f);
  const prepared = prepare(f, opened);
  f.service.apply({
    workspace: f.workspace,
    mapId: opened.mapId,
    expectedRevision: prepared.result.aggregateRevision,
    actor,
    commands: [
      {
        type: "RecordQuestion",
        question: {
          question: "Does this preserve compatibility?",
          relatedEntityIds: [prepared.claim.id],
          provenance: [
            {
              kind: "reviewer-stated",
              source: { type: "review-session", id: prepared.session.id },
            },
          ],
        },
      },
    ],
  });
  const openItems = f.service.get({
    workspace: f.workspace,
    mapId: opened.mapId,
    selector: { kind: "open-items" },
  });
  assert.strictEqual(
    openItems.questions[0].question,
    "Does this preserve compatibility?",
  );
  assert.strictEqual(openItems.questions[0].disposition, "open");
});

test("secret-shaped command content is redacted before persistence", () => {
  const sample = {
    token: "abc",
    note: "Authorization: Bearer abc.def.ghi",
    key: "AKIA1234567890ABCDEF",
  };
  const result = redactSensitive(sample);
  assert.strictEqual(result.redacted, true);
  assert.strictEqual(record(result.value).token, "[REDACTED]");
  assert.doesNotMatch(JSON.stringify(result.value), /abc\.def|AKIA123/);
});

test("review map deletion requires exact confirmation and is narrowly scoped", () => {
  const f = fixture();
  const opened = open(f);
  assert.throws(
    () =>
      f.service.delete({
        workspace: f.workspace,
        mapId: opened.mapId,
        confirmMapId: "map_00000000-0000-0000-0000-000000000000",
        actor,
      }),
    (error) => errorFields(error).code === "confirmation_required",
  );
  assert.deepStrictEqual(
    f.service.delete({
      workspace: f.workspace,
      mapId: opened.mapId,
      confirmMapId: opened.mapId,
      actor,
    }),
    { deleted: true, mapId: opened.mapId, recoverable: false },
  );
  assert.throws(
    () =>
      f.service.get({
        workspace: f.workspace,
        mapId: opened.mapId,
        selector: { kind: "overview" },
      }),
    (error) => errorFields(error).code === "map_not_found",
  );
});

test("forceNew separates distinct tasks that begin from the same working tree", () => {
  const f = fixture();
  const selection = { kind: "working-tree" };
  const first = f.service.open({
    workspace: f.workspace,
    selection,
    actor,
    title: "First task",
  });
  assert.ok("mapId" in first);
  const reused = f.service.open({
    workspace: f.workspace,
    selection,
    actor,
    title: "Second task",
  });
  assert.ok("mapId" in reused);
  assert.strictEqual(reused.mapId, first.mapId);
  const second = f.service.open({
    workspace: f.workspace,
    selection,
    actor,
    title: "Second task",
    forceNew: true,
  });
  assert.ok("mapId" in second);
  assert.notStrictEqual(second.mapId, first.mapId);
});
