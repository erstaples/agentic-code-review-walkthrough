import type { Uri } from "vscode";
import type { TourAnchor, TourStop, TourPlan } from "../src/shared/tour.js";
import type { TourState } from "../src/host/state.js";

export function anchor(overrides: Partial<TourAnchor> = {}): TourAnchor {
  return {
    n: 1,
    role: "change",
    label: "Source",
    path: "a.js",
    view: "head",
    change: "unchanged",
    rev: { base: "base", head: "head" },
    side: "head",
    context: { startLine: 1, endLine: 1 },
    contentHash: `sha256:${"a".repeat(64)}`,
    focus: [],
    claimRefs: [],
    ...overrides,
  };
}
export function stop(overrides: Partial<TourStop> = {}): TourStop {
  return {
    id: "stop",
    title: "Stop",
    risk: "low",
    anchors: [anchor()],
    beats: [{ id: "beat", narration: "Inspect {{a:1}}.", active: [1] }],
    ...overrides,
  };
}
export function plan(overrides: Partial<TourPlan> = {}): TourPlan {
  return { presentationVersion: 2, stops: [stop()], ...overrides };
}
export function state(overrides: Partial<TourState> = {}): TourState {
  return {
    tourId: "tour",
    workspace: "/workspace",
    identity: "identity",
    plan: plan(),
    findings: [],
    texts: new Map(),
    hunks: new Map(),
    stopIndex: 0,
    beatIndex: 0,
    mode: "following",
    selectedAnchor: null,
    ...overrides,
  };
}
export function uri(value: string, scheme = "file"): Uri {
  return {
    scheme,
    authority: "",
    path: value,
    fsPath: value,
    query: "",
    fragment: "",
    toString: () => value,
    toJSON: () => ({ scheme, path: value }),
    with: (changes) => Object.assign(uri(value, scheme), changes),
  };
}
