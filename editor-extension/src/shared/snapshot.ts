import type {
  PlacementOption,
  RolePreferences,
  ShapeName,
  SlotLabel,
} from "./layout.js";
import type { Beat, Finding, TourStop } from "./tour.js";

export type PresentationMode = "following" | "exploring" | "paused";

/** Whether an anchor's editor is on screen, open in a tab, or unopened. */
export type AnchorStatus = "visible" | "open" | "not-open" | "stale";

/** How removed base code is shown beside an inline diff. */
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
  /** The anchor shown in this group, if the active tab belongs to the tour. */
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
  /** Currently allowed placements, keyed by anchor number. */
  options: Record<number, PlacementOption[]>;
  preferences: RolePreferences;
}

/** Editor state for the current stop. `layout` is absent before a tour is presented. */
export interface PresentationSnapshot {
  layout?: LayoutSnapshot;
  anchors: AnchorPresentation[];
}

export interface UnloadedTourSnapshot {
  revision: number;
  loaded: false;
}

export interface LoadedTourSnapshot {
  /** Increments on every accepted change; actions must quote the latest value. */
  revision: number;
  loaded: true;
  tourId: string;
  planId?: string;
  title?: string;
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

/** A serializable tour state. Check `loaded` before reading tour fields. */
export type TourSnapshot = UnloadedTourSnapshot | LoadedTourSnapshot;
