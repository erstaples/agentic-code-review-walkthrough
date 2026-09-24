"use strict";

// Shared by record authoring and the future editor loader. No editor operations.
const { createHash } = require("node:crypto");
const ROLES = ["change", "evidence", "callee", "caller", "config", "schema", "context"];
const LIMITS = { recommended: 7, hard: 24, maximum: 99, active: 3 };
const hashText = (text) => `sha256:${createHash("sha256").update(text).digest("hex")}`;
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const nonempty = (value) => typeof value === "string" && value.trim().length > 0;
const validRange = (range) => object(range) && Number.isInteger(range.startLine) && Number.isInteger(range.endLine) && range.startLine > 0 && range.endLine >= range.startLine;
const validPath = (value) => nonempty(value) && !/[\\\x00-\x1f:]/.test(value) && !value.startsWith("/") && value.split("/").every((part) => part && part !== "." && part !== "..");
const validHash = (value) => typeof value === "string" && /^sha256:[0-9a-f]{64}$/.test(value);

function rangeText(text, range) {
  if (typeof text !== "string" || !validRange(range)) return null;
  // Match the existing presentation hash: LF separators, CR bytes preserved.
  const lines = text.split("\n");
  if (lines.at(-1) === "") lines.pop();
  return range.endLine > lines.length ? null : lines.slice(range.startLine - 1, range.endLine).join("\n");
}

function assertHardLimit(value = LIMITS.hard) {
  if (!Number.isInteger(value) || value < 1 || value > LIMITS.maximum) throw new RangeError("anchor hard limit must be an integer from 1 through 99");
  return value;
}

