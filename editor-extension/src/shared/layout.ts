import type { AnchorRole } from "./tour.js";

/** Editor arrangements the tour creates. See the host layout model. */
export type ShapeName =
  | "single"
  | "stack"
  | "stackSplitBottom"
  | "stackSplitTop"
  | "columns"
  | "grid";

/** Semantic positions of editor groups within a known shape. */
export type SlotName =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight";

/** A group outside any known shape is named by its view column. */
export type SlotLabel = SlotName | `group${number}`;

/** `0` arranges children horizontally and `1` vertically, as in VS Code. */
export type LayoutOrientation = 0 | 1;

/** One node of `vscode.getEditorLayout`: a leaf group or a nested split. */
export interface EditorGroupLayout {
  size?: number;
  orientation?: LayoutOrientation;
  groups?: EditorGroupLayout[];
}

/** The root returned by `vscode.getEditorLayout`. */
export interface EditorLayout extends EditorGroupLayout {
  orientation: LayoutOrientation;
  groups: EditorGroupLayout[];
}

export type LayoutOrientationSetting = "auto" | "stacked" | "columns";
export type SplitKind = "below" | "beside";

/**
 * Where to put an anchor. `auto` lets the tour choose; `peek` keeps the
 * arrangement and shows an inline preview; the rest act on the group that
 * currently shows anchor `of`.
 */
export type PlacementChoice =
  | { kind: "auto" }
  | { kind: "peek" }
  | { kind: "replace" | SplitKind; of: number };

export type PlacementKind = PlacementChoice["kind"];

/** One cell of a placement diagram, in fractions of the editor area. */
export interface PreviewCell {
  x: number;
  y: number;
  w: number;
  h: number;
  /** The anchor that would be shown, or none for an empty group. */
  anchor?: number | null;
}

/** A placement the host currently allows, with its resulting arrangement. */
export type PlacementOption = PlacementChoice & { preview: PreviewCell[] };

/** A remembered destination for anchors of one role. */
export interface RolePreference {
  kind: "replace";
  slot: SlotName;
}

export type RolePreferences = Partial<Record<AnchorRole, RolePreference>>;

/** Reviewer layout requests. The host rechecks each against live state. */
export type LayoutAction =
  | {
      action: "place";
      anchor: number;
      placement: PlacementChoice;
      remember?: boolean;
    }
  | { action: "pin"; anchor: number; pinned: boolean }
  | { action: "reset" }
  | { action: "overrideSequence" };

// ---- Saved layouts (profile-local globalState, version 1) ----

/** A group in a saved stop arrangement, identified by anchor number only. */
export interface SavedSlot {
  anchor: number | null;
  pinned: boolean;
  lastActive: number;
}

/**
 * A stop's saved arrangement. `identity` digests the tour identity with the
 * stop's anchors and beats, so an edited stop never restores a stale layout.
 */
export interface SavedStopLayout {
  identity: string;
  layout: EditorLayout;
  customized: boolean;
  sequence: boolean;
  override: boolean;
  slots: SavedSlot[];
}

/** Layouts keyed by stop id. */
export type SavedStopLayouts = Record<string, SavedStopLayout>;

/** The stored value for one workspace and tour. Unknown versions are ignored. */
export interface StoredLayoutState {
  version: 1;
  identity: string;
  layouts: SavedStopLayouts;
  preferences: RolePreferences;
}

/** What the layout engine reads back and writes; storage adds version and identity. */
export interface LayoutMemory {
  layouts: SavedStopLayouts;
  preferences: RolePreferences;
}
