"use strict";

class ReviewMapError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "ReviewMapError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function invariant(condition, code, message, details) {
  if (!condition) throw new ReviewMapError(code, message, details);
}

module.exports = { ReviewMapError, invariant };
