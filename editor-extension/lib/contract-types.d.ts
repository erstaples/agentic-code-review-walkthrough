// Type declarations for the shared wire contract. The JavaScript modules in
// this directory remain the runtime source of truth: the MCP server runs them
// directly with Node, and contract/sync.js copies them into the extension.
// These declarations change no serialized field or validation result. See
// README.md for the version-bump rule, which applies only to wire changes.

// ---- Protocol constants (protocol.js) ----

export type ProtocolVersion = 3;

export type ErrorCode =
  | "unauthorized"
  | "protocol_mismatch"
  | "bad_request"
  | "file_not_found"
  | "range_out_of_bounds"
  | "git_failed"
  | "no_active_editor"
  | "content_drift"
  | "diff_identity_mismatch"
  | "invalid_tour_plan"
  | "no_tour"
  | "stale_presentation"
  | "navigation_boundary";

/** Revision sides known to the HTTP protocol. `working` means the worktree. */
export type ProtocolSide = "base" | "head" | "working";
export type ProtocolMode = "diff" | "file";
export type StopType =
  | "context"
  | "implementation"
  | "risk"
  | "evidence"
  | "limitation";

export interface ProtocolConstants {
  PROTOCOL_VERSION: ProtocolVersion;
  ERROR_CODES: readonly ErrorCode[];
  SIDES: readonly ProtocolSide[];
  MODES: readonly ProtocolMode[];
  STOP_TYPES: readonly StopType[];
}

// ---- Tour plan (tour.js) ----

/**
 * A 1-based inclusive line range, exactly as serialized on the wire. Editor
 * APIs use 0-based positions; convert at the editor boundary, never here.
 */
export interface LineRange {
  startLine: number;
  endLine: number;
}

/** A `sha256:<64 lowercase hex>` digest of source text. */
export type ContentHash = `sha256:${string}`;

/** The side whose coordinates a range uses. Anchors never cite the worktree. */
export type SourceSide = "base" | "head";
export type AnchorRole =
  | "change"
  | "evidence"
  | "callee"
  | "caller"
  | "config"
  | "schema"
  | "context";
export type AnchorView = "diff" | "head" | "base";
export type ChangeKind = "modified" | "added" | "deleted" | "unchanged";
export type FocusKind = "added" | "removed" | "unchanged";
export type Risk = "low" | "medium" | "high";

/**
 * Pinned revision identities. `head` is a commit id, or `WORKTREE:<digest>`
 * for a working-tree snapshot.
 */
export interface Revisions {
  base: string;
  head: string;
}

export interface FocusSpan {
  side: SourceSide;
  range: LineRange;
  contentHash?: ContentHash;
  kind?: FocusKind;
}

/** An anchor after validation has applied its `side`, `focus`, and `claimRefs` defaults. */
export interface TourAnchor {
  /** Stop-local number, equal to array position + 1. Also its display identity. */
  n: number;
  role: AnchorRole;
  label: string;
  /** Repository-relative path; for a rename, the head path. */
  path: string;
  view: AnchorView;
  change: ChangeKind;
  rev: Revisions;
  side: SourceSide;
  context: LineRange;
  contentHash: ContentHash;
  symbol?: string;
  focus: FocusSpan[];
  claimRefs: string[];
}

export interface Beat {
  id: string;
  /** Markdown narration that cites files only through `{{a:N}}` tokens. */
  narration: string;
  /** Anchor numbers in display priority order. */
  active: number[];
}

export interface TourStop {
  id: string;
  title: string;
  risk: Risk;
  anchors: TourAnchor[];
  beats: Beat[];
  /** Review map coverage fields are carried through unchanged when present. */
  type?: string;
  coveredEntityIds?: string[];
}

/** A validated and normalized tour plan. */
export interface TourPlan {
  presentationVersion: 2;
  stops: TourStop[];
  id?: string;
  title?: string;
}

export type FindingSeverity = "error" | "warning";

