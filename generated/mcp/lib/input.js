// Generated from TypeScript. Run npm run runtime:build in editor-extension.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRecord = isRecord;
exports.errorFields = errorFields;
function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function errorFields(error) {
  const fields = isRecord(error) ? error : {};
  return {
    code: typeof fields.code === "string" ? fields.code : undefined,
    message:
      typeof fields.message === "string" ? fields.message : String(error),
    details: fields.details,
    stderr: fields.stderr instanceof Buffer ? fields.stderr : undefined,
  };
}
