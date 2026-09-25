// Generated from TypeScript. Run npm run runtime:build in editor-extension.
import type { BridgeLock } from "./discovery.js";
import { ReviewMapService } from "./review-map/service.js";
declare const BRIDGE_TOOLS: (
  | {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        required: string[];
        properties: {
          workspace: {
            type: string;
            description: string;
          };
          mapId?: undefined;
          action?: undefined;
          stopId?: undefined;
          beatId?: undefined;
          expectedRevision?: undefined;
          mode?: undefined;
        };
      };
    }
  | {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        required: string[];
        properties: {
          workspace: {
            type: string;
            description: string;
          };
          mapId: {
            type: string;
          };
          action?: undefined;
          stopId?: undefined;
          beatId?: undefined;
          expectedRevision?: undefined;
          mode?: undefined;
        };
      };
    }
  | {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        required: string[];
        properties: {
          workspace: {
            type: string;
            description: string;
          };
          action: {
            enum: string[];
          };
          stopId: {
            type: string;
          };
          beatId: {
            type: string;
          };
          expectedRevision: {
            type: string;
            minimum: number;
          };
          mapId?: undefined;
          mode?: undefined;
        };
      };
    }
  | {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        required: string[];
        properties: {
          workspace: {
            type: string;
            description: string;
          };
          mode: {
            enum: string[];
          };
          expectedRevision: {
            type: string;
            minimum: number;
          };
          mapId?: undefined;
          action?: undefined;
          stopId?: undefined;
          beatId?: undefined;
        };
      };
    }
)[];
declare const MAP_TOOLS: (
  | {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        required: string[];
        properties: {
          workspace: {
            type: string;
            description: string;
          };
          selection: {
            oneOf: (
              | {
                  type: string;
                  required: string[];
                  properties: {
                    kind: {
                      const: string;
                    };
                    base: {
                      type: string;
                    };
                    head: {
                      type: string;
                    };
                    diffMode: {
                      type: string;
                      enum: string[];
                    };
                    baseline?: undefined;
                    includeStaged?: undefined;
                    includeUnstaged?: undefined;
                    includeUntracked?: undefined;
                  };
                }
              | {
                  type: string;
                  required: string[];
                  properties: {
                    kind: {
                      const: string;
                    };
                    baseline: {
                      type: string;
                    };
                    includeStaged: {
                      type: string;
                    };
                    includeUnstaged: {
                      type: string;
                    };
                    includeUntracked: {
                      type: string;
                    };
                    base?: undefined;
                    head?: undefined;
                    diffMode?: undefined;
                  };
                }
            )[];
          };
          actor: {
            type: string;
            required: string[];
            properties: {
              kind: {
                type: string;
                description: string;
              };
              id: {
                type: string;
                description: string;
              };
              displayName: {
                type: string;
              };
            };
          };
          title: {
            type: string;
          };
          createIfMissing: {
            type: string;
            default: boolean;
          };
          forceNew: {
            type: string;
            default: boolean;
            description: string;
          };
          mapId?: undefined;
          selector?: undefined;
          expectedRevision?: undefined;
          commands?: undefined;
          sessionId?: undefined;
          mode?: undefined;
          supersedesReceiptId?: undefined;
          confirmMapId?: undefined;
        };
        allOf?: undefined;
      };
    }
  | {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        required: string[];
        properties: {
          workspace: {
            type: string;
            description: string;
          };
          mapId: {
            type: string;
            pattern: string;
          };
          selector: {
            type: string;
            required: string[];
            properties: {
              kind: {
                type: string;
                enum: string[];
              };
              id: {
                type: string;
              };
              type: {
                type: string;
              };
              stopId: {
                type: string;
              };
              sessionId: {
                type: string;
              };
            };
          };
          selection?: undefined;
          actor?: undefined;
          title?: undefined;
          createIfMissing?: undefined;
          forceNew?: undefined;
          expectedRevision?: undefined;
          commands?: undefined;
          sessionId?: undefined;
          mode?: undefined;
          supersedesReceiptId?: undefined;
          confirmMapId?: undefined;
        };
        allOf?: undefined;
      };
    }
  | {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        required: string[];
        properties: {
          workspace: {
            type: string;
            description: string;
          };
          mapId: {
            type: string;
            pattern: string;
          };
          expectedRevision: {
            type: string;
            minimum: number;
            description: string;
          };
          actor: {
            type: string;
            required: string[];
            properties: {
              kind: {
                type: string;
                description: string;
              };
              id: {
                type: string;
                description: string;
              };
              displayName: {
                type: string;
              };
            };
          };
          commands: {
            type: string;
            minItems: number;
            items: {
              oneOf: {
                type: string;
                required: string[];
                properties: {
                  type: {
                    const: string;
                  };
                };
              }[];
            };
          };
          selection?: undefined;
          title?: undefined;
          createIfMissing?: undefined;
          forceNew?: undefined;
          selector?: undefined;
          sessionId?: undefined;
          mode?: undefined;
          supersedesReceiptId?: undefined;
          confirmMapId?: undefined;
        };
        allOf?: undefined;
      };
    }
  | {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        required: string[];
        properties: {
          workspace: {
            type: string;
            description: string;
          };
          mapId: {
            type: string;
            pattern: string;
          };
          selection?: undefined;
          actor?: undefined;
          title?: undefined;
          createIfMissing?: undefined;
          forceNew?: undefined;
          selector?: undefined;
          expectedRevision?: undefined;
          commands?: undefined;
          sessionId?: undefined;
          mode?: undefined;
          supersedesReceiptId?: undefined;
          confirmMapId?: undefined;
        };
        allOf?: undefined;
      };
    }
  | {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        required: string[];
        properties: {
          workspace: {
            type: string;
            description: string;
          };
          mapId: {
            type: string;
            pattern: string;
          };
          expectedRevision: {
            type: string;
            minimum: number;
            description: string;
          };
          selection: {
            oneOf: (
              | {
                  type: string;
                  required: string[];
                  properties: {
                    kind: {
                      const: string;
                    };
                    base: {
                      type: string;
                    };
                    head: {
                      type: string;
                    };
                    diffMode: {
                      type: string;
                      enum: string[];
                    };
                    baseline?: undefined;
                    includeStaged?: undefined;
                    includeUnstaged?: undefined;
                    includeUntracked?: undefined;
                  };
                }
              | {
                  type: string;
                  required: string[];
                  properties: {
                    kind: {
                      const: string;
                    };
                    baseline: {
                      type: string;
                    };
                    includeStaged: {
                      type: string;
                    };
                    includeUnstaged: {
                      type: string;
                    };
                    includeUntracked: {
                      type: string;
                    };
                    base?: undefined;
                    head?: undefined;
                    diffMode?: undefined;
                  };
                }
            )[];
          };
          actor: {
            type: string;
            required: string[];
            properties: {
              kind: {
                type: string;
                description: string;
              };
              id: {
                type: string;
                description: string;
              };
              displayName: {
                type: string;
              };
            };
          };
          title?: undefined;
          createIfMissing?: undefined;
          forceNew?: undefined;
          selector?: undefined;
          commands?: undefined;
          sessionId?: undefined;
          mode?: undefined;
          supersedesReceiptId?: undefined;
          confirmMapId?: undefined;
        };
        allOf?: undefined;
      };
    }
  | {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        required: string[];
        properties: {
          workspace: {
            type: string;
            description: string;
          };
          mapId: {
            type: string;
            pattern: string;
          };
          sessionId: {
            type: string;
          };
          mode: {
            type: string;
            enum: string[];
          };
          expectedRevision: {
            type: string;
            minimum: number;
            description: string;
          };
          supersedesReceiptId: {
            type: string;
          };
          actor: {
            type: string;
            required: string[];
            properties: {
              kind: {
                type: string;
                description: string;
              };
              id: {
                type: string;
                description: string;
              };
              displayName: {
                type: string;
              };
            };
          };
          selection?: undefined;
          title?: undefined;
          createIfMissing?: undefined;
          forceNew?: undefined;
          selector?: undefined;
          commands?: undefined;
          confirmMapId?: undefined;
        };
        allOf: {
          if: {
            properties: {
              mode: {
                const: string;
              };
            };
          };
          then: {
            required: string[];
          };
        }[];
      };
    }
  | {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        required: string[];
        properties: {
          workspace: {
            type: string;
            description: string;
          };
          mapId: {
            type: string;
            pattern: string;
          };
          confirmMapId: {
            type: string;
            pattern: string;
          };
          actor: {
            type: string;
            required: string[];
            properties: {
              kind: {
                type: string;
                description: string;
              };
              id: {
                type: string;
                description: string;
              };
              displayName: {
                type: string;
              };
            };
          };
          selection?: undefined;
          title?: undefined;
          createIfMissing?: undefined;
          forceNew?: undefined;
          selector?: undefined;
          expectedRevision?: undefined;
          commands?: undefined;
          sessionId?: undefined;
          mode?: undefined;
          supersedesReceiptId?: undefined;
        };
        allOf?: undefined;
      };
    }
)[];
declare const TOOLS: (
  | {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        required: string[];
        properties: {
          workspace: {
            type: string;
            description: string;
          };
          mapId?: undefined;
          action?: undefined;
          stopId?: undefined;
          beatId?: undefined;
          expectedRevision?: undefined;
          mode?: undefined;
        };
      };
    }
  | {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        required: string[];
        properties: {
          workspace: {
            type: string;
            description: string;
          };
          mapId: {
            type: string;
          };
          action?: undefined;
          stopId?: undefined;
          beatId?: undefined;
          expectedRevision?: undefined;
          mode?: undefined;
        };
      };
    }
  | {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        required: string[];
        properties: {
          workspace: {
            type: string;
            description: string;
          };
          action: {
            enum: string[];
          };
          stopId: {
            type: string;
          };
          beatId: {
            type: string;
          };
          expectedRevision: {
            type: string;
            minimum: number;
          };
          mapId?: undefined;
          mode?: undefined;
        };
      };
    }
  | {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        required: string[];
        properties: {
          workspace: {
            type: string;
            description: string;
          };
          mode: {
            enum: string[];
          };
          expectedRevision: {
            type: string;
            minimum: number;
          };
          mapId?: undefined;
          action?: undefined;
          stopId?: undefined;
          beatId?: undefined;
        };
      };
    }
  | {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        required: string[];
        properties: {
          workspace: {
            type: string;
            description: string;
          };
          selection: {
            oneOf: (
              | {
                  type: string;
                  required: string[];
                  properties: {
                    kind: {
                      const: string;
                    };
                    base: {
                      type: string;
                    };
                    head: {
                      type: string;
                    };
                    diffMode: {
                      type: string;
                      enum: string[];
                    };
                    baseline?: undefined;
                    includeStaged?: undefined;
                    includeUnstaged?: undefined;
                    includeUntracked?: undefined;
                  };
                }
              | {
                  type: string;
                  required: string[];
                  properties: {
                    kind: {
                      const: string;
                    };
                    baseline: {
                      type: string;
                    };
                    includeStaged: {
                      type: string;
                    };
                    includeUnstaged: {
                      type: string;
                    };
                    includeUntracked: {
                      type: string;
                    };
                    base?: undefined;
                    head?: undefined;
                    diffMode?: undefined;
                  };
                }
            )[];
          };
          actor: {
            type: string;
            required: string[];
            properties: {
              kind: {
                type: string;
                description: string;
              };
              id: {
                type: string;
                description: string;
              };
              displayName: {
                type: string;
              };
            };
          };
          title: {
            type: string;
          };
          createIfMissing: {
            type: string;
            default: boolean;
          };
          forceNew: {
            type: string;
            default: boolean;
            description: string;
          };
          mapId?: undefined;
          selector?: undefined;
          expectedRevision?: undefined;
          commands?: undefined;
          sessionId?: undefined;
          mode?: undefined;
          supersedesReceiptId?: undefined;
          confirmMapId?: undefined;
        };
        allOf?: undefined;
      };
    }
  | {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        required: string[];
        properties: {
          workspace: {
            type: string;
            description: string;
          };
          mapId: {
            type: string;
            pattern: string;
          };
          selector: {
            type: string;
            required: string[];
            properties: {
              kind: {
                type: string;
                enum: string[];
              };
              id: {
                type: string;
              };
              type: {
                type: string;
              };
              stopId: {
                type: string;
              };
              sessionId: {
                type: string;
              };
            };
          };
          selection?: undefined;
          actor?: undefined;
          title?: undefined;
          createIfMissing?: undefined;
          forceNew?: undefined;
          expectedRevision?: undefined;
          commands?: undefined;
          sessionId?: undefined;
          mode?: undefined;
          supersedesReceiptId?: undefined;
          confirmMapId?: undefined;
        };
        allOf?: undefined;
      };
    }
  | {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        required: string[];
        properties: {
          workspace: {
            type: string;
            description: string;
          };
          mapId: {
            type: string;
            pattern: string;
          };
          expectedRevision: {
            type: string;
            minimum: number;
            description: string;
          };
          actor: {
            type: string;
            required: string[];
            properties: {
              kind: {
                type: string;
                description: string;
              };
              id: {
                type: string;
                description: string;
              };
              displayName: {
                type: string;
              };
            };
          };
          commands: {
            type: string;
            minItems: number;
            items: {
              oneOf: {
                type: string;
                required: string[];
                properties: {
                  type: {
                    const: string;
                  };
                };
              }[];
            };
          };
          selection?: undefined;
          title?: undefined;
          createIfMissing?: undefined;
          forceNew?: undefined;
          selector?: undefined;
          sessionId?: undefined;
          mode?: undefined;
          supersedesReceiptId?: undefined;
          confirmMapId?: undefined;
        };
        allOf?: undefined;
      };
    }
  | {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        required: string[];
        properties: {
          workspace: {
            type: string;
            description: string;
          };
          mapId: {
            type: string;
            pattern: string;
          };
          selection?: undefined;
          actor?: undefined;
          title?: undefined;
          createIfMissing?: undefined;
          forceNew?: undefined;
          selector?: undefined;
          expectedRevision?: undefined;
          commands?: undefined;
          sessionId?: undefined;
          mode?: undefined;
          supersedesReceiptId?: undefined;
          confirmMapId?: undefined;
        };
        allOf?: undefined;
      };
    }
  | {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        required: string[];
        properties: {
          workspace: {
            type: string;
            description: string;
          };
          mapId: {
            type: string;
            pattern: string;
          };
          expectedRevision: {
            type: string;
            minimum: number;
            description: string;
          };
          selection: {
            oneOf: (
              | {
                  type: string;
                  required: string[];
                  properties: {
                    kind: {
                      const: string;
                    };
                    base: {
                      type: string;
                    };
                    head: {
                      type: string;
                    };
                    diffMode: {
                      type: string;
                      enum: string[];
                    };
                    baseline?: undefined;
                    includeStaged?: undefined;
                    includeUnstaged?: undefined;
                    includeUntracked?: undefined;
                  };
                }
              | {
                  type: string;
                  required: string[];
                  properties: {
                    kind: {
                      const: string;
                    };
                    baseline: {
                      type: string;
                    };
                    includeStaged: {
                      type: string;
                    };
                    includeUnstaged: {
                      type: string;
                    };
                    includeUntracked: {
                      type: string;
                    };
                    base?: undefined;
                    head?: undefined;
                    diffMode?: undefined;
                  };
                }
            )[];
          };
          actor: {
            type: string;
            required: string[];
            properties: {
              kind: {
                type: string;
                description: string;
              };
              id: {
                type: string;
                description: string;
              };
              displayName: {
                type: string;
              };
            };
          };
          title?: undefined;
          createIfMissing?: undefined;
          forceNew?: undefined;
          selector?: undefined;
          commands?: undefined;
          sessionId?: undefined;
          mode?: undefined;
          supersedesReceiptId?: undefined;
          confirmMapId?: undefined;
        };
        allOf?: undefined;
      };
    }
  | {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        required: string[];
        properties: {
          workspace: {
            type: string;
            description: string;
          };
          mapId: {
            type: string;
            pattern: string;
          };
          sessionId: {
            type: string;
          };
          mode: {
            type: string;
            enum: string[];
          };
          expectedRevision: {
            type: string;
            minimum: number;
            description: string;
          };
          supersedesReceiptId: {
            type: string;
          };
          actor: {
            type: string;
            required: string[];
            properties: {
              kind: {
                type: string;
                description: string;
              };
              id: {
                type: string;
                description: string;
              };
              displayName: {
                type: string;
              };
            };
          };
          selection?: undefined;
          title?: undefined;
          createIfMissing?: undefined;
          forceNew?: undefined;
          selector?: undefined;
          commands?: undefined;
          confirmMapId?: undefined;
        };
        allOf: {
          if: {
            properties: {
              mode: {
                const: string;
              };
            };
          };
          then: {
            required: string[];
          };
        }[];
      };
    }
  | {
      name: string;
      description: string;
      inputSchema: {
        type: string;
        required: string[];
        properties: {
          workspace: {
            type: string;
            description: string;
          };
          mapId: {
            type: string;
            pattern: string;
          };
          confirmMapId: {
            type: string;
            pattern: string;
          };
          actor: {
            type: string;
            required: string[];
            properties: {
              kind: {
                type: string;
                description: string;
              };
              id: {
                type: string;
                description: string;
              };
              displayName: {
                type: string;
              };
            };
          };
          selection?: undefined;
          title?: undefined;
          createIfMissing?: undefined;
          forceNew?: undefined;
          selector?: undefined;
          expectedRevision?: undefined;
          commands?: undefined;
          sessionId?: undefined;
          mode?: undefined;
          supersedesReceiptId?: undefined;
        };
        allOf?: undefined;
      };
    }
)[];
declare const ROUTES: Record<string, [string, string]>;
declare function createCallTool({
  resolveLock,
  mapService,
}: {
  resolveLock: (workspace: string | undefined) => BridgeLock;
  mapService?: ReviewMapService;
}): (
  name: string,
  args: Record<string, unknown>,
) => Promise<
  | Record<string, unknown>
  | {
      questions: import("./review-map/types.js").Entity[];
      concerns: import("./review-map/types.js").Entity[];
      risks: import("./review-map/types.js").Entity[];
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
      changeRevision: import("./review-map/types.js").ChangeRevision;
      thesis: import("./review-map/types.js").Thesis | null;
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
      changeRevision: import("./review-map/types.js").ChangeRevision;
      thesis: import("./review-map/types.js").Thesis | null;
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
      entities: import("./review-map/types.js").Entity[];
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
      plan: import("./review-map/types.js").StoredPlan;
      sessions: import("./review-map/types.js").ReviewSession[];
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
        evidence: import("./review-map/types.js").Entity[];
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
      session: import("./review-map/types.js").ReviewSession;
      completedStops: import("./review-map/types.js").StoredStop[];
      remainingStops: import("./review-map/types.js").StoredStop[];
      openItems: {
        questions: import("./review-map/types.js").Entity[];
        concerns: import("./review-map/types.js").Entity[];
        risks: import("./review-map/types.js").Entity[];
      };
      freshness: string;
      entities?: undefined;
      plan?: undefined;
      sessions?: undefined;
      claims?: undefined;
    }
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
      changeRevision: import("./review-map/types.js").ChangeRevision;
      thesis: import("./review-map/types.js").Thesis | null;
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
      changeRevision: import("./review-map/types.js").ChangeRevision;
      thesis: import("./review-map/types.js").Thesis | null;
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
    }
  | {
      mapId: string;
      aggregateRevision: number;
      emittedEventIds: string[];
      changed: {
        mapId: string;
        title: string;
        phase: "draft" | "prepared" | "archived";
        aggregateRevision: number;
        changeRevision: import("./review-map/types.js").ChangeRevision;
        thesis: import("./review-map/types.js").Thesis | null;
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
      findings: import("../../shared/types.js").Finding[];
    }
  | {
      findings: import("../../shared/types.js").Finding[];
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
      findings: import("../../shared/types.js").Finding[];
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
    }
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
    }
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
        thesis: import("./review-map/types.js").Thesis | null;
        outcome: string | null;
        claims: {
          id: string;
          statement: string | undefined;
          category: string;
          disposition: string | undefined;
          evidenceRefs: string[];
          provenance: import("./review-map/types.js").Provenance[];
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
          type: import("./review-map/types.js").EntityKind;
          text: string | undefined;
          disposition: string | undefined;
          answers: {
            answer: unknown;
            provenance: import("./review-map/types.js").Provenance[];
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
    }
  | {
      deleted: boolean;
      mapId: string;
      recoverable: boolean;
    }
>;
export { TOOLS, BRIDGE_TOOLS, MAP_TOOLS, ROUTES, createCallTool };
