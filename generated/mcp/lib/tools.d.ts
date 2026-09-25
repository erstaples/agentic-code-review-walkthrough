// Generated from TypeScript. Run npm run runtime:build in editor-extension.
import type { MapRequests } from "./review-map/types.js";
type ToolService = {
  [K in keyof MapRequests]: (
    args: MapRequests[K],
  ) => K extends "loadTour" ? Record<string, unknown> : unknown;
};
import type { BridgeLock } from "./discovery.js";
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
  resolveLock: (
    workspace: string | undefined,
  ) => Pick<BridgeLock, "port" | "authToken">;
  mapService?: ToolService;
}): (name: string, args: Record<string, unknown>) => Promise<unknown>;
export { TOOLS, BRIDGE_TOOLS, MAP_TOOLS, ROUTES, createCallTool };
