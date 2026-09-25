import type { LineRange, SourceSide } from "../shared/tour.js";

/**
 * One zero-context unified diff hunk. Starts are 1-based. A zero length marks
 * a pure insertion or deletion; its start is then the line *before* the gap.
 */
export interface Hunk {
  baseStart: number;
  baseLen: number;
  headStart: number;
  headLen: number;
}

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

export function parseHunks(text: string): Hunk[] {
  return text.split("\n").flatMap((line) => {
    const match = HUNK_HEADER.exec(line);
    if (!match) return [];
    // An omitted length means one line.
    const [, baseStart, baseLen, headStart, headLen] = match;
    return [
      {
        baseStart: Number(baseStart),
        baseLen: baseLen === undefined ? 1 : Number(baseLen),
        headStart: Number(headStart),
        headLen: headLen === undefined ? 1 : Number(headLen),
      },
    ];
  });
}

/**
 * The 0-based head line after which removed base line `start0` (0-based) is
 * drawn, or undefined when that line was not removed.
 */
export function seamLineFor(
  start0: number,
  hunks: readonly Hunk[],
): number | undefined {
  const line = start0 + 1;
  const hunk = hunks.find(
    (h) => line >= h.baseStart && line < h.baseStart + h.baseLen,
  );
  if (!hunk) return undefined;
  return hunk.headLen === 0 ? hunk.headStart : hunk.headStart - 1;
}

/** Every removed or replaced base line, 0-based. */
export function removedBaseLines0(hunks: readonly Hunk[]): number[] {
  return hunks.flatMap((hunk) =>
    Array.from(
      { length: hunk.baseLen },
      (_, index) => hunk.baseStart - 1 + index,
    ),
  );
}

function start(hunk: Hunk, side: SourceSide): number {
  return side === "base" ? hunk.baseStart : hunk.headStart;
}

function length(hunk: Hunk, side: SourceSide): number {
  return side === "base" ? hunk.baseLen : hunk.headLen;
}

/** Maps a 1-based line from one side to the nearest corresponding line on the other. */
function mapLine(
  line: number,
  hunks: readonly Hunk[],
  from: SourceSide,
): number {
  const to: SourceSide = from === "base" ? "head" : "base";
  let offset = 0;
  for (const hunk of hunks) {
    const fromStart = start(hunk, from);
    const fromLen = length(hunk, from);
    const targetStart = start(hunk, to);
    const targetLen = length(hunk, to);
    if (line < fromStart || (fromLen === 0 && line === fromStart)) break;
    if (fromLen > 0 && line < fromStart + fromLen) {
      // Inside a changed block: clamp to the replacement, or the line after a deletion.
      const within = targetLen ? Math.min(line - fromStart, targetLen - 1) : 1;
      return Math.max(1, targetStart + within);
    }
    offset += targetLen - fromLen;
  }
  return Math.max(1, line + offset);
}

/** Maps a 1-based inclusive range across a diff. */
export function mapRange(
  range: LineRange,
  hunks: readonly Hunk[],
  from: SourceSide,
): LineRange {
  return {
    startLine: mapLine(range.startLine, hunks, from),
    endLine: mapLine(range.endLine, hunks, from),
  };
}
