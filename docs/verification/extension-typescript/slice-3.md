# Slice 3: host and sidebar TypeScript

Base: merged PR #16, `a91db0448d11655c52ed4c91814b7af33570d087`.
Branch: `codex/extension-typescript-slice3`. September 25, 2026.

## Changes

- Converted all remaining shipped host modules and the imperative sidebar to
  strict TypeScript. Shared JavaScript remains checked and directly runnable by
  MCP. The package still contains only two generated bundles and static assets.
- Named the controller state, captured sources, native tab records, saved data,
  and snapshots separately. Injected dependencies use the VS Code capabilities
  each module needs, with compile-time checks for small fakes.
- Expanded controller and layout branches, named intermediate values, and
  shortened comments. Queue order, observation timing, placement choices,
  tab ownership, persistence keys, and serialized tour fields are preserved.
- Requests enter as unknown. Load metadata now receives structural checks before
  source readers run; malformed manifests or claim summaries are rejected.
  These checks are an explicit tightening of malformed input, covered by tests.
  Optional metadata within a tour plan remains unchecked and unknown, as in
  slice 2. Protocol version 3 and existing fixtures are unchanged.
- Moved the retired, unshipped presentation helpers into test fixtures and
  removed the unused legacy editor. Existing regression tests remain enabled.
  Moved three HTTP/MCP bridge tests into the extension suite, preserving the
  standalone MCP test command without requiring an extension build.

## Verification

- Baseline: 234 tests passed on macOS.
- Candidate: 236 tests passed, including new load-input and native-tab checks.
- Strict host, browser, shared JavaScript, and compile-time checks pass.
- Clean Node 22 build, formatting, six archive rejection tests, packaging, and
  fresh-build byte comparison pass. The VSIX contains 11 files.
- Final extracted-VSIX native run: all 30 scenarios passed on macOS with VS Code
  1.139.0, using an isolated profile. Fresh-build comparison matches that package.
- Standalone MCP: 49 tests passed using plain Node, with no MCP compilation.
- The focused pin/return/reload scenario passed 40 consecutive native runs in an
  isolated local profile, with failure diagnostics matching the committed test.
- Bundle sizes: host 125,286 bytes; browser 22,675 bytes.

## Intermittent CI failure

The first Linux native run at `79fabb6` restored anchors `[1, 3]` but failed the
saved-pin assertion. Rerunning the same commit passed. The local full suites and
40 focused repeats also passed. The assertion remains unchanged, with both the
before-clear and reloaded snapshots now included in failure output.

The cause is not established. This remains a known intermittent restore risk;
it is not claimed fixed or attributed to the baseline. Track any recurrence
while carrying out slice 4's persistent-profile acceptance.

## Limits

This completes the implementation scope of slice 3. Slice 4 still covers manual
sidebar interaction, real-window reload, and loading a baseline saved layout in
a persistent profile. React, rendered interaction tests, theme screenshots, and
accessibility acceptance remain in later slices. Automated native scenarios do
not replace those checks.
