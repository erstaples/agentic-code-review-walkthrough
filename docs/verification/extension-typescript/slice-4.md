# Slice 4: TypeScript acceptance

Verified September 25, 2026 on macOS arm64, VS Code 1.139.0.
Candidate: merged slice 3 at `1d8d037`. Baseline: `4f66b0b`.

## Package and tests

The clean Node 22 build path used by CI passed: dependency installation, 236
tests, strict checks, formatting, six archive rejection tests, packaging, and
fresh-build comparison. The archive contains 11 files. All 30 native scenarios
passed against its extracted extension. Shared JavaScript remains checked and
directly runnable by MCP; extension-owned sources are TypeScript.

## Native interaction

The actual sidebar was exercised in a dedicated VS Code app with an isolated,
persistent profile. No extension-test host was used for the reload checks.

- Opened the nine-anchor scene and placed caller 3 in place of evidence 2.
- Pinned caller 3 through the native command palette.
- Replaced the baseline extension with the extracted TypeScript package and
  invoked **Developer: Reload Window**. Reloading the same tour retained the
  two positions, caller pin, and customized state.
- Switched to Exploring and advanced a beat; the editors stayed in place.
  Returned to Following, visited the next stop, and returned to the first.
- Paused and resumed. Anchor controls were disabled while paused, and the
  retained sources and pin survived.
- Used the placement picker to put evidence 2 beside source 1 and enabled
  **Remember for evidence anchors**. All three sources appeared in the sidebar.
- Reloaded the real window again. Positions, the caller pin, and the evidence
  preference matched the saved snapshot exactly.
- Ended the tour. The sidebar returned to its empty state and retained the
  reviewer-owned source tabs.

[Bounded before/after comparisons](slice-4-reload.json) record both reloads.
Every extracted baseline file was compared with its source at `4f66b0b` before
the upgrade. The candidate used the same extension path and profile, so this
checks stored-data compatibility without changing the extension identity.

## Reproduction

Run `scripts/build-vsix.sh` with Node 22 and `TMPDIR=/private/tmp`, then extract
the VSIX. Run `test/integration/runner.js` with `EXTENSION_PATH` pointing to the
extracted extension and `VSCODE_EXECUTABLE_PATH` pointing to VS Code.

For durable acceptance, use `test/integration/manual-host.js <output> start`
with the baseline package, then its `persistence` scene. Make the arrangement
through the UI and save it with `snapshot`. Replace the extracted package at
the same path, reload through the command palette, then run `check-reload`.
Repeat `snapshot`, window reload, and `check-reload` after candidate placement.

## Limits

The intermittent Linux saved-pin failure from slice 3 did not recur in this
run; its cause remains unconfirmed. The final slice 3 Linux build and native
run passed at `041c2eb` (run `36096483216`). This acceptance adds no runtime changes.
React interaction tests, the full theme/accessibility matrix, screenshots,
and 99-anchor responsiveness checks remain in slices 5 and 6.