// readSource(anchor) returns {base: string|null, head: string|null} from a
// revision-pinned snapshot. It must throw on unresolvable revisions, not turn
// arbitrary read failures into absent files. All validation precedes normalization.
function validateTourPlan(input, options = {}) {
  const hardLimit = assertHardLimit(options.hardLimit);
  const findings = [];
  const add = (severity, code, location, message, extra = {}) => findings.push({ severity, code, location, message, ...extra });
  const error = (code, location, message) => add("error", code, location, message);
  if (!object(input) || !Array.isArray(input.stops) || !input.stops.length) {
    error("invalid_stops", "stops", "Provide at least one stop.");
    return { ok: false, plan: null, findings };
  }
  const plan = structuredClone(input);
  if (plan.presentationVersion !== 2) error("unsupported_version", "presentationVersion", "Tour plans require presentationVersion 2.");
  if (typeof options.readSource !== "function") error("source_reader_required", "stops", "Supply a revision-pinned source reader before accepting this tour.");
  const stopIds = new Set();
  const sources = new Map();
  const claims = options.claims || [];
  const knownClaims = new Set(claims.map((claim) => claim.id));
  for (const [si, stop] of plan.stops.entries()) {
    const loc = `stops[${si}]`;
    if (!object(stop)) { error("invalid_stop", loc, "A stop must be an object."); continue; }
    if (!nonempty(stop.id) || stopIds.has(stop.id)) error("invalid_stop_id", `${loc}.id`, "Provide a unique, non-empty stop id.");
    stopIds.add(stop.id);
    if (!nonempty(stop.title)) error("invalid_title", `${loc}.title`, "Provide a stop title.");
    if (!["low", "medium", "high"].includes(stop.risk)) error("invalid_risk", `${loc}.risk`, "Risk must be low, medium, or high.");
    if (!Array.isArray(stop.anchors) || !stop.anchors.length) { error("invalid_anchors", `${loc}.anchors`, "Provide at least one anchor."); continue; }
    if (stop.anchors.length > hardLimit) error("anchor_limit", `${loc}.anchors`, `This stop has ${stop.anchors.length} anchors; the configured maximum is ${hardLimit}. Split the stop.`);
    if (stop.anchors.length > LIMITS.recommended) add("warning", "anchor_budget", `${loc}.anchors`, `Prefer at most ${LIMITS.recommended} anchors per stop.`);
    for (const [ai, anchor] of stop.anchors.entries()) {
      const aloc = `${loc}.anchors[${ai}]`;
      const start = findings.filter((f) => f.severity === "error").length;
      if (!object(anchor)) { error("invalid_anchor", aloc, "An anchor must be an object."); continue; }
      if (anchor.n !== ai + 1) error("invalid_number", `${aloc}.n`, `Anchor numbers must follow array order; expected ${ai + 1}.`);
      if (!ROLES.includes(anchor.role)) error("invalid_role", `${aloc}.role`, `Choose a role: ${ROLES.join(", ")}.`);
      if (!nonempty(anchor.label) || anchor.label.trim().split(/\s+/).length > 5) error("invalid_label", `${aloc}.label`, "Provide a label of one to five words.");
      if (!validPath(anchor.path)) error("invalid_path", `${aloc}.path`, "Use a repository-relative path without traversal or backslashes.");
      if (!["diff", "head", "base"].includes(anchor.view)) error("invalid_view", `${aloc}.view`, "View must be diff, head, or base.");
      if (!["modified", "added", "deleted", "unchanged"].includes(anchor.change)) error("invalid_change", `${aloc}.change`, "Change must be modified, added, deleted, or unchanged.");
      if (!object(anchor.rev) || !nonempty(anchor.rev.base) || !nonempty(anchor.rev.head)) error("invalid_revision", `${aloc}.rev`, "Provide both base and head revision identities.");
      if (options.revisions && (anchor.rev?.base !== options.revisions.base || anchor.rev?.head !== options.revisions.head)) error("revision_mismatch", `${aloc}.rev`, "Use the record's pinned base and head revisions.");
      anchor.side ??= anchor.view === "base" || anchor.change === "deleted" ? "base" : "head";
      if (!["base", "head"].includes(anchor.side) || (anchor.view !== "diff" && anchor.view !== anchor.side)) error("invalid_side", `${aloc}.side`, "Context side must be base or head and agree with a single-side view.");
      if (!validRange(anchor.context)) error("invalid_range", `${aloc}.context`, "Context must be a 1-based inclusive line range.");
      if (!validHash(anchor.contentHash)) error("invalid_hash", `${aloc}.contentHash`, "Provide a sha256 hash of the context text.");
      if (anchor.symbol !== undefined && !nonempty(anchor.symbol)) error("invalid_symbol", `${aloc}.symbol`, "Symbol must be a non-empty string.");
      anchor.focus ??= [];
      if (!Array.isArray(anchor.focus)) error("invalid_focus", `${aloc}.focus`, "Focus must be an array of side-specific spans.");
      else for (const [fi, focus] of anchor.focus.entries()) {
        if (!object(focus) || !["base", "head"].includes(focus.side) || !validRange(focus.range) || (focus.contentHash !== undefined && !validHash(focus.contentHash)) || (focus.kind !== undefined && !["added", "removed", "unchanged"].includes(focus.kind))) error("invalid_focus", `${aloc}.focus[${fi}]`, "Each focus span needs a base/head side, valid range, and valid optional kind/hash.");
      }
      anchor.claimRefs ??= [];
      if (!Array.isArray(anchor.claimRefs) || anchor.claimRefs.some((ref) => !nonempty(ref) || (options.claims && !knownClaims.has(ref)))) error("invalid_claim_ref", `${aloc}.claimRefs`, "Reference existing claim ids.");
      if (findings.filter((f) => f.severity === "error").length !== start || typeof options.readSource !== "function") continue;
      let source;
      try { source = options.readSource(anchor); } catch (e) { error("source_unavailable", aloc, `Cannot resolve ${anchor.path}: ${e.message}`); continue; }
      sources.set(anchor, source);
      if (!object(source) || ![source.base, source.head].every((text) => text === null || typeof text === "string")) { error("invalid_source", aloc, "Source reader must return base/head text or null for absent files."); continue; }
      const actual = source.base === null ? "added" : source.head === null ? "deleted" : source.base === source.head ? "unchanged" : "modified";
      if ((source.base === null && source.head === null) || anchor.change !== actual) error("change_mismatch", `${aloc}.change`, `Source revisions indicate ${source.base === null && source.head === null ? "a missing file" : actual}; update the anchor.`);
      const context = rangeText(source[anchor.side], anchor.context);
      if (context === null) error("range_out_of_bounds", `${aloc}.context`, "Context does not exist on its selected side and revision.");
      else if (hashText(context) !== anchor.contentHash) error("content_mismatch", `${aloc}.contentHash`, "Context bytes changed; inspect the source and regenerate its hash.");
      for (const [fi, focus] of anchor.focus.entries()) {
        const text = rangeText(source[focus.side], focus.range);
        if (text === null) error("range_out_of_bounds", `${aloc}.focus[${fi}]`, "Focus does not exist on its selected side and revision.");
        else if (focus.contentHash && focus.contentHash !== hashText(text)) error("content_mismatch", `${aloc}.focus[${fi}]`, "Focus hash does not match its source revision.");
      }
    }
    if (!Array.isArray(stop.beats) || !stop.beats.length) { error("invalid_beats", `${loc}.beats`, "Provide at least one beat."); continue; }
    const beatIds = new Set();
    const paths = new Set([...(options.repositoryPaths || []), ...stop.anchors.filter(object).map((a) => a.path).filter(nonempty)]);
    for (const [bi, beat] of stop.beats.entries()) {
      const bloc = `${loc}.beats[${bi}]`;
      if (!object(beat)) { error("invalid_beat", bloc, "A beat must be an object."); continue; }
      if (!nonempty(beat.id) || beatIds.has(beat.id)) error("invalid_beat_id", `${bloc}.id`, "Provide a unique, non-empty beat id within the stop.");
      beatIds.add(beat.id);
      if (!nonempty(beat.narration)) error("invalid_narration", `${bloc}.narration`, "Provide narration using {{a:N}} for file references.");
      else {
        for (const match of beat.narration.matchAll(/\{\{a:([^}]+)\}\}/g)) {
          if (!/^[1-9]\d*$/.test(match[1]) || Number(match[1]) > stop.anchors.length) error("missing_anchor", `${bloc}.narration`, `${match[0]} does not reference an anchor in this stop.`);
        }
        if (/\{\{a:/.test(beat.narration.replace(/\{\{a:[1-9]\d*\}\}/g, ""))) error("invalid_anchor_token", `${bloc}.narration`, "Use complete {{a:N}} tokens with a positive anchor number.");
        for (const path of paths) {
          const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          if (new RegExp(`(^|[^\\w./-])${escaped}(?=$|[^\\w./-]|\\.(?=$|\\s))`).test(beat.narration)) {
            const anchor = stop.anchors.find((a) => a?.path === path);
            error("raw_path", `${bloc}.narration`, `Replace ${path} with ${anchor ? `{{a:${anchor.n}}}` : "a new anchor token"}.`);
          }
        }
        // Unknown file-shaped paths also need anchors. URLs and prose such as
        // "Node.js" are not file citations; bare names are caught by the catalog.
        const withoutUrls = beat.narration.replace(/https?:\/\/[^\s)]+/g, "");
        const candidates = [...withoutUrls.matchAll(/(?:\b[\w@.-]+\/)+[\w.-]+\.[a-zA-Z][\w-]*|`([^`\n]+\.[a-zA-Z][\w-]*)`/g)];
        for (const match of candidates) {
          const path = match[1] || match[0];
          if (!paths.has(path)) error("raw_path", `${bloc}.narration`, `Replace the file reference ${path} with an anchor token.`);
        }
      }
      if (!Array.isArray(beat.active) || beat.active.some((n) => !Number.isInteger(n) || n < 1 || n > stop.anchors.length) || new Set(beat.active).size !== beat.active.length) error("invalid_active", `${bloc}.active`, "Active must contain unique anchor numbers from this stop, in priority order.");
      else if (beat.active.length > LIMITS.active) add("warning", "active_budget", `${bloc}.active`, "More than three active anchors will require overflow handling.");
    }
  }
  if (findings.some((f) => f.severity === "error")) return { ok: false, plan: null, findings };

  for (const [si, stop] of plan.stops.entries()) {
    // Connected overlap groups include transitive ranges; array order determines
    // the survivor. Never merge different coordinate systems or semantic roles.
    const groups = [];
    for (const anchor of stop.anchors) {
      const hits = groups.filter((g) => g.some((a) => a.path === anchor.path && a.side === anchor.side && a.context.startLine <= anchor.context.endLine && anchor.context.startLine <= a.context.endLine));
      const group = [...hits.flat(), anchor].sort((a, b) => a.n - b.n);
      for (const hit of hits) groups.splice(groups.indexOf(hit), 1);
      groups.push(group);
    }
    groups.sort((a, b) => a[0].n - b[0].n);
    const renumber = new Map();
    stop.anchors = groups.map((group, index) => {
      const first = group[0];
      group.forEach((a) => renumber.set(a.n, index + 1));
      if (group.length > 1) {
        const location = `stops[${si}].anchors`;
        if (group.some((a) => a.view !== first.view || a.rev.base !== first.rev.base || a.rev.head !== first.rev.head || a.role !== first.role)) {
          error("overlap_conflict", location, "Overlapping anchors have different views, revisions, or roles. Consolidate them explicitly before loading.");
        } else {
          first.focus = group.flatMap((a) => a.focus.length ? a.focus : [{ side: a.side, range: { ...a.context } }]);
          first.claimRefs = [...new Set(group.flatMap((a) => a.claimRefs))];
          first.context = { startLine: Math.min(...group.map((a) => a.context.startLine)), endLine: Math.max(...group.map((a) => a.context.endLine)) };
          first.contentHash = hashText(rangeText(sources.get(first)[first.side], first.context));
          add("warning", "overlapping_anchors", location, `Merged overlapping anchors ${group.map((a) => a.n).join(", ")} into ${index + 1}; retained the first label.`, { anchors: group.map((a) => a.n), normalizedNumber: index + 1 });
        }
      }
      return { ...first, n: index + 1 };
    });
    for (const beat of stop.beats) {
      beat.active = [...new Set(beat.active.map((n) => renumber.get(n)))];
      beat.narration = beat.narration.replace(/\{\{a:(\d+)\}\}/g, (_, n) => `{{a:${renumber.get(Number(n))}}}`);
    }
  }
  for (const claim of claims) {
    if (claim.truthStatus !== "observed" || claim.status === "obsolete" || claim.disposition === "obsolete") continue;
    const supported = plan.stops.some((stop) => stop.anchors.some((a) => a.role === "evidence" && a.claimRefs.includes(claim.id)));
    if (!supported) add("warning", "observed_without_evidence", "stops", `Observed claim ${claim.id} needs an evidence-role anchor with this claim in claimRefs.`, { claimId: claim.id });
  }
  const ok = !findings.some((f) => f.severity === "error");
  return { ok, plan: ok ? plan : null, findings };
}

module.exports = { ROLES, LIMITS, hashText, rangeText, validPath, assertHardLimit, validateTourPlan };
