# Extension TypeScript and React implementation plan

Date: September 24, 2026

Status: Slice 1 complete, including clean-checkout and packaged native acceptance.
Slice 2 implemented; its packaged native run is pending CI (see its evidence).
Slices 3–6 have not started.

Baseline: `dev` at `4f66b0b` (merged v2 persistence and acceptance work)

## Goal and scope

Make the editor extension easier for a human to understand, change, and review
while preserving its current behavior. Use strict TypeScript for extension-owned
code, readable formatting and explicit data models, and React components for the
Tour sidebar. Keep VS Code editor operations and tour state authoritative in the
extension host.

This is a behavior-preserving migration, with no UI redesign, protocol change,
new tour feature, or rewrite of the MCP server. Shared runtime contract modules
remain JavaScript so the MCP server can still run directly from the repository
without installation or compilation. Those modules will receive checked type
annotations where needed; their generated extension copies are not independently
maintained TypeScript implementations.

The estimate is **3–5 engineer-days through the TypeScript phase** and **5–9 days
total with React and final acceptance**, assuming familiarity with this code and
no substantial behavior defects uncovered during migration. The largest
uncertainties are typing native tab/layout state and preserving sidebar focus
and scrolling. Re-estimate after slice 1 if either needs broader changes.

## Decisions

1. **TypeScript first, React second.** Finish an installable TypeScript version
   with the existing sidebar behavior before changing how the UI renders.
2. **Use React only in the webview.** The host remains ordinary TypeScript
   modules using the VS Code API. The sidebar receives snapshots and sends typed
   requests; it does not implement editor placement, persistence, or navigation
   authority. Local UI state covers filtering, grouping, picker visibility, and
   focus only.
3. **Use esbuild for distributable bundles and TypeScript for checking.** Produce
   a Node/CommonJS host bundle with `vscode` external and a separate browser
   bundle. Browser code must not import Node or VS Code runtime modules. Add an
   explicit type-check step because bundling alone does not check types.
4. **Keep shared contracts compatible with direct Node execution.** Continue
   using `contract/` as the runtime source of truth and its existing sync/drift
   checks during this migration. Add shared type declarations and JSDoc imports
   to the canonical JavaScript, and check those modules against the declarations.
   Do not hide mismatches behind declarations or duplicate validators in React.
5. **Use strict types at real boundaries.** Represent loaded/unloaded snapshots,
   placement actions, message variants, source sides, and saved layout versions
   explicitly. Receive external JSON as `unknown` and retain runtime validation
   before treating it as a domain value. Distinguish wire input, normalized
   plans, host records containing native handles, and serializable snapshots.
6. **Improve readability deliberately.** Expand compressed control flow, use
   descriptive names, and extract helpers around identifiable responsibilities.
   Configure a formatter for the migrated sources. Avoid unrelated algorithm
   changes, broad repository formatting, blanket `any`, `@ts-nocheck`, and casts
   that merely silence a mismatch.
7. **Bundle all browser dependencies locally.** React adds shipped runtime code
   to the sidebar and supersedes the historical zero-runtime-dependencies rule
   for that surface. Installation still needs no package download or dev server;
   the MCP server remains dependency-free. Preserve the restrictive webview CSP,
   local resource boundaries, theme tokens, and escaped narration handling.

Suggested source layout (retain current module names when practical):

```text
editor-extension/
  src/
    extension.ts
    host/                    # current lib responsibilities
    shared/                  # host/webview messages and snapshot types
    webview/
      index.tsx
      App.tsx
      components/
      sidebar-model.ts
      bridge.ts
  media/tour.css             # existing styling, retained initially
  lib/                       # generated shared JS copies during migration
  dist/extension.js          # packaged host bundle
  dist/webview.js            # packaged browser bundle
  test/                     # existing Node and native suites, plus UI tests
```

Separate host and webview TypeScript configurations must keep Node and DOM
globals from leaking across environments. Generated output is ignored by Git.
Shared browser imports must be type-only unless the implementation is explicitly
browser-safe. Keep `acquireVsCodeApi()` in one bridge module.

