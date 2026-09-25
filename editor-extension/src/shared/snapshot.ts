import type {
  PlacementOption,
  RolePreferences,
  ShapeName,
  SlotLabel,
} from "./layout.js";
import type { Beat, Finding, TourStop } from "./tour.js";

export type PresentationMode = "following" | "exploring" | "paused";

export type AnchorStatus = "visible" | "open" | "not-open" | "stale";

export type RemovedCodeDisplay = "companion" | "peek";

export interface AnchorPresentation {
  n: number;
  path: string;
  status: AnchorStatus;
  column: number | null;
  /** The URI scheme of the anchor's editor, such as `file` or `kanko-rev`. */
  source: string;
  companionColumn: number | null;
  removedCode: RemovedCodeDisplay | null;
}

export interface SlotSnapshot {
  slot: SlotLabel;
  column: number;
  /** Absent when the active tab is outside the tour. */
  anchor?: number;
  pinned: boolean;
}

export interface LayoutSnapshot {
  shape: ShapeName | "custom";
  cap: number;
  customized: boolean;
  sequence: boolean;
  sequenceOverride: boolean;
  unplaced: number[];
  slots: SlotSnapshot[];
  /** Allowed placements by anchor number. */
  options: Record<number, PlacementOption[]>;
  preferences: RolePreferences;
}

/** `layout` is absent before the tour is shown. */
export interface PresentationSnapshot {
  layout?: LayoutSnapshot;
  anchors: AnchorPresentation[];
}

export interface UnloadedTourSnapshot {
  revision: number;
  loaded: false;
}

export interface LoadedTourSnapshot {
  /** Increments after each accepted change. */
  revision: number;
  loaded: true;
  tourId: string;
  planId?: unknown;
  title?: unknown;
  mode: PresentationMode;
  stopIndex: number;
  beatIndex: number;
  stopCount: number;
  beatCount: number;
  stop: TourStop;
  beat: Beat;
  selectedAnchor: number | null;
  findings: Finding[];
  presentation: PresentationSnapshot;
  /** Escaped sidebar HTML; only extension-rendered chips are interactive. */
  narrationHtml: string;
  narration: string;
  receiptNarration: string;
}

export type TourSnapshot = UnloadedTourSnapshot | LoadedTourSnapshot;
