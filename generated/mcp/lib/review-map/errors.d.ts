// Generated from TypeScript. Run npm run runtime:build in editor-extension.
export declare class ReviewMapError extends Error {
  readonly code: string;
  readonly details?: unknown;
  constructor(code: string, message: string, details?: unknown);
}
export declare function invariant(
  condition: unknown,
  code: string,
  message: string,
  details?: unknown,
): asserts condition;
