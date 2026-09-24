"use strict";

class ChangeRecordError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "ChangeRecordError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function invariant(condition, code, message, details) {
  if (!condition) throw new ChangeRecordError(code, message, details);
}

module.exports = { ChangeRecordError, invariant };
