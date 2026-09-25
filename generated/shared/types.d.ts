// Generated from TypeScript. Run npm run runtime:build in editor-extension.
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
/** `working` refers to the working tree. */
export type ProtocolSide = "base" | "head" | "working";
export type ProtocolMode = "diff" | "file";
export type StopType =
  "context" | "implementation" | "risk" | "evidence" | "limitation";
export interface ProtocolConstants {
  PROTOCOL_VERSION: ProtocolVersion;
  ERROR_CODES: readonly ErrorCode[];
  SIDES: readonly ProtocolSide[];
  MODES: readonly ProtocolMode[];
  STOP_TYPES: readonly StopType[];
}
/** Line numbers start at 1 and include both endpoints. */
export interface LineRange {
  startLine: number;
  endLine: number;
}
/** A `sha256:<64 lowercase hex>` digest of source text. */
export type ContentHash = `sha256:${string}`;
/** The revision used for line numbers; `head` may represent a working-tree snapshot. */
export type SourceSide = "base" | "head";
export type AnchorRole =
  "change" | "evidence" | "callee" | "caller" | "config" | "schema" | "context";
export type AnchorView = "diff" | "head" | "base";
export type ChangeKind = "modified" | "added" | "deleted" | "unchanged";
export type FocusKind = "added" | "removed" | "unchanged";
export type Risk = "low" | "medium" | "high";
/** `head` is a commit ID or `WORKTREE:<digest>`. */
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
/** Checked anchor with defaults applied. */
export interface TourAnchor {
  /** Array position + 1 within this stop. */
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
  /** Copied without validation. */
  type?: unknown;
  coveredEntityIds?: unknown;
}
/** Checked plan; optional metadata is copied without validation. */
export interface TourPlan {
  presentationVersion: 2;
  stops: TourStop[];
  id?: unknown;
  title?: unknown;
}
export type TourAnchorInput = Omit<
  TourAnchor,
  "side" | "focus" | "claimRefs"
> & {
  side?: SourceSide | null;
  focus?: FocusSpan[] | null;
  claimRefs?: string[] | null;
};
export type TourStopInput = Omit<TourStop, "anchors"> & {
  anchors: TourAnchorInput[];
};
export type TourPlanInput = Omit<TourPlan, "stops"> & {
  stops: TourStopInput[];
};
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
  /** For example, `stops[0].anchors[2].context`. */
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
  | {
      ok: true;
      plan: TourPlan;
      findings: Finding[];
    }
  | {
      ok: false;
      plan: null;
      findings: Finding[];
    };
/** Base and head text for one anchor; `null` means the file is absent there. */
export interface SourceTexts {
  base: string | null;
  head: string | null;
}
/** Throws if a revision cannot be read; returns null only for an absent file. */
export type SourceReader = (
  anchor: Pick<TourAnchor, "path" | "rev">,
) => SourceTexts;
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
export interface ManifestFile {
  path: string;
  kind?: string;
  oldPath?: string | null;
  renamedFrom?: string | null;
  index?: string;
  worktree?: string;
  staged?: boolean;
  unstaged?: boolean;
  untracked?: boolean;
  indexEntry?: {
    stage: number;
    blob?: string;
  } | null;
  working?: {
    digest: string | null;
  } | null;
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
export type NarrationSurface = "terminal" | "sidebar" | "receipt";
export type NarrationAnchor = Pick<
  TourAnchor,
  "n" | "path" | "label" | "context" | "rev" | "view" | "change"
> &
  Partial<Pick<TourAnchor, "side">>;
