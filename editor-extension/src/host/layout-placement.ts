import type { TabGroup } from "vscode";
import type { AnchorRecord } from "./state.js";
import type {
  EditorLayout,
  EditorGroupLayout,
  ShapeName,
  SlotLabel,
  RolePreference,
  PlacementChoice,
  PreviewCell,
} from "../shared/layout.js";
import { SHAPES, splitShape } from "./layout-model.js";

export interface LayoutSlot {
  slot: SlotLabel;
  column: number;
  anchor?: number;
  pinned: boolean;
  lastActive: number;
  group: TabGroup;
  record?: AnchorRecord;
}
interface PreviewNode {
  size?: number;
  orientation?: number;
  groups?: PreviewNode[];
  anchor?: number | null;
}
export function identifyShape(layout: EditorLayout) {
  const topology = (node: EditorGroupLayout): object =>
    node.groups
      ? { orientation: node.orientation, groups: node.groups.map(topology) }
      : {};
  const structure = JSON.stringify(topology(layout));
  return (
    (Object.keys(SHAPES) as ShapeName[]).find(
      (name) => JSON.stringify(topology(SHAPES[name].layout)) === structure,
    ) || null
  );
}
export function choosePlacementSlot(
  record: AnchorRecord,
  currentSlots: LayoutSlot[],
  available: LayoutSlot[],
  shape: ShapeName | null,
  preference: RolePreference | undefined,
) {
  // Only the grid can place repeated colors diagonally.
  function colorCollisions(slot: LayoutSlot) {
    if (shape !== "grid") return 0;
    return currentSlots.filter(
      (other) =>
        other.record &&
        other.column !== slot.column &&
        other.column + slot.column !== 5 &&
        (other.record.anchor.n - 1) % 6 === (record.anchor.n - 1) % 6,
    ).length;
  }
  const empty = available
    .filter((slot) => !slot.group.activeTab)
    .sort(
      (left, right) =>
        colorCollisions(left) - colorCollisions(right) ||
        left.column - right.column,
    )[0];
  if (empty) return empty;

  if (preference?.kind === "replace") {
    const preferred = available.find((slot) => slot.slot === preference.slot);
    if (preferred) return preferred;
  }
  return available.sort(
    (left, right) =>
      left.lastActive - right.lastActive ||
      colorCollisions(left) - colorCollisions(right) ||
      left.column - right.column,
  )[0];
}

export function placementPreview(
  anchorNumber: number,
  option: PlacementChoice,
  shape: ShapeName | null,
  currentSlots: LayoutSlot[],
  originColumn: number | undefined,
  closeEmptyGroups: boolean,
): PreviewCell[] {
  if (option.kind === "auto" || option.kind === "peek") return [];
  const target = currentSlots.find((slot) => slot.anchor === option.of);
  let nextShape = shape;
  let destination = target?.slot;
  if (!target || !shape) return [];
  nextShape = shape;
  if (option.kind !== "replace") {
    const split = splitShape(shape, target.slot, option.kind);
    if (!split) return [];
    [nextShape, destination] = split;
  }
  if (!destination) return [];
  const values = new Map(
    currentSlots.map((slot) => [
      slot.slot,
      slot.anchor === anchorNumber ? null : slot.anchor,
    ]),
  );
  // Splitting renames the old target leaf to its first half.
  if (option.kind !== "replace") {
    const oldSlots = SHAPES[shape].slots;
    const newSlots = SHAPES[nextShape].slots;
    const remaining = newSlots.filter((name) => name !== destination);
    oldSlots.forEach((_name, index) =>
      values.set(
        remaining[index],
        currentSlots[index]?.anchor === anchorNumber
          ? null
          : currentSlots[index]?.anchor,
      ),
    );
  }
  values.set(destination, anchorNumber);
  const originIndex = currentSlots.findIndex(
    (slot) => slot.column === originColumn,
  );
  const closeOrigin =
    originIndex >= 0 &&
    currentSlots[originIndex].group.tabs.length === 1 &&
    closeEmptyGroups;
  const remaining = SHAPES[nextShape].slots.filter(
    (name) => option.kind === "replace" || name !== destination,
  );
  const removedSlot = closeOrigin ? remaining[originIndex] : undefined;
  let index = 0;
  // Remove the empty source group before sizing the placement diagram.
  const prepare = (
    node: EditorGroupLayout,
    orientation: number,
  ): PreviewNode | null => {
    if (!node.groups) {
      const slot = SHAPES[nextShape].slots[index++];
      return slot === removedSlot
        ? null
        : { ...node, anchor: values.get(slot) };
    }
    const direction = node.orientation ?? orientation;
    const children = node.groups.flatMap((group) => {
      const child = prepare(group, 1 - direction);
      return child ? [child] : [];
    });
    if (!children.length) return null;
    if (children.length === 1) return { ...children[0], size: node.size };
    return { ...node, orientation: direction, groups: children };
  };
  const tree = prepare(SHAPES[nextShape].layout, 0);
  return tree ? previewCells(tree, 0, 0, 1, 1) : [];
}

function previewCells(
  node: PreviewNode,
  x: number,
  y: number,
  width: number,
  height: number,
): PreviewCell[] {
  if (!node.groups) return [{ x, y, w: width, h: height, anchor: node.anchor }];
  const direction = node.orientation;
  const total = node.groups.reduce(
    (totalSize, group) => totalSize + (group.size || 1),
    0,
  );
  let offset = 0;
  return node.groups.flatMap((group) => {
    const ratio = (group.size || 1) / total;
    const cells = previewCells(
      group,
      x + (direction === 0 ? offset * width : 0),
      y + (direction === 1 ? offset * height : 0),
      direction === 0 ? width * ratio : width,
      direction === 1 ? height * ratio : height,
    );
    offset += ratio;
    return cells;
  });
}
