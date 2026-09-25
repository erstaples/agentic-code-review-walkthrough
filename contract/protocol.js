"use strict";

/** @typedef {import("./contract-types.js").ErrorCode} ErrorCode */
/** @typedef {import("./contract-types.js").ProtocolSide} ProtocolSide */
/** @typedef {import("./contract-types.js").ProtocolMode} ProtocolMode */
/** @typedef {import("./contract-types.js").StopType} StopType */

/** @type {import("./contract-types.js").ProtocolVersion} */
const PROTOCOL_VERSION = 3;

// `satisfies` keeps each literal, so type tests can prove the lists are complete.
const ERROR_CODES = /** @satisfies {readonly ErrorCode[]} */ (/** @type {const} */ ([
  "unauthorized",
  "protocol_mismatch",
  "bad_request",
  "file_not_found",
  "range_out_of_bounds",
  "git_failed",
  "no_active_editor",
  "content_drift",
  "diff_identity_mismatch",
  "invalid_tour_plan",
  "no_tour",
  "stale_presentation",
  "navigation_boundary",
]));

const SIDES = /** @satisfies {readonly ProtocolSide[]} */ (/** @type {const} */ (["base", "head", "working"]));
const MODES = /** @satisfies {readonly ProtocolMode[]} */ (/** @type {const} */ (["diff", "file"]));
const STOP_TYPES = /** @satisfies {readonly StopType[]} */ (/** @type {const} */ (["context", "implementation", "risk", "evidence", "limitation"]));

const ROUTES = {
  kanko_tour_status: { method: "GET", path: "/status" },
  kanko_tour_load: { method: "POST", path: "/tour/load" },
  kanko_tour_navigate: { method: "POST", path: "/tour/navigate" },
  kanko_tour_set_state: { method: "POST", path: "/tour/state" },
  kanko_tour_clear: { method: "POST", path: "/clear" },
};

module.exports = { PROTOCOL_VERSION, ERROR_CODES, SIDES, MODES, STOP_TYPES, ROUTES };
