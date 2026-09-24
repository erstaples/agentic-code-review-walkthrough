"use strict";
const SHAPES = {
  single: { layout: { orientation: 0, groups: [{}] }, slots: ["top"] },
  stack: { layout: { orientation: 1, groups: [{ size: .5 }, { size: .5 }] }, slots: ["top", "bottom"] },
  stackSplitBottom: { layout: { orientation: 1, groups: [{ size: .47 }, { size: .53, groups: [{}, {}] }] }, slots: ["top", "bottomLeft", "bottomRight"] },
  stackSplitTop: { layout: { orientation: 1, groups: [{ size: .53, groups: [{}, {}] }, { size: .47 }] }, slots: ["topLeft", "topRight", "bottom"] },
  columns: { layout: { orientation: 0, groups: [{}, {}] }, slots: ["left", "right"] },
  grid: { layout: { orientation: 1, groups: [{ groups: [{}, {}] }, { groups: [{}, {}] }] }, slots: ["topLeft", "topRight", "bottomLeft", "bottomRight"] },
};
function shapeFor(count, orientation, sideBySide) {
  if (count <= 1) return "single";
  if (count === 2) return orientation === "stacked" || (orientation === "auto" && sideBySide) ? "stack" : "columns";
  return count === 3 ? "stackSplitBottom" : "grid";
}
function splitShape(shape, slot, kind) {
  const transitions = {
    "single:top:below": ["stack", "bottom"], "single:top:beside": ["columns", "right"],
    "stack:top:beside": ["stackSplitTop", "topRight"], "stack:bottom:beside": ["stackSplitBottom", "bottomRight"],
    "stackSplitBottom:top:beside": ["grid", "topRight"], "stackSplitTop:bottom:beside": ["grid", "bottomRight"],
  };
  return transitions[`${shape}:${slot}:${kind}`] || null;
}
// Ratios distinguish a splitter drag from scrolling or whole-window resizing.
function geometry(layout) {
  function normalize(node) {
    if (!node.groups) return {};
    const total = node.groups.reduce((n, g) => n + (g.size || 1), 0);
    return { orientation: node.orientation, groups: node.groups.map(g => ({ ...normalize(g), size: Math.round((g.size || 1) / total * 1000) / 1000 })) };
  }
  return JSON.stringify(normalize(layout));
}
function cramped(editor) {
  const ranges = editor.visibleRanges;
  // EOF, short files and folded/disjoint ranges cannot establish viewport height.
  if (editor.document.lineCount < 18 || ranges.length !== 1) return false;
  const range = ranges[0];
  return range.end.line < editor.document.lineCount - 1 && range.end.line - range.start.line + 1 < 18;
}
module.exports = { SHAPES, shapeFor, splitShape, geometry, cramped };
