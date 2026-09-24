"use strict";

// Terminal rendering shared by the e2e runner and the review simulator: tool
// result summaries and the headless editor's view of highlighted code.

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => (tty ? `\x1b[${code}m${s}\x1b[0m` : String(s));
const c = { dim: paint(2), bold: paint(1), red: paint(31), green: paint(32), yellow: paint(33), blue: paint(34), magenta: paint(35), cyan: paint(36) };

function indent(text, prefix = "    ") {
  return String(text).split("\n").map((line) => prefix + line).join("\n");
}

function summarize(call, result) {
  if (!result || typeof result !== "object") return String(result);
  if (call === "dossier_open") return `${result.dossierId} · phase ${result.phase} · next: ${result.requiredNextAction}`;
  if (call === "dossier_apply") return `rev ${result.aggregateRevision} · ${result.emittedEventIds?.length ?? 0} event(s)${result.warnings?.length ? ` · ${result.warnings.join(" ")}` : ""}`;
  if (call === "dossier_check") return `ok ${result.ok} · freshness ${result.freshness} · chain ${result.eventChainValid ? "valid" : "INVALID"}`;
  if (call === "dossier_refresh") return result.changed ? `rev ${result.aggregateRevision} · invalidated ${result.invalidationPlan.invalidatedStops.length} stop(s), ${result.invalidationPlan.staleEvidence.length} stale evidence` : "unchanged";
  if (call === "dossier_receipt") return result.mode === "emit" ? `emitted ${result.receiptId}\n${result.markdownPath}` : `preview:\n${result.markdown}`;
  if (call === "tour_status") return `${result.ideName} ${result.extensionVersion} · ${result.workspaceFolders?.join(", ")}`;
  if (call === "tour_stop") return `opened ${result.opened?.join(", ")}${result.deferred?.length ? ` · deferred ${JSON.stringify(result.deferred)}` : ""}`;
  if (call === "tour_focus") return `revealed ${result.revealed}`;
  if (call === "tour_clear") return "cleared";
  if (call === "dossier_get") {
    if (result.entities) return result.entities.map((e) => `${e.id}  ${e.statement || e.chosen || e.concern || e.observation || e.question || e.path || ""}`).join("\n") || "(none)";
    if (result.plan !== undefined) return [`plan: ${result.plan?.title ?? "(none)"}`, ...(result.plan?.stops || []).map((s) => `  ${s.index}. [${s.reviewState}] ${s.title} (${s.id})`), ...result.sessions.map((s) => `session ${s.id} · ${s.state}`)].join("\n");
    if (result.completedStops) return `completed ${result.completedStops.length} · remaining ${result.remainingStops.length} · open questions ${result.openItems.questions.length}, concerns ${result.openItems.concerns.length}, risks ${result.openItems.risks.length} · ${result.freshness}`;
    if (result.questions) return `open: ${result.questions.length} question(s), ${result.concerns.length} concern(s), ${result.risks.length} risk(s)`;
    if (result.phase) return `${result.title} · phase ${result.phase} · rev ${result.aggregateRevision} · stops ${JSON.stringify(result.stopStates)} · claims ${JSON.stringify(result.claimDispositions)}`;
  }
  return JSON.stringify(result);
}

function renderEditorEvent(event) {
  const code = (lines, from, to) => lines.map(({ line, text }) => {
    const hot = from === undefined || (line >= from && line <= to);
    const gutter = String(line).padStart(4);
    return hot ? `${c.magenta("▌")}${c.dim(gutter)}  ${text}` : ` ${c.dim(gutter)}  ${c.dim(text)}`;
  }).join("\n");
  if (event.kind === "stop") {
    const head = c.magenta(`  ┏ editor: stop ${event.index ?? "?"}/${event.total ?? "?"} · ${event.label} · ${event.type} · ${event.mode} mode`);
    const body = event.highlights.map((h) => `${c.cyan(`    ${h.path}`)} ${c.dim(`(${h.side}) ${h.startLine}-${h.endLine}`)}\n${indent(code(h.lines), "    ")}`);
    return [head, ...body].join("\n");
  }
  if (event.kind === "focus") {
    const note = event.note ? c.yellow(`  ◂ ${event.note}`) : "";
    return `${c.magenta("  ┣ editor: focus")} ${c.cyan(event.path)} ${c.dim(`(${event.side}) ${event.startLine}-${event.endLine}`)}${note}\n${indent(code(event.lines, event.startLine, event.endLine), "    ")}`;
  }
  if (event.kind === "clear") return c.magenta("  ┗ editor: highlights cleared");
  return "";
}

module.exports = { tty, c, indent, summarize, renderEditorEvent };
