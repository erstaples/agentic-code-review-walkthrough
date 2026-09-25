import type { AnchorRole } from "./tour.js";

export type ShapeName =
  | "single"
  | "stack"
  | "stackSplitBottom"
  | "stackSplitTop"
  | "columns"
  | "grid";

export type SlotName =
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "topLeft"
  | "topRight"
  | "bottomLeft"
  | "bottomRight";

/** Custom groups use their column number. */
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

/** Replace and split target the group showing anchor `of`. */
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
  /** Empty groups have no anchor. */
  anchor?: number | null;
}

export type PlacementOption = PlacementChoice & { preview: PreviewCell[] };

export interface RolePreference {
  kind: "replace";
  slot: SlotLabel;
}

export type RolePreferences = Partial<Record<AnchorRole, RolePreference>>;

/** The host checks each request against the current layout. */
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

export interface SavedSlot {
  anchor: number | null;
  pinned: boolean;
  lastActive: number;
}

/** `identity` changes when the tour, anchors, or beats change. */
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

/** Stored per workspace and tour; unknown versions are ignored. */
export interface StoredLayoutState {
  version: 1;
  identity: string;
  layouts: SavedStopLayouts;
  preferences: RolePreferences;
}

/** Storage adds the version and identity. */
export interface LayoutMemory {
  layouts: SavedStopLayouts;
  preferences: RolePreferences;
}