export type FindingCode =
  | "invalid_stops"
  | "unsupported_version"
  | "source_reader_required"
  | "invalid_stop"
  | "invalid_stop_id"
  | "invalid_title"
  | "invalid_risk"
  | "invalid_anchors"
  | "anchor_limit"
  | "anchor_budget"
  | "invalid_anchor"
  | "invalid_number"
  | "invalid_role"
  | "invalid_label"
  | "invalid_path"
  | "invalid_view"
  | "invalid_change"
  | "invalid_revision"
  | "revision_mismatch"
  | "invalid_side"
  | "invalid_range"
  | "invalid_hash"
  | "invalid_symbol"
  | "invalid_focus"
  | "invalid_claim_ref"
  | "source_unavailable"
  | "invalid_source"
  | "change_mismatch"
  | "range_out_of_bounds"
  | "content_mismatch"
  | "invalid_beats"
  | "invalid_beat"
  | "invalid_beat_id"
  | "invalid_narration"
  | "missing_anchor"
  | "invalid_anchor_token"
  | "raw_path"
  | "invalid_active"
  | "active_budget"
  | "overlap_conflict"
  | "overlapping_anchors"
  | "observed_without_evidence";

export interface Finding {
  severity: FindingSeverity;
  code: FindingCode;
  /** A JSON-path-like location such as `stops[0].anchors[2].context`. */
  location: string;
  message: string;
  /** `overlapping_anchors`: the original numbers merged into one anchor. */
  anchors?: number[];
  /** `overlapping_anchors`: the surviving anchor's normalized number. */
  normalizedNumber?: number;
  /** `observed_without_evidence`: the claim lacking evidence. */
  claimId?: string;
}

export type ValidationResult =
  | { ok: true; plan: TourPlan; findings: Finding[] }
  | { ok: false; plan: null; findings: Finding[] };

/** Base and head text for one anchor; `null` means the file is absent there. */
export interface SourceTexts {
  base: string | null;
  head: string | null;
}

/**
 * Reads revision-pinned source text. Throws when a revision cannot be
 * resolved rather than reporting an arbitrary failure as an absent file.
 */
export type SourceReader = (anchor: TourAnchor) => SourceTexts;

/** The subset of a review map claim that tour validation reads. */
export interface ClaimSummary {
  id: string;
  truthStatus?: string;
  status?: string;
  disposition?: string;
}

export interface ValidateOptions {
  hardLimit?: number;
  readSource?: SourceReader;
  claims?: ClaimSummary[];
  revisions?: Revisions;
  repositoryPaths?: string[];
}

export interface AnchorLimits {
  recommended: 7;
  hard: 24;
  maximum: 99;
  active: 3;
}

// ---- Source manifests (tour-sources.js) ----

/** The fields of a review map manifest file entry that source reading uses. */
export interface ManifestFile {
  path: string;
  kind?: string;
  oldPath?: string;
  renamedFrom?: string;
  index?: string;
  worktree?: string;
  staged?: boolean;
  unstaged?: boolean;
  untracked?: boolean;
  indexEntry?: { stage: number; blob?: string } | null;
  working?: { digest: string } | null;
}

export interface ChangeManifest {
  kind?: string;
  effectiveBase?: string;
  baselineCommit?: string;
  headCommit?: string;
  currentHead?: string;
  files: ManifestFile[];
}

export interface ReviewChange {
  manifest: ChangeManifest;
  manifestDigest: string;
}

export interface TourSourceCatalog {
  revisions: Revisions;
  repositoryPaths: string[];
  readSource: SourceReader;
}

// ---- Narration (narration.js) ----

export type NarrationSurface = "terminal" | "sidebar" | "receipt";

/** The anchor fields narration rendering reads. */
export type NarrationAnchor = Pick<
  TourAnchor,
  "n" | "path" | "label" | "context" | "rev" | "view" | "change"
> &
  Partial<Pick<TourAnchor, "side">>;
