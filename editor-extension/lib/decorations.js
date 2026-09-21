"use strict";

function createIntentStore() {
  let stop = null;
  let focus = null;
  let pending = new Set();

  return {
    setStop(next) {
      stop = next;
      focus = null;
      pending = new Set((next.files || []).map((f) => f.path));
    },
    setFocus(next) {
      focus = next;
    },
    clear() {
      stop = null;
      focus = null;
      pending = new Set();
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
    pendingPaths() {
      return [...pending];
    },
    markApplied(path) {
      pending.delete(path);
    },
  };
}

module.exports = { createIntentStore };
