"use strict";

const PROTOCOL_VERSION = 1;

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
];

const SIDES = ["base", "head", "working"];
const MODES = ["diff", "file"];
const STOP_TYPES = ["context", "implementation", "risk", "evidence", "limitation"];

const ROUTES = {
  tour_status: { method: "GET", path: "/status" },
  tour_stop: { method: "POST", path: "/stop" },
  tour_focus: { method: "POST", path: "/focus" },
  tour_clear: { method: "POST", path: "/clear" },
  tour_context: { method: "GET", path: "/context" },
  tour_rebaseline: { method: "POST", path: "/rebaseline" },
};

module.exports = { PROTOCOL_VERSION, ERROR_CODES, SIDES, MODES, STOP_TYPES, ROUTES };
