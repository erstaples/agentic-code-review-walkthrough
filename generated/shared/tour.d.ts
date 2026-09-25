// Generated from TypeScript. Run npm run runtime:build in editor-extension.
import type {
  AnchorRole,
  ContentHash,
  ValidateOptions,
  ValidationResult,
} from "./types.js";
declare const ROLES: readonly AnchorRole[];
declare const LIMITS: import("./types.js").AnchorLimits;
declare const hashText: (text: string) => ContentHash;
declare const validPath: (value: unknown) => value is string;
declare function rangeText(text: unknown, range: unknown): string | null;
declare function assertHardLimit(value?: number): number;
declare function validateTourPlan(
  input: unknown,
  options?: ValidateOptions,
): ValidationResult;
export {
  ROLES,
  LIMITS,
  hashText,
  rangeText,
  validPath,
  assertHardLimit,
  validateTourPlan,
};
