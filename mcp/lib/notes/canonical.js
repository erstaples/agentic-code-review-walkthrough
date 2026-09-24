"use strict";

const crypto = require("node:crypto");

function canonicalize(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
}

function digest(value) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === "string" ? value : canonicalize(value));
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

module.exports = { canonicalize, digest, id };
