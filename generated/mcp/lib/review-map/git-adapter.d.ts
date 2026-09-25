// Generated from TypeScript. Run npm run runtime:build in editor-extension.
import type { ChangeRevision, EntityInput, Selection } from "./types.js";
declare function git(
  workspace: string,
  args: string[],
  options: {
    encoding: null;
  },
): Buffer;
declare function git(
  workspace: string,
  args: string[],
  options?: {
    encoding?: "utf8";
  },
): string;
declare function resolveWorkspace(input: unknown): string;
declare function parseRawDiff(output: string): {
  oldPath: string | null;
  path: string;
  kind: string;
  similarity: number | null;
  oldMode: string;
  newMode: string;
  oldBlob: string;
  newBlob: string;
}[];
declare function parseStatus(output: string): {
  path: string;
  renamedFrom: string | null;
  index: string;
  worktree: string;
}[];
declare function resolveChange(
  workspaceInput: unknown,
  selection?: Selection,
):
  | {
      kind: "committed";
      labels: {
        base: string | undefined;
        head: string | undefined;
      };
      manifest: {
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
      };
      manifestDigest: string;
      workspace: string;
      commonDir: string;
      repositoryKey: string;
    }
  | {
      kind: "working-tree";
      labels: {
        baseline: string;
        head: string;
      };
      manifest: {
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
      workspace: string;
      commonDir: string;
      repositoryKey: string;
    };
declare function repositoryIdentity(workspaceInput: unknown): {
  workspace: string;
  commonDir: string;
  repositoryKey: string;
};
declare function resolveCodeReference(
  workspaceInput: unknown,
  changeRevision: ChangeRevision,
  reference: EntityInput,
): {
  revision: string;
  contentDigest: string;
  changeRevisionId: string;
  id?: string;
  provenance: import("./types.js").Provenance[];
  statement?: string;
  chosen?: string;
  concern?: string;
  observation?: string;
  question?: string;
  disposition?: string;
  freshness?: string;
  truthStatus?: string;
  category?: string;
  impact?: string;
  result?: unknown;
  limitations?: unknown;
  mitigation?: unknown;
  relatedEntityIds?: string[];
  requirementRefs?: string[];
  claimRefs?: string[];
  codeRefs?: string[];
  evidenceRefs?: string[];
  decisionRefs?: string[];
  riskRefs?: string[];
  path?: string;
  side?: string;
  startLine?: number;
  endLine?: number;
  rawOutput?: string;
  rawBytesBase64?: string;
  blobRef?: {
    digest: string;
    size: number;
    encoding: string;
  };
  answers?: {
    answer: unknown;
    provenance: import("./types.js").Provenance[];
    recordedAt: string;
  }[];
};
export {
  git,
  resolveChange,
  resolveWorkspace,
  repositoryIdentity,
  resolveCodeReference,
  parseRawDiff,
  parseStatus,
};
