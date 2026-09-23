"use strict";

class DossierError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = "DossierError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

function invariant(condition, code, message, details) {
  if (!condition) throw new DossierError(code, message, details);
}

module.exports = { DossierError, invariant };
