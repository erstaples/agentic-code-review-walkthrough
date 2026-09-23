"use strict";

function parseHunks(text) {
  return text.split("\n").flatMap((line) => {
    const m = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/.exec(line);
    return m ? [{ baseStart: +m[1], baseLen: m[2] === undefined ? 1 : +m[2], headStart: +m[3], headLen: m[4] === undefined ? 1 : +m[4] }] : [];
  });
}
function seamLineFor(start0, hunks) {
  const h = hunks.find((h) => start0 + 1 >= h.baseStart && start0 + 1 < h.baseStart + h.baseLen);
  return h ? h.headLen === 0 ? h.headStart : h.headStart - 1 : undefined;
}
const removedBaseLines0 = (hunks) => hunks.flatMap((h) => Array.from({ length: h.baseLen }, (_, i) => h.baseStart - 1 + i));

function mapLine(line, hunks, from) {
  let offset = 0;
  const to = from === "base" ? "head" : "base";
  for (const h of hunks) {
    const start = h[`${from}Start`], len = h[`${from}Len`];
    const target = h[`${to}Start`], targetLen = h[`${to}Len`];
    if (line < start || (len === 0 && line === start)) break;
    if (len > 0 && line < start + len) return Math.max(1, target + (targetLen ? Math.min(line - start, targetLen - 1) : 1));
    offset += targetLen - len;
  }
  return Math.max(1, line + offset);
}
function mapRange(range, hunks, from) {
  return { startLine: mapLine(range.startLine, hunks, from), endLine: mapLine(range.endLine, hunks, from) };
}
module.exports = { parseHunks, seamLineFor, removedBaseLines0, mapRange };
