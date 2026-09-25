// Generated from TypeScript. Run npm run runtime:build in editor-extension.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReviewMapError = void 0;
exports.invariant = invariant;
class ReviewMapError extends Error {
  code;
  details;
  constructor(code, message, details) {
    super(message);
    this.name = "ReviewMapError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}
exports.ReviewMapError = ReviewMapError;
function invariant(condition, code, message, details) {
  if (!condition) throw new ReviewMapError(code, message, details);
}
