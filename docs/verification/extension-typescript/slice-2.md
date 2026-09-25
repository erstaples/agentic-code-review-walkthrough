# Slice 2: shared models and pure logic

September 25, 2026. Branch: `claude/typescript-extension-migration-p2-w0w484`.
Baseline: `dev` at `b47268c` (slice 1 merged). Scope is slice 2 only.

## What changed

- **Contract declarations.** `contract/contract-types.d.ts` declares protocol
  constants, 1-based line ranges, anchors, focus spans, revisions, beats, stops,
  normalized plans, findings (with a closed code union), validation results,
  source readers, manifests, and narration inputs. `protocol.js`, `tour.js`,
  `tour-sources.js`, and `narration.js` reference them through JSDoc and are
  checked strictly by `tsconfig.contract.json`. `sync.js` copies the declarations
  into `editor-extension/lib/`; a new drift test compares them. MCP still runs
  the plain JavaScript directly.
- **Shared extension types** in `editor-extension/src/shared/`: `tour.ts`
  (re-exports the contract), `layout.ts` (shapes, slots, editor layouts,
  placement choices/options, role preferences, layout actions, and version 1
  saved layouts), `snapshot.ts` (loaded/unloaded tour snapshots and
  presentation/layout snapshots), and `messages.ts` (host→sidebar and
  sidebar→host unions; revisioned actions require `revision`).
- **Migrated pure modules:** `src/host/identity.ts`, `src/host/hunks.ts` (range
  mapping), `src/host/layout-model.ts`, `src/host/layout-state.ts`, and
  `src/shared/sidebar-model.ts` (used by both the sidebar and the host quick
  pick). The JavaScript originals are removed and callers import the compiled
  modules. `compatible()` is a type guard from `unknown` to `SavedStopLayout`,
  and stored layouts are read as `unknown` until checked.
- **Shared runtime definition.** The host's webview revision guard now uses
  `REVISIONED_MESSAGE_TYPES` from `messages.ts`. A type test proves that it lists
  exactly the revisioned message types. The controller's snapshot and the view's
  `publish` are annotated with `TourSnapshot`. `extension.ts` replaces its local
  snapshot, anchor, and slot types with the shared ones.
- **Compile-time tests** in `editor-extension/test/types/` run as part of
  `npm run typecheck`. They reject invalid message combinations, unnarrowed
  snapshots, validation results read without `ok`, unchecked stored layouts, and
  incomplete placements. They also check exhaustive host-message handling and
  that each protocol constant list equals its declared union.

Runtime edits beyond comments are deliberately equivalent rewrites that let the
checker follow existing guards. Examples include a `positiveInteger` guard in
`validRange`, `filename` via `lastIndexOf`, a typed blob cache lookup, and a
discriminated validator return. Wire field names, 1-based ranges, and fixtures
are unchanged. `PROTOCOL_VERSION` stays 3.

## Verification (Linux x64, Node 22.22.2)

- `npm --prefix editor-extension run typecheck`: host, webview, contract, and
  type-test configurations pass.
- `npm --prefix editor-extension run format:check`: pass (now includes
  `test/types/`).
- `npm --prefix editor-extension run test:all`: **230 passed**, 0 failed
  (baseline 229, plus the declaration drift test). This includes repository,
  canonical contract, direct-Node MCP, and extension unit suites.
- `bash scripts/build-vsix.sh`: clean `npm ci`, all tests, 6 archive-rejection
  tests, release checks, typecheck, formatting, packaging, and fresh-build
  archive comparison passed. The VSIX has **11 files** (54.24 KB), the same
  allowlist as slice 1.
- Probes: making `revision` optional produced an unused `@ts-expect-error`, and
  deleting one `ERROR_CODES` entry failed the completeness check. Both edits were
  reverted before the recorded runs.
- **Differential check** (scratch script, not committed): the migrated modules
  and annotated contract were compared with the baseline JavaScript from
  `b47268c` on the same generated inputs, including malformed values. There
  were no differences in any case. Coverage: `shapeFor`, `splitShape`, and
  `cramped` (3,000 each); `geometry` (543); `validLayout` and `compatible`
  (5,000 each); stored-layout `read` (3,000) and `write` (200); `parseHunks`,
  `seamLineFor`, `removedBaseLines0`, and `mapRange` (3,000 each); identity
  call sequences (3,000); sidebar `rows`, `entries`, `windowed`, and `position`
  (2,000 each); malformed `validateTourPlan` inputs (4,000); `rangeText`
  (1,000); and `filename`/`assertHardLimit` edge cases. A second near-valid
  generator compared 6,000 plans per seed, byte for byte, under two seeds.
  Each seed produced about 760 accepted plans, 150 overlap merges, 330 overlap
  conflicts, and 460 compatible saved layouts.

## Limits

- **The packaged native VS Code suite was not run locally.** This environment's
  network policy denies `update.code.visualstudio.com`, so the test host could
  not be downloaded. The extension workflow's `integration` job runs the suite
  against the extracted VSIX on the PR. Its result is the native evidence for
  this slice.
- Types describe validated data. They do not replace runtime validation.
  External JSON enters as `unknown`, and the validator, stored-layout checks,
  and HTTP/webview guards remain authoritative.
- One documented cast remains in the validator: its working copy is read with the
  intended plan shape and returned as `TourPlan` only when no error findings
  remain. Two invariant casts in normalization rely on validation having
  already read every source and resolved every active anchor number.
- `media/tour.js`, the controller, host, view, and layout engine remain
  unchecked JavaScript (slice 3). Only tests reach `src/host/identity.ts`,
  `lib/anchors.js`, and the legacy `presentation`, `editor`, `git`, and
  `decorations` modules; the shipped bundle does not.
- The sidebar's `selectAnchor.move` flag is typed because the sidebar reads it,
  but the host never sends it.
