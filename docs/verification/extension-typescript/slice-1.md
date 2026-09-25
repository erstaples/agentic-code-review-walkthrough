# Slice 1: build foundation

September 24, 2026. Branch: `codex/extension-typescript-foundation`.
Baseline: current `dev`, `f6a79e7652dcac48ec44c5192847c62ee6848449` (the approved
plan on top of `4f66b0b`). Scope is slice 1 only; slices 2–6 remain pending.

## Fresh baseline

macOS arm64, Node 24.19.0, installed VS Code 1.139.0:

- `TMPDIR=/private/tmp node --test test/*.test.js mcp/test/*.test.js editor-extension/test/*.test.js`: **227 passed**.
- `bash scripts/build-vsix.sh`: release metadata, clean dependency install,
  packaging and archive inspection passed; original VSIX contained **37 files**.
- Extracted that VSIX and ran `npm --prefix editor-extension run test:integration`
  with `EXTENSION_PATH` pointing to the extraction, the installed VS Code
  executable, a fresh isolated profile, and `TMPDIR=/private/tmp`: **30 native
  tests passed**, process exit 0.

The initial test run using the default macOS temporary directory failed the
existing review-map workspace canonicalization checks. Using `/private/tmp`
resolved all failures without a source change. A sandboxed GUI launch aborted;
the authorized isolated VS Code launch outside the sandbox passed.

## Candidate verification

- `TMPDIR=/private/tmp npm --prefix editor-extension run test:all`: **229 passed**
  (227 existing tests and two browser bundle/provider regressions).
- `python3 scripts/test_check_vsix.py`: **6 passed**, including stale/missing
  bundles, forbidden files/directories, duplicate entries and changed metadata.
- `npm run typecheck`, `npm run format:check`, release metadata validation,
  `npm run package`, and `python3 scripts/check-vsix.py <VSIX>` passed.
- Node **22.23.3**: complete `scripts/build-vsix.sh` passed, including `npm ci`,
  all tests/checks and fresh-build byte comparison.
- Temporary compiler probes confirmed host code rejects DOM globals, browser
  code rejects Node globals, and an invalid TypeScript assignment fails checking.
  Probes were removed before packaging.

The archive now contains **11 files**, with only generated host/browser bundles,
CSS, icons and release metadata. No runtime dependency installation is needed.
The archive checker rebuilds before comparing; the publish job also uses that
path when inspecting its downloaded artifact.

The new browser startup regression initially failed: bundling the universal
sidebar model selected its CommonJS export, leaving the old browser global
undefined. The sidebar now imports the existing model explicitly. The regression
passes without Node globals and observes the ready handshake. The provider test
also verifies the local script URI, resource roots and nonce CSP. The native host
suite alone had not detected this browser failure.

Final clean-checkout and extracted-package verification will be recorded here
before the PR becomes ready.

## Deliberate limits and follow-up

The TypeScript entry point still consumes inferred types from unmigrated
JavaScript. `allowJs: true` and `checkJs: false` are temporary migration settings;
this is not a claim of strict typing throughout the host. Two narrow JSDoc
annotations preserve inference for the controller queue's return type and host
storage option. Canonical shared contracts and their copy-drift checks remain
unchanged. Their checked annotations and shared models belong to slice 2.

The npm registry offered VS Code API types through **1.138.0**, not 1.139.0.
That compatible subset is pinned; the extension engine remains **^1.139.0**.
Node types target 22. React is not included.

This slice does not claim final rendered parity, keyboard/focus/scroll behavior,
all-theme screenshots, or a persistent-profile real-window reload. Those remain
the explicit acceptance work in slices 4 and 6. The browser smoke test checks
startup and the provider resource contract, not layout geometry.

Review map: `map_d4cd3779-2827-40bb-b3d4-67afeea5af15`.
