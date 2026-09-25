import type {
  EditorGroupLayout,
  EditorLayout,
  LayoutOrientationSetting,
  ShapeName,
  SlotName,
  SplitKind,
} from "../shared/layout.js";

export interface Shape {
  layout: EditorLayout;
  /** Slot names in view-column order, one per leaf group. */
  slots: SlotName[];
}

export const SHAPES: Record<ShapeName, Shape> = {
  single: { layout: { orientation: 0, groups: [{}] }, slots: ["top"] },
  stack: {
    layout: { orientation: 1, groups: [{ size: 0.5 }, { size: 0.5 }] },
    slots: ["top", "bottom"],
  },
  stackSplitBottom: {
    layout: {
      orientation: 1,
      groups: [{ size: 0.47 }, { size: 0.53, groups: [{}, {}] }],
    },
    slots: ["top", "bottomLeft", "bottomRight"],
  },
  stackSplitTop: {
    layout: {
      orientation: 1,
      groups: [{ size: 0.53, groups: [{}, {}] }, { size: 0.47 }],
    },
    slots: ["topLeft", "topRight", "bottom"],
  },
  columns: {
    layout: { orientation: 0, groups: [{}, {}] },
    slots: ["left", "right"],
  },
  grid: {
    layout: {
      orientation: 1,
      groups: [{ groups: [{}, {}] }, { groups: [{}, {}] }],
    },
    slots: ["topLeft", "topRight", "bottomLeft", "bottomRight"],
  },
};

export function shapeFor(
  count: number,
  orientation: LayoutOrientationSetting,
  sideBySide: boolean,
): ShapeName {
  if (count <= 1) return "single";
  if (count === 2) {
    const stacked =
      orientation === "stacked" || (orientation === "auto" && sideBySide);
    return stacked ? "stack" : "columns";
  }
  return count === 3 ? "stackSplitBottom" : "grid";
}

/** The shape and destination slot produced by splitting `slot`, if supported. */
export type SplitResult = [shape: ShapeName, destination: SlotName];

const SPLIT_TRANSITIONS: Partial<Record<string, SplitResult>> = {
  "single:top:below": ["stack", "bottom"],
  "single:top:beside": ["columns", "right"],
  "stack:top:beside": ["stackSplitTop", "topRight"],
  "stack:bottom:beside": ["stackSplitBottom", "bottomRight"],
  "stackSplitBottom:top:beside": ["grid", "topRight"],
  "stackSplitTop:bottom:beside": ["grid", "bottomRight"],
};

export function splitShape(
  shape: ShapeName | null,
  slot: string,
  kind: SplitKind,
): SplitResult | null {
  return SPLIT_TRANSITIONS[`${shape}:${slot}:${kind}`] || null;
}

interface NormalizedGroup {
  orientation?: EditorGroupLayout["orientation"];
  groups?: NormalizedGroup[];
  size?: number;
}

// Ratios distinguish a splitter drag from scrolling or whole-window resizing.
export function geometry(layout: EditorGroupLayout): string {
  function normalize(node: EditorGroupLayout): NormalizedGroup {
    if (!node.groups) return {};
    const total = node.groups.reduce(
      (sum, group) => sum + (group.size || 1),
      0,
    );
    return {
      orientation: node.orientation,
      groups: node.groups.map((group) => ({
        ...normalize(group),
        size: Math.round(((group.size || 1) / total) * 1000) / 1000,
      })),
    };
  }
  return JSON.stringify(normalize(layout));
}

/** The editor properties `cramped` reads. */
export interface ViewportEditor {
  document: { lineCount: number };
  visibleRanges: readonly { start: { line: number }; end: { line: number } }[];
}

const READABLE_LINES = 18;

export function cramped(editor: ViewportEditor): boolean {
  const ranges = editor.visibleRanges;
  const lineCount = editor.document.lineCount;
  // EOF, short files and folded/disjoint ranges cannot establish viewport height.
  if (lineCount < READABLE_LINES || ranges.length !== 1) return false;
  const range = ranges[0];
  const reachesEnd = range.end.line >= lineCount - 1;
  const visibleLines = range.end.line - range.start.line + 1;
  return !reachesEnd && visibleLines < READABLE_LINES;
}
