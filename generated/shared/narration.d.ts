// Generated from TypeScript. Run npm run runtime:build in editor-extension.
import type { NarrationAnchor, NarrationSurface } from "./types.js";
declare const escapeHtml: (value: unknown) => string;
declare const anchorNumber: (n: number) => string;
declare const filename: (path: string) => string;
declare const colorIndex: (n: number) => number;
declare function citation(
  anchor: NarrationAnchor,
  surface: "terminal" | "receipt",
): string;
declare function renderNarration(
  text: string,
  anchors: readonly NarrationAnchor[],
  surface?: NarrationSurface,
): string;
export {
  escapeHtml,
  anchorNumber,
  filename,
  colorIndex,
  citation,
  renderNarration,
};
