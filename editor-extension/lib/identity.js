"use strict";

function createIdentity() {
  let pinned = null;

  return {
    current: () => pinned,
    reset() {
      pinned = null;
    },
    check({ base, head }) {
      if (!pinned) {
        pinned = { base, head };
        return pinned;
      }
      if (pinned.base.sha !== base.sha || pinned.head.sha !== head.sha) {
        throw Object.assign(
          new Error(`this tour is pinned to ${pinned.base.sha}..${pinned.head.sha}; got ${base.sha}..${head.sha}. Call tour_clear to start a new tour.`),
          { code: "diff_identity_mismatch" }
        );
      }
      return pinned;
    },
    sideFor(ref) {
      if (!pinned) return null;
      if (ref === pinned.base.sha) return "base";
      if (ref === pinned.head.sha) return pinned.head.sha === "WORKTREE" ? "working" : "head";
      return null;
    },
  };
}

module.exports = { createIdentity };
