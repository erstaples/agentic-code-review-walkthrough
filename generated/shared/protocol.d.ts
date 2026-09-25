// Generated from TypeScript. Run npm run runtime:build in editor-extension.
declare const PROTOCOL_VERSION = 3;
declare const ERROR_CODES: readonly [
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
declare const SIDES: readonly ["base", "head", "working"];
declare const MODES: readonly ["diff", "file"];
declare const STOP_TYPES: readonly [
  "context",
  "implementation",
  "risk",
  "evidence",
  "limitation",
];
declare const ROUTES: {
  kanko_tour_status: {
    method: string;
    path: string;
  };
  kanko_tour_load: {
    method: string;
    path: string;
  };
  kanko_tour_navigate: {
    method: string;
    path: string;
  };
  kanko_tour_set_state: {
    method: string;
    path: string;
  };
  kanko_tour_clear: {
    method: string;
    path: string;
  };
};
export { PROTOCOL_VERSION, ERROR_CODES, SIDES, MODES, STOP_TYPES, ROUTES };
