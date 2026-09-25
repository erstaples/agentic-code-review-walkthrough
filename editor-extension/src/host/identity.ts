import type { ProtocolSide } from "../../lib/contract-types.js";

export interface RevisionRef {
  sha: string;
  name?: unknown;
}

export interface DiffIdentity {
  base: RevisionRef;
  head: RevisionRef;
}

/** The worktree pseudo-revision used by the legacy stop protocol. */
const WORKTREE = "WORKTREE";

function mismatch(message: string): Error {
  return Object.assign(new Error(message), { code: "diff_identity_mismatch" });
}

/** Pins the base/head revisions of the first request and rejects any other pair. */
export function createIdentity() {
  let pinned: DiffIdentity | null = null;

  return {
    /** A copy of the pinned identity, or null before the first check. */
    current(): DiffIdentity | null {
      if (!pinned) return null;
      return {
        base: { sha: pinned.base.sha, name: pinned.base.name },
        head: { sha: pinned.head.sha, name: pinned.head.name },
      };
    },
    reset(): void {
      pinned = null;
    },
    check({ base, head }: { base?: unknown; head?: unknown }): DiffIdentity {
      if (!isRevisionRef(base) || !isRevisionRef(head)) {
        throw mismatch("base and head must each have a sha property");
      }
      if (!pinned) {
        pinned = { base, head };
        return pinned;
      }
      if (pinned.base.sha !== base.sha || pinned.head.sha !== head.sha) {
        throw mismatch(
          `this tour is pinned to ${pinned.base.sha}..${pinned.head.sha}; got ${base.sha}..${head.sha}. Call kanko_tour_clear to start a new tour.`,
        );
      }
      return pinned;
    },
    sideFor(ref: string): ProtocolSide | null {
      if (!pinned) return null;
      if (ref === pinned.head.sha)
        return pinned.head.sha === WORKTREE ? "working" : "head";
      if (ref === pinned.base.sha) return "base";
      return null;
    },
  };
}

export type Identity = ReturnType<typeof createIdentity>;

function isRevisionRef(value: unknown): value is RevisionRef {
  return (
    typeof (value as { sha?: unknown } | null | undefined)?.sha === "string"
  );
}