## Delivery slices

Execute slices in order. Each slice ends with a working package, focused
verification, a commit, a push, and a reviewable PR against `dev` (or an explicitly
documented predecessor while stacked). Keep unfinished PRs draft and mark a
finished slice ready for review. Update this plan's checkboxes and record actual
evidence as work lands. Implementation work should maintain a Kankō review map.

### Slice 1 — Build foundation and baseline (0.5–1 day)

- [x] Run the existing repository, contract, MCP, extension-unit, and packaged
  native integration checks from the baseline. Record actual results and platform.
  Existing reports are comparison material, not fresh proof.
- [x] Add TypeScript, matching Node/VS Code types, esbuild, scoped formatting,
  strict host/browser configurations, and reproducible lockfile updates.
- [x] Introduce `build`, `watch`, `typecheck`, and `format:check` scripts. Connect
  `vscode:prepublish` to the required checks/build so a clean package cannot omit
  compilation. Initially allow unmigrated JavaScript while converted modules are
  checked strictly.
- [x] Prove the pipeline by converting the activation entry point and a small
  pure helper. Keep the rest behaviorally unchanged.
- [x] Update `package.json` entry point/files, local development instructions,
  `scripts/build-vsix.sh`, and `.github/workflows/extension.yml` for generated
  artifacts. Preserve the supported VS Code/Node versions.
- [x] Adapt `scripts/check-vsix.py`: validate an explicit artifact allowlist,
  compare packaged files with fresh build output, and reject tests, source-only
  files, stale legacy entry points, and accidental dependency directories. Avoid
  weakening it to a check that merely confirms the archive opens.
- [x] Preserve the existing Node test runner. Compile migrated modules into an
  ignored test output directory and update test imports through a small shared
  test helper. Compile once before running the tests. Native integration continues
  to exercise the actual extracted VSIX, not the test output.

Evidence: [slice 1 verification](verification/extension-typescript/slice-1.md).
The matching VS Code 1.139 type package is not yet published; 1.138 types are
pinned without lowering the supported engine version.

**Exit:** A clean checkout can install development dependencies, check types,
run the existing tests, build/package, pass archive inspection, and activate the
packaged extension in the isolated native test host. Build failures fail CI.

### Slice 2 — Shared models and pure logic (0.75–1.25 days)

- [x] Define shared types for anchors, spans, revisions, beats, stops, normalized
  plans, findings, presentation snapshots, placement options, and saved layouts.
  Preserve 1-based inclusive wire ranges and existing serialized field names.
- [x] Define host-to-webview and webview-to-host message unions, including ready,
  snapshot, error, anchor selection, navigation, mode, and layout requests.
  Include revision requirements in the appropriate action types.
- [x] Add checked annotations to shared contract entry points in `contract/`;
  sync declarations/annotations needed by the generated copies and retain drift
  checks. Clarify in `contract/README.md` that type-only changes do not change the
  wire protocol; preserve the version-bump rule for actual wire changes.
- [x] Migrate the pure identity, range, citation, layout-model, layout-state, and
  sidebar-model code. Model invalid/unloaded cases instead of asserting them away.
- [x] Add focused compile-time checks for invalid message combinations and
  loaded-state narrowing. Preserve runtime fixtures for malformed input and
  source validation; types do not establish runtime safety.

Evidence: [slice 2 verification](verification/extension-typescript/slice-2.md).
"Range" is the hunk range mapper (`src/host/hunks.ts`); citation moved in slice 1.
Only tests reach `src/host/identity.ts` (migrated as planned), `lib/anchors.js`,
and the legacy `presentation`, `editor`, `git`, and `decorations` modules; the
shipped bundle does not. Decide in slice 3 whether to convert or retire them.

**Exit:** The host and sidebar share one definition of each transported data
shape. Existing serialization and validation results are unchanged. MCP tests
still run with plain Node without an MCP build or new runtime dependency.

