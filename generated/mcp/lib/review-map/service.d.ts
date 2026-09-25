// Generated from TypeScript. Run npm run runtime:build in editor-extension.
import type {
  Aggregate,
  ChangeRevision,
  Manifest,
  Selection,
  MapRequests,
} from "./types.js";
import type { Finding } from "../../../shared/types.js";
import type { StoreOptions } from "./file-store.js";
import { FileReviewMapStore } from "./file-store.js";
declare function redactSensitive(
  value: unknown,
  key?: string,
): {
  value: unknown;
  redacted: boolean;
};
declare function selectionFor(change: ChangeRevision): Selection;
declare class ReviewMapService {
  readonly store: FileReviewMapStore;
  readonly tourAnchorLimit: number;
  constructor(
    options?: StoreOptions & {
      store?: FileReviewMapStore;
      tourAnchorLimit?: number;
    },
  );
  validateTour(
    state: Aggregate,
    plan: unknown,
  ): import("../../../shared/types.js").ValidationResult;
  loadTour(args: MapRequests["loadTour"]): {
    workspace: string;
    tourId: string;
    plan: import("../../../shared/types.js").TourPlan;
    change: ChangeRevision;
    claims: {
      id: string;
      truthStatus: string | undefined;
      status: string;
      disposition: string | undefined;
    }[];
    findings: Finding[];
  };
  open(args: MapRequests["open"]):
    | {
        freshness: string;
        requiredNextAction: string;
        storage: {
          stateRoot: string;
          mapDirectory: string;
        };
        mapId: string;
        title: string;
        phase: "draft" | "prepared" | "archived";
        aggregateRevision: number;
        changeRevision: ChangeRevision;
        thesis: import("./types.js").Thesis | null;
        counts: {
          requirements: number;
          claims: number;
          decisions: number;
          risks: number;
          evidence: number;
          questions: number;
          concerns: number;
          stops: number;
        };
        claimDispositions: any;
        riskDispositions: any;
        evidenceFreshness: any;
        stopStates: any;
        found?: undefined;
        resolvedChange?: undefined;
        relatedMapId?: undefined;
        relatedAggregateRevision?: undefined;
      }
    | {
        found: boolean;
        freshness: string;
        resolvedChange: {
          kind: "working-tree" | "committed";
          manifestDigest: string;
        };
        relatedMapId: string;
        relatedAggregateRevision: number;
        requiredNextAction: string;
      }
    | {
        found: boolean;
        freshness: string;
        resolvedChange: {
          kind: "working-tree" | "committed";
          manifestDigest: string;
        };
        relatedMapId: null;
        requiredNextAction: string;
        relatedAggregateRevision?: undefined;
      }
    | {
        freshness: string;
        requiredNextAction: string;
        storage: {
          stateRoot: string;
          mapDirectory: string;
        };
        relatedMapId: string | null;
        mapId: string;
        title: string;
        phase: "draft" | "prepared" | "archived";
        aggregateRevision: number;
        changeRevision: ChangeRevision;
        thesis: import("./types.js").Thesis | null;
        counts: {
          requirements: number;
          claims: number;
          decisions: number;
          risks: number;
          evidence: number;
          questions: number;
          concerns: number;
          stops: number;
        };
        claimDispositions: any;
        riskDispositions: any;
        evidenceFreshness: any;
        stopStates: any;
        found?: undefined;
        resolvedChange?: undefined;
        relatedAggregateRevision?: undefined;
      };
  nextAction(state: Aggregate): "start" | "prepare" | "resume";
  locate(
    workspace: string,
    mapId: string,
  ): {
    repository: {
      workspace: string;
      commonDir: string;
      repositoryKey: string;
    };
    state: Aggregate;
  };
  freshness(state: Aggregate):
    | {
        freshness: string;
        expectedDigest: string;
        actualDigest: string;
        error?: undefined;
      }
    | {
        freshness: string;
        expectedDigest: string;
        error: {
          code: string;
          message: string;
        };
        actualDigest?: undefined;
      };
  get(
    args: MapRequests["get"] & {
      selector: {
        kind: "overview";
      };
    },
  ): Extract<
    ReturnType<ReviewMapService["getProjection"]>,
    {
      requiredNextAction: unknown;
    }
  >;
  get(
    args: MapRequests["get"] & {
      selector: {
        kind: "entity";
      };
    },
  ): Extract<
    ReturnType<ReviewMapService["getProjection"]>,
    {
      entityType: unknown;
    }
  >;
  get(
    args: MapRequests["get"] & {
      selector: {
        kind: "entities";
      };
    },
  ): Extract<
    ReturnType<ReviewMapService["getProjection"]>,
    {
      entities: unknown;
    }
  >;
  get(
    args: MapRequests["get"] & {
      selector: {
        kind: "tour";
      };
    },
  ): Extract<
    ReturnType<ReviewMapService["getProjection"]>,
    {
      sessions: unknown;
    }
  >;
  get(
    args: MapRequests["get"] & {
      selector: {
        kind: "open-items";
      };
    },
  ): Extract<
    ReturnType<ReviewMapService["getProjection"]>,
    {
      questions: unknown;
    }
  >;
  get(
    args: MapRequests["get"] & {
      selector: {
        kind: "evidence-matrix";
      };
    },
  ): Extract<
    ReturnType<ReviewMapService["getProjection"]>,
    {
      claims: unknown;
    }
  >;
  get(
    args: MapRequests["get"] & {
      selector: {
        kind: "recap";
      };
    },
  ): Extract<
    ReturnType<ReviewMapService["getProjection"]>,
    {
      completedStops: unknown;
    }
  >;
  get(
    args: MapRequests["get"] & {
      selector: {
        kind: "storage";
      };
    },
  ): Extract<
    ReturnType<ReviewMapService["getProjection"]>,
    {
      mapDirectory: unknown;
    }
  >;
  get(args: MapRequests["get"]): ReturnType<ReviewMapService["getProjection"]>;
  getProjection(args: MapRequests["get"]):
    | import("./types.js").Entity
    | {
        questions: import("./types.js").Entity[];
        concerns: import("./types.js").Entity[];
        risks: import("./types.js").Entity[];
      }
    | {
        stateRoot: string;
        mapDirectory: string;
      }
    | {
        requiredNextAction: string;
        freshness: string;
        expectedDigest: string;
        actualDigest: string;
        error?: undefined;
        mapId: string;
        title: string;
        phase: "draft" | "prepared" | "archived";
        aggregateRevision: number;
        changeRevision: ChangeRevision;
        thesis: import("./types.js").Thesis | null;
        counts: {
          requirements: number;
          claims: number;
          decisions: number;
          risks: number;
          evidence: number;
          questions: number;
          concerns: number;
          stops: number;
        };
        claimDispositions: any;
        riskDispositions: any;
        evidenceFreshness: any;
        stopStates: any;
        entities?: undefined;
        plan?: undefined;
        sessions?: undefined;
        claims?: undefined;
        session?: undefined;
        completedStops?: undefined;
        remainingStops?: undefined;
        openItems?: undefined;
      }
    | {
        requiredNextAction: string;
        freshness: string;
        expectedDigest: string;
        error: {
          code: string;
          message: string;
        };
        actualDigest?: undefined;
        mapId: string;
        title: string;
        phase: "draft" | "prepared" | "archived";
        aggregateRevision: number;
        changeRevision: ChangeRevision;
        thesis: import("./types.js").Thesis | null;
        counts: {
          requirements: number;
          claims: number;
          decisions: number;
          risks: number;
          evidence: number;
          questions: number;
          concerns: number;
          stops: number;
        };
        claimDispositions: any;
        riskDispositions: any;
        evidenceFreshness: any;
        stopStates: any;
        entities?: undefined;
        plan?: undefined;
        sessions?: undefined;
        claims?: undefined;
        session?: undefined;
        completedStops?: undefined;
        remainingStops?: undefined;
        openItems?: undefined;
      }
    | {
        entities: import("./types.js").Entity[];
        plan?: undefined;
        sessions?: undefined;
        freshness?: undefined;
        claims?: undefined;
        session?: undefined;
        completedStops?: undefined;
        remainingStops?: undefined;
        openItems?: undefined;
      }
    | {
        plan: import("./types.js").StoredPlan;
        sessions: import("./types.js").ReviewSession[];
        freshness: string;
        entities?: undefined;
        claims?: undefined;
        session?: undefined;
        completedStops?: undefined;
        remainingStops?: undefined;
        openItems?: undefined;
      }
    | {
        claims: {
          id: string;
          statement: string | undefined;
          disposition: string | undefined;
          evidence: import("./types.js").Entity[];
        }[];
        entities?: undefined;
        plan?: undefined;
        sessions?: undefined;
        freshness?: undefined;
        session?: undefined;
        completedStops?: undefined;
        remainingStops?: undefined;
        openItems?: undefined;
      }
    | {
        session: import("./types.js").ReviewSession;
        completedStops: import("./types.js").StoredStop[];
        remainingStops: import("./types.js").StoredStop[];
        openItems: {
          questions: import("./types.js").Entity[];
          concerns: import("./types.js").Entity[];
          risks: import("./types.js").Entity[];
        };
        freshness: string;
        entities?: undefined;
        plan?: undefined;
        sessions?: undefined;
        claims?: undefined;
      };
  apply(args: MapRequests["apply"]): {
    mapId: string;
    aggregateRevision: number;
    emittedEventIds: string[];
    changed: {
      mapId: string;
      title: string;
      phase: "draft" | "prepared" | "archived";
      aggregateRevision: number;
      changeRevision: ChangeRevision;
      thesis: import("./types.js").Thesis | null;
      counts: {
        requirements: number;
        claims: number;
        decisions: number;
        risks: number;
        evidence: number;
        questions: number;
        concerns: number;
        stops: number;
      };
      claimDispositions: any;
      riskDispositions: any;
      evidenceFreshness: any;
      stopStates: any;
    };
    warnings: string[];
    findings: Finding[];
  };
  check(args: MapRequests["check"]):
    | {
        findings: Finding[];
        freshness: string;
        expectedDigest: string;
        actualDigest: string;
        error?: undefined;
        ok: boolean;
        mapId: string;
        aggregateRevision: number;
        schemaValid: boolean;
        eventChainValid: boolean;
      }
    | {
        findings: Finding[];
        freshness: string;
        expectedDigest: string;
        error: {
          code: string;
          message: string;
        };
        actualDigest?: undefined;
        ok: boolean;
        mapId: string;
        aggregateRevision: number;
        schemaValid: boolean;
        eventChainValid: boolean;
      };
  refresh(args: MapRequests["refresh"]):
    | {
        changed: boolean;
        aggregateRevision: number;
        freshness: string;
        mapId?: undefined;
        changeRevision?: undefined;
        structuralDelta?: undefined;
        invalidationPlan?: undefined;
      }
    | {
        changed: boolean;
        mapId: string;
        aggregateRevision: number;
        changeRevision: {
          id: string;
          state: string;
          createdAt: string;
          kind: "working-tree" | "committed";
          labels:
            | {
                base: string | undefined;
                head: string | undefined;
              }
            | {
                baseline: string;
                head: string;
              };
          manifest:
            | {
                kind: "committed";
                baseCommit: string;
                headCommit: string;
                effectiveBase: string;
                diffMode: string;
                files: {
                  oldPath: string | null;
                  path: string;
                  kind: string;
                  similarity: number | null;
                  oldMode: string;
                  newMode: string;
                  oldBlob: string;
                  newBlob: string;
                }[];
              }
            | {
                kind: "working-tree";
                baselineCommit: string;
                currentHead: string;
                includeStaged: boolean;
                includeUnstaged: boolean;
                includeUntracked: boolean;
                files: {
                  path: string;
                  renamedFrom: string | null;
                  index: string;
                  worktree: string;
                  staged: boolean;
                  unstaged: boolean;
                  untracked: boolean;
                  indexEntry: {
                    mode: string;
                    blob: string;
                    stage: number;
                  } | null;
                  working:
                    | {
                        type: string;
                        digest: string;
                        mode: number;
                      }
                    | {
                        type: string;
                        digest: null;
                        mode: number;
                      }
                    | null;
                }[];
              };
          manifestDigest: string;
          previousChangeRevisionId: string;
        };
        structuralDelta: {
          added: string[];
          removed: string[];
          modified: string[];
        };
        invalidationPlan: {
          invalidatedStops: string[];
          staleEvidence: string[];
          requiresSemanticReassessment: boolean;
        };
        freshness?: undefined;
      };
  receipt(args: MapRequests["receipt"]):
    | {
        mode: string;
        receipt: {
          digest: string;
          schemaVersion: number;
          producerVersion: string;
          id: string;
          mapId: string;
          reviewSessionId: string;
          changeRevisionId: string;
          changeIdentity: {
            kind: "working-tree" | "committed";
            labels: {
              base?: string;
              head?: string;
              baseline?: string;
            };
            manifestDigest: string;
          };
          aggregateRevision: number;
          eventHash: string | undefined;
          createdAt: string;
          supersedesReceiptId: string | null;
          thesis: import("./types.js").Thesis | null;
          outcome: string | null;
          claims: {
            id: string;
            statement: string | undefined;
            category: string;
            disposition: string | undefined;
            evidenceRefs: string[];
            provenance: import("./types.js").Provenance[];
          }[];
          risks: {
            id: string;
            statement: string | undefined;
            impact: string;
            disposition: string | undefined;
            mitigation: {} | null;
          }[];
          evidence: {
            id: string;
            observation: string | undefined;
            result: {};
            freshness: string | undefined;
            limitations: {};
          }[];
          stops: {
            id: string;
            title: string;
            type: unknown;
            reviewState: string;
            reviewedAtChangeRevisionId: string | null;
            beats: {
              id: string;
              narration: string;
            }[];
          }[];
          questions: {
            id: string;
            type: import("./types.js").EntityKind;
            text: string | undefined;
            disposition: string | undefined;
            answers: {
              answer: unknown;
              provenance: import("./types.js").Provenance[];
              recordedAt: string;
            }[];
          }[];
        };
        markdown: string;
        receiptId?: undefined;
        digest?: undefined;
        aggregateRevision?: undefined;
        jsonPath?: undefined;
        markdownPath?: undefined;
      }
    | {
        mode: string;
        receiptId: string;
        digest: string;
        aggregateRevision: number;
        jsonPath: string;
        markdownPath: string;
        receipt?: undefined;
        markdown?: undefined;
      };
  delete(args: MapRequests["delete"]): {
    deleted: boolean;
    mapId: string;
    recoverable: boolean;
  };
}
declare function compareManifests(
  before: Manifest,
  after: Manifest,
): {
  added: string[];
  removed: string[];
  modified: string[];
};
export { ReviewMapService, selectionFor, compareManifests, redactSensitive };
