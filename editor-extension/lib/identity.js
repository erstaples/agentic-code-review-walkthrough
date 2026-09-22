"use strict";

function createIdentity() {
  let pinned = null;

  return {
    current: () => {
      if (!pinned) return null;
      return {
        base: { sha: pinned.base.sha, name: pinned.base.name },
        head: { sha: pinned.head.sha, name: pinned.head.name },
      };
    },
    reset() {
      pinned = null;
    },
    check({ base, head }) {
      if (typeof base?.sha !== "string" || typeof head?.sha !== "string") {
        throw Object.assign(
          new Error("base and head must each have a sha property"),
          { code: "diff_identity_mismatch" }
        );
      }
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
      if (ref === pinned.head.sha) return pinned.head.sha === "WORKTREE" ? "working" : "head";
      if (ref === pinned.base.sha) return "base";
      return null;
    },
  };
}

module.exports = { createIdentity };