### Slice 3 — Host migration and readability (1.25–2 days)

- [ ] Convert host modules in dependency order: Git/transport and source helpers;
  opening/decorations/presentation; layout engine; controller, host, and webview
  provider. Use official VS Code types and narrow native tab input variants.
- [ ] Type injected dependencies by the capabilities actually used so test fakes
  remain meaningful. Do not cast incomplete fakes to the entire VS Code API.
- [ ] Separate persisted layout data, native tab ownership records, placement
  choices, and published presentation state. Make optional lifecycle state clear.
- [ ] Expand dense controller/layout branches and name meaningful intermediate
  values while preserving queue ordering, observation timing, and cleanup rules.
- [ ] Convert the existing imperative sidebar script to TypeScript without React
  yet. Type DOM elements and events, and use the shared message bridge.
- [ ] Retain validators for HTTP requests, webview messages, and saved state.
  Keep protocol versions, command identifiers, settings, persistence keys, and
  stored representation compatible.
- [ ] Remove the migration allowance for extension-owned JavaScript. Keep the
  explicit checked-JavaScript exception for shared runtime contract modules;
  existing JS tests and build scripts need not all become TypeScript.

**Exit:** Strict checks pass across extension-owned source without broad escape
hatches. Existing unit and packaged native integration tests pass. The resulting
VSIX preserves tour loading, presentation, persistence, and reviewer tab ownership.

### Slice 4 — TypeScript phase acceptance (0.5–0.75 day)

- [ ] Run the full repository suite and packaged native acceptance; verify the
  clean build and package path used by CI.
- [ ] Smoke-test the actual sidebar, editor navigation, placement, pause/end, and
  real-window reload using isolated profiles and representative existing scenes.
- [ ] Check that a saved arrangement created by the baseline extension still
  loads with the migrated version in an isolated persistent profile.
- [ ] Document commands, build output, shared-code exception, and evidence.
  Mark the TypeScript PR(s) ready before starting the React conversion.

**Exit:** The TypeScript migration is independently shippable and reviewable.

### Slice 5 — React sidebar and rendered interaction tests (1.5–2.5 days)

- [ ] Add React and its types to the locally bundled webview build. Replace the
  HTML body template with an application mount point; retain CSP, resource URIs,
  and the ready handshake in the provider.
- [ ] Extract `TourHeader`, `ModeControls`, `AnchorList`, `AnchorRow`,
  `PlacementPicker`, `Narration`, and `TourNavigation` where each has a clear
  responsibility. Preserve the current CSS, DOM semantics, icons, and visual order.
- [ ] Keep the latest authoritative snapshot separate from local UI state.
  Derive rows and warnings rather than keeping duplicate copies in React state.
  Preserve stale-revision rejection and ensure outgoing actions use the current
  revision. Clean up message listeners and observers on unmount.
- [ ] Preserve filter/group reset rules, keyboard shortcuts, row windowing,
  scrolling, picker focus/return, disabled controls, accessible labels, live
  narration, and immediate role tooltips. Use stable identities for component
  keys so incoming snapshots do not unnecessarily recreate focused controls.
- [ ] Keep narration's existing escaped HTML boundary and numbered-chip actions;
  do not introduce a second Markdown renderer or trust arbitrary message HTML.
- [ ] Add rendered component interaction tests using Testing Library and a DOM
  environment with an explicit VS Code bridge fake. Cover messages, navigation,
  filtering, grouping, picker actions, disabled states, and focus restoration.
  Keep real browser/native checks for geometry, scrolling, and CSP behavior that
  a simulated DOM cannot prove.

**Exit:** The React sidebar preserves observable behavior and passes interaction
tests. The packaged extension loads the production browser bundle successfully.

### Slice 6 — Final native and visual acceptance (0.5–1.5 days)

- [ ] Run strict checks, formatting, repository/contract/MCP/unit/UI tests,
  release metadata validation, packaging, archive inspection, and the native
  suite against the extracted VSIX. Confirm Linux CI as well as local macOS.
