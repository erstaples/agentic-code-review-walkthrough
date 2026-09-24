"use strict";

const { renderNarration } = require("./narration.js");
const fail = (code, message, details) => Object.assign(new Error(message), { code, details });

// All incoming operations share one queue. Validation finishes before any
// editor changes, and failed loads leave the previous tour and cursor intact.
function createTourController({ prepare, present, clear, publish }) {
  let current = null, revision = 0, queue = Promise.resolve();
  function snapshot(state = current) {
    if (!state) return { revision, loaded: false };
    const stop = state.plan.stops[state.stopIndex], beat = stop.beats[state.beatIndex];
    return structuredClone({ revision, loaded: true, tourId: state.tourId, planId: state.plan.id,
      title: state.plan.title, mode: state.mode, stopIndex: state.stopIndex, beatIndex: state.beatIndex,
      stopCount: state.plan.stops.length, beatCount: stop.beats.length, stop, beat,
      selectedAnchor: state.selectedAnchor, findings: state.findings,
      narrationHtml: renderNarration(beat.narration, stop.anchors, "sidebar"),
      narration: renderNarration(beat.narration, stop.anchors, "terminal"),
      receiptNarration: renderNarration(beat.narration, stop.anchors, "receipt"),
    });
  }
  function run(action) { const result = queue.then(action); queue = result.catch(() => {}); return result; }
  function guard(expected) {
    if (!current) throw fail("no_tour", "Load a tour first.");
    if (expected !== undefined && expected !== revision) throw fail("stale_presentation", "The tour changed; use the latest snapshot.");
  }
  async function commit(next, { focus = false } = {}) {
    await present(next, { focus });
    current = next; revision++;
    const value = snapshot(); publish(value); return value;
  }
  return {
    snapshot,
    load: (body) => run(async () => {
      const validated = await prepare(body);
      const first = validated.plan.stops[0].beats[0];
      return commit({ ...validated, stopIndex: 0, beatIndex: 0, mode: "following", selectedAnchor: first.active[0] || null });
    }),
    navigate: (body) => run(async () => {
      guard(body.expectedRevision);
      const next = { ...current };
      const stops = next.plan.stops;
      switch (body.action) {
        case "nextBeat": if (next.beatIndex + 1 < stops[next.stopIndex].beats.length) next.beatIndex++; else if (next.stopIndex + 1 < stops.length) { next.stopIndex++; next.beatIndex = 0; } else throw fail("navigation_boundary", "Already at the last beat."); break;
        case "previousBeat": if (next.beatIndex > 0) next.beatIndex--; else if (next.stopIndex > 0) { next.stopIndex--; next.beatIndex = stops[next.stopIndex].beats.length - 1; } else throw fail("navigation_boundary", "Already at the first beat."); break;
        case "nextStop": if (++next.stopIndex >= stops.length) throw fail("navigation_boundary", "Already at the last stop."); next.beatIndex = 0; break;
        case "previousStop": if (--next.stopIndex < 0) throw fail("navigation_boundary", "Already at the first stop."); next.beatIndex = 0; break;
        case "goto": next.stopIndex = stops.findIndex((s) => s.id === body.stopId); next.beatIndex = stops[next.stopIndex]?.beats.findIndex((b) => b.id === body.beatId) ?? -1; if (next.stopIndex < 0 || next.beatIndex < 0) throw fail("bad_request", "Choose an existing stopId and beatId."); break;
        default: throw fail("bad_request", "Unknown navigation action.");
      }
      next.selectedAnchor = stops[next.stopIndex].beats[next.beatIndex].active[0] || null;
      return commit(next);
    }),
    setState: (body) => run(async () => {
      guard(body.expectedRevision);
      if (!["following", "exploring", "paused"].includes(body.mode)) throw fail("bad_request", "Mode must be following, exploring, or paused.");
      return commit({ ...current, mode: body.mode });
    }),
    focus: (body) => run(async () => {
      guard(body.expectedRevision);
      if (!current.plan.stops[current.stopIndex].anchors.some((a) => a.n === body.anchor)) throw fail("bad_request", "Choose an anchor from the current stop.");
      return commit({ ...current, selectedAnchor: body.anchor }, { focus: true });
    }),
    clear: () => run(async () => { await clear(); current = null; revision++; const value = snapshot(); publish(value); return value; }),
  };
}
module.exports = { createTourController };
