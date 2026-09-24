"use strict";

const PROTOCOL_VERSION = 3;

const ERROR_CODES = [
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
];

const SIDES = ["base", "head", "working"];
const MODES = ["diff", "file"];
const STOP_TYPES = ["context", "implementation", "risk", "evidence", "limitation"];

const ROUTES = {
  kanko_tour_status: { method: "GET", path: "/status" },
  kanko_tour_load: { method: "POST", path: "/tour/load" },
  kanko_tour_navigate: { method: "POST", path: "/tour/navigate" },
  kanko_tour_set_state: { method: "POST", path: "/tour/state" },
  kanko_tour_clear: { method: "POST", path: "/clear" },
};

module.exports = { PROTOCOL_VERSION, ERROR_CODES, SIDES, MODES, STOP_TYPES, ROUTES };
