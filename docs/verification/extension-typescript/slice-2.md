# Slice 2: shared models and pure logic

Reviewed PR [#16](https://github.com/getkanko/kanko/pull/16) at
`857e483f2da8e44fdfc4a40f829adedfb77530da`, against `dev` at `b47268c`.
Review and fixes: September 25, 2026.

## Scope

Shared types cover tours, snapshots, layouts, and host/sidebar messages.
Identity, range mapping, layout models, saved layouts, and the sidebar list
model now use strict TypeScript. The shared JavaScript modules use checked
JSDoc and still run directly in MCP. Compile-time tests run with `typecheck`.

## Findings fixed

- **Saved layouts:** the new type guard accepted an empty root, array nodes,
  invalid orientations, and falsy child lists. These could reach
  `vscode.setEditorLayout`. The guard now requires a valid root and checks every
  child. Regression tests verify rejection and confirm that restore discards a
  corrupt layout before issuing an editor command. This deliberately changes
  handling of malformed profile data; valid saved layouts remain supported.
- **Unchecked data:** optional plan metadata and revision names were typed as
  strings or arrays without validation. They now remain `unknown`, including in
  snapshots. Input anchors have separate types for fields filled by validation.
  The validator keeps its draft fields unknown and asserts checked types only
  after the relevant checks pass. Runtime and compile-time tests cover these
  boundaries without rejecting previously accepted metadata.
- **Remembered destinations:** the runtime produces custom labels such as
  `group2`, but the new type allowed only named positions. The type now includes
  custom labels. Runtime and compile-time tests cover a custom arrangement.
- Shortened the new comments, removed redundant explanations, and corrected
  the comment about working-tree source identities.

## Verification

Local environment: macOS arm64; package build on Node 22.23.3; native acceptance
on installed VS Code 1.139.0 using the extracted VSIX and an isolated profile.

- Original PR head: **230 tests passed** before the fixes.
- Fixed candidate: **234 tests passed**, with no failures or skipped tests.
- Strict type checks and formatting checks passed.
- `bash scripts/build-vsix.sh` passed: clean dependency install, all tests,
  6 archive-rejection tests, release checks, type checks, formatting, packaging,
  and fresh-build comparison. The VSIX contains 11 files.
- Packaged native VS Code acceptance: **30 scenarios passed**, exit code 0.
- A temporary comparison script tested the original and fixed validators on
  **1,622 inputs**, including malformed fields, omitted defaults, metadata, and
  overlapping anchors. Results matched exactly; 374 cases were accepted and
  179 produced overlap-merge findings.
- Audited added comments against the requested wording restrictions. Remaining
  occurrences in import paths and filenames are identifiers, not prose.

## Limits

The controller, host, view, layout engine, and imperative sidebar remain
unchecked JavaScript until slice 3. This slice does not establish later React,
keyboard, theme, or accessibility acceptance. Types do not replace runtime
validation. The saved-layout fix affects private profile state and does not
change tour message fields, fixtures, or `PROTOCOL_VERSION` (3).
