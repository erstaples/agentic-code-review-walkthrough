// Generated from TypeScript. Run npm run runtime:build in editor-extension.
import type { Aggregate } from "./types.js";
import { canonicalize } from "./canonical.js";
declare function buildReceipt(
  state: Aggregate,
  sessionId: string,
  options?: {
    receiptId?: string;
    createdAt?: string;
    supersedesReceiptId?: string;
  },
): {
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
declare function renderMarkdown(
  receipt: ReturnType<typeof buildReceipt>,
): string;
export { buildReceipt, renderMarkdown, canonicalize };