- [ ] Exercise the observable checklist below through the actual VS Code UI.
  Capture representative screenshots, native results, and a real-window reload.
- [ ] Record bundle sizes versus the baseline and replay the 99-anchor scenario
  for responsiveness; investigate noticeable regressions. Do not invent a new
  performance SLA from a single local timing.
- [ ] Remove obsolete handwritten browser scripts and migration-only adapters;
  update development/release documentation and record third-party notices as
  required for bundled dependencies.
- [ ] Add a verification report under `docs/verification/extension-typescript/`
  with commands, environment, results, screenshots, and explicit verification
  limits. Mark implementation PRs ready when their acceptance is complete.

**Exit:** A clean-checkout VSIX is ready for review, with separate evidence for
type safety, host behavior, rendered interactions, and actual native presentation.
Publishing to the Marketplace is a separate release action.

## Observable acceptance checklist

| I should be able to… | Required evidence |
| --- | --- |
| Load the same authored tour and navigate stops/beats with unchanged narration and source identity | Contract/MCP tests, packaged native suite, actual sidebar navigation |
| Use Following, Exploring, and Paused without unintended editor movement | Native assertions and sidebar interaction |
| Find anchors at 1, 3, 7, 12, 24, and 99 items through roles, filtering, and numeric shortcuts | Component tests plus native UI at every required count |
| Navigate rows by keyboard, open/close the picker, and keep sensible focus after snapshots and scrolling | Rendered tests plus real UI keyboard/scroll checks |
| Place, move, pin, peek, remember a role destination, reset, and override Sequence | Native suite and picker interaction; include all-pinned and cramped cases |
| Leave a stop, return, and reload the editor without losing a valid arrangement | Native assertions and a persistent-profile real-window reload |
| Keep dirty, pinned, moved, and otherwise reviewer-owned tabs through pause/end | Packaged native ownership/cleanup tests |
| Inspect removed/deleted sources, repeated anchor colors, and numbered narration links | Native suite and representative screenshots |
| Read the same sidebar in dark, light, and high-contrast themes | Actual VS Code screenshots and accessible-name checks |
| Reject stale/malformed actions and invalid saved/source data as before | Runtime contract, controller, provider, and persistence tests |
| Install the VSIX and run the MCP server without a development server or runtime package install | Extracted-package native run and direct Node MCP tests |

Use the existing [v2 closeout acceptance](verification/kanko-v2-closeout/README.md)
and [sidebar acceptance](verification/kanko-v2-sidebar/README.md) as behavior
references, not as proof that the migrated version passes.

## Risks and controls

- **Types accidentally change behavior:** preserve wire/runtime fixtures and
  separate raw from normalized values. Treat newly discovered defects as explicit
  fixes with their own regression evidence rather than incidental migration edits.
- **Native lifecycle regressions:** preserve controller serialization and tab
  ownership logic; test pins, dirty tabs, external moves, rapid navigation, and
  durable reload against the packaged extension.
- **React changes focus or scrolling:** preserve stable keys and test complete
  user interactions, including virtualized rows and updates while a picker is open.
- **Build works locally but VSIX is incomplete:** compile from a clean checkout,
  inspect an explicit archive allowlist, and execute the extracted artifact in CI.
- **Shared JavaScript types drift:** check annotated implementations against
  shared declarations, retain copy-drift checks, and run contract fixtures on
  both consumers. Do not introduce an MCP compilation requirement.
- **Scope expands into a UI rewrite:** preserve styles and existing behavior.
  Record proposed redesigns separately after parity is established.

Each completed slice remains usable, and reverting its PR provides a recovery
path. No persisted-data migration or protocol negotiation change is planned.

## First implementation task

Start **slice 1: build foundation and baseline** from current `dev` in an isolated
worktree. Establish the fresh baseline, wire strict checking and packaging, and
convert only the entry point plus one pure helper to prove the complete path.
The first PR should make the new build boring and reproducible before the bulk
of the source migration begins.
