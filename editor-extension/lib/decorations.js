"use strict";

const SEP = "\u0000";
const keyOf = (path, side) => `${side}${SEP}${path}`;

function createIntentStore() {
  let stop = null;
  let focus = null;
  let pending = new Set();
  let state = "following";
  let paints = new Map();

  return {
    setStop(next) {
      state = "following";
      paints.clear();
      stop = next;
      focus = null;
      pending = new Set();
      for (const f of next.files || []) {
        for (const side of new Set((f.ranges || []).map((r) => r.side))) {
          pending.add(keyOf(f.path, side));
        }
      }
    },
    setFocus(next) {
      focus = next;
      state = "following";
      paints.clear();
    },
    state() { return state; },
    setState(next) {
      if (!["following", "exploring", "paused", "detour", "stale"].includes(next)) throw new Error("invalid presentation state");
      state = next;
    },
    paintFor(path, side) { return paints.get(keyOf(path, side)) || (paints.size ? { context: [], focus: [] } : {}); },
    setPaint(path, side, paint) { paints.set(keyOf(path, side), paint); },
    clearPaint() { paints.clear(); },
    clear() {
      stop = null;
      focus = null;
      pending = new Set();
      paints.clear();
      state = "following";
    },
    currentStopId() {
      return stop ? stop.stopId : null;
    },
    currentFocus() {
      return focus
        ? { path: focus.path, side: focus.side, startLine: focus.startLine, endLine: focus.endLine, note: focus.note }
        : null;
    },
    rangesFor({ path, side }) {
      const file = stop && (stop.files || []).find((f) => f.path === path);
      const ranges = file
        ? file.ranges.filter((r) => r.side === side).map((r) => ({ startLine: r.startLine, endLine: r.endLine }))
        : [];
      const hit = focus && focus.path === path && focus.side === side
        ? { startLine: focus.startLine, endLine: focus.endLine, note: focus.note }
        : null;
      return { stop: ranges, focus: hit };
    },
    // One entry per (path, side) pair the current stop actually asked for, so a
    // file with both a materialized and an unmaterialized side reports accurately.
    pending() {
      return [...pending].map((k) => {
        const i = k.indexOf(SEP);
        return { side: k.slice(0, i), path: k.slice(i + 1) };
      });
    },
    markApplied(path, side) {
      pending.delete(keyOf(path, side));
    },
  };
}

module.exports = { createIntentStore };
