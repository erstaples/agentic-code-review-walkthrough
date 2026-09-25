"use strict";

const { canonicalize, digest, id } = require("./canonical.js");
const { invariant } = require("./errors.js");
const { PRODUCER_VERSION, SCHEMA_VERSION } = require("./domain.js");
const { renderNarration } = require("../../../generated/shared/narration.js");

function sortedValues(collection) {
  return Object.values(collection)
    .filter((item) => item.status !== "redacted")
    .sort((a, b) => a.id.localeCompare(b.id));
}

function buildReceipt(state, sessionId, options = {}) {
  const session = state.reviewSessions[sessionId];
  invariant(session, "session_not_found", `session not found: ${sessionId}`);
  const change = state.changeRevisions.find(
    (item) => item.id === session.changeRevisionId,
  );
  invariant(
    change,
    "change_revision_not_found",
    `change revision not found: ${session.changeRevisionId}`,
  );
  const plan = state.tourPlans[session.tourPlanId];
  const previous = state.receipts.at(-1) || null;
  const receipt = {
    schemaVersion: SCHEMA_VERSION,
    producerVersion: PRODUCER_VERSION,
    id: options.receiptId || id("rcp"),
    mapId: state.id,
    reviewSessionId: session.id,
    changeRevisionId: change.id,
    changeIdentity: {
      kind: change.kind,
      labels: change.labels,
      manifestDigest: change.manifestDigest,
    },
    aggregateRevision: state.aggregateRevision,
    eventHash: state.lastEventHash,
    createdAt: options.createdAt || new Date().toISOString(),
    supersedesReceiptId: options.supersedesReceiptId || previous?.id || null,
    thesis: state.thesis,
    outcome: session.outcome,
    claims: sortedValues(state.entities.claims).map(
      ({ id, statement, category, disposition, evidenceRefs, provenance }) => ({
        id,
        statement,
        category: category || "other",
        disposition,
        evidenceRefs: evidenceRefs || [],
        provenance,
      }),
    ),
    risks: sortedValues(state.entities.risks).map(
      ({ id, concern, statement, impact, disposition, mitigation }) => ({
        id,
        statement: concern || statement,
        impact: impact || "unknown",
        disposition,
        mitigation: mitigation || null,
      }),
    ),
    evidence: sortedValues(state.entities.evidence).map(
      ({ id, observation, result, freshness, limitations }) => ({
        id,
        observation,
        result: result || "unknown",
        freshness,
        limitations: limitations || [],
      }),
    ),
    stops: [...(plan?.stops || [])]
      .sort((a, b) => a.index - b.index)
      .map(
        ({
          id,
          title,
          type,
          reviewState,
          reviewedAtChangeRevisionId,
          anchors,
          beats,
        }) => ({
          id,
          title,
          type,
          reviewState,
          reviewedAtChangeRevisionId,
          beats: beats.map((beat) => ({
            id: beat.id,
            narration: renderNarration(beat.narration, anchors, "receipt"),
          })),
        }),
      ),
    questions: [
      ...sortedValues(state.entities.questions),
      ...sortedValues(state.entities.concerns),
    ]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(({ id, entityType, question, concern, disposition, answers }) => ({
        id,
        type: entityType,
        text: question || concern,
        disposition,
        answers: answers || [],
      })),
  };
  return { ...receipt, digest: digest(receipt) };
}

function section(title, rows, empty = "None.") {
  return `## ${title}\n\n${rows.length ? rows.join("\n") : empty}\n`;
}
function escapeCell(value) {
  return String(value ?? "")
    .replace(/\|/g, "\\|")
    .replace(/\n/g, " ");
}

function renderMarkdown(receipt) {
  const lines = [
    `# Review receipt: ${receipt.thesis?.summary || receipt.mapId}`,
    "",
    `- Receipt: \`${receipt.id}\``,
    `- Change: \`${receipt.changeIdentity.manifestDigest}\``,
    `- Outcome: **${receipt.outcome || "not chosen"}**`,
    `- Created: ${receipt.createdAt}`,
    `- Review map revision: ${receipt.aggregateRevision}`,
    "",
    section("Thesis", [receipt.thesis?.summary || "No thesis recorded."]),
    section("Claims", [
      "| Claim | Disposition |",
      "|---|---|",
      ...receipt.claims.map(
        (item) => `| ${escapeCell(item.statement)} | ${item.disposition} |`,
      ),
    ]),
    section("Risks", [
      "| Risk | Disposition |",
      "|---|---|",
      ...receipt.risks.map(
        (item) => `| ${escapeCell(item.statement)} | ${item.disposition} |`,
      ),
    ]),
    section("Evidence", [
      "| Observation | Freshness | Result |",
      "|---|---|---|",
      ...receipt.evidence.map(
        (item) =>
          `| ${escapeCell(item.observation)} | ${item.freshness} | ${item.result} |`,
      ),
    ]),
    section("Coverage", [
      "| Stop | State |",
      "|---|---|",
      ...receipt.stops.map(
        (item) => `| ${escapeCell(item.title)} | ${item.reviewState} |`,
      ),
    ]),
    section(
      "Tour narration",
      receipt.stops.flatMap((stop) => [
        `### ${stop.title}\n`,
        ...stop.beats.map((beat) => `${beat.narration}\n`),
      ]),
    ),
    section(
      "Questions and concerns",
      receipt.questions.map(
        (item) => `- **${item.disposition}:** ${item.text}`,
      ),
    ),
    `Receipt digest: \`${receipt.digest}\``,
    "",
  ];
  return lines.join("\n");
}

module.exports = { buildReceipt, renderMarkdown, canonicalize };
