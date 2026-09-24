# Phase 4 acceptance: multiple anchors and tab ownership

**Status: automated checks pass; required screenshot acceptance is incomplete.**

Computer control reported that the Mac remained locked on 2026-09-24. No
screenshots were captured and no mouse/keyboard visual acceptance was completed.
The PR stays draft until the visible criteria below are proved in the editor.

## Evidence

- 197 dependency-free tests pass, including source matching, buffer drift,
  tab ownership/adoption, group allocation, captured-text hunks, and bounded
  six-color decoration allocation.
- All 13 native integration checks pass against the extracted VSIX in VS Code
  1.139.0 on macOS. The 32 packaged files match source.
- [Native observations](automated.json) contain returned presentation snapshots
  and tab-preservation results. [Check metadata](checks.json) records the package
  digest and the screenshot blocker. No lockfiles or authentication tokens are
  included.

The fixture uses synthetic code and a disposable repository, dossier store, and
VS Code profile. It executes the real public MCP operations and extension.
Native tests prove document/tab behavior; they do not prove how decorations,
colors, labels, badges, or tooltips look on screen.

## Acceptance matrix

| I should be able to… | Current evidence | Required visual proof |
| --- | --- | --- |
| See both implementation and evidence for a beat | `load`: two visible anchors plus a base companion; normal head file URIs | Pending: both sources, numbered colored rails and labels, sidebar chips |
| Identify each source consistently | Six reusable palette sets tested; status/labels/badge provider implemented | Pending: matching chip, tab badge, inline label, status bar identity |
| Present three anchors without a fourth group | `three-anchors-peek`: three visible anchors, three groups, seam/peek mode | Pending: all three sources and working Peek removed code link |
| Peek at pinned base code while reusing my real-file tab | `retained-peek-source`: one real tab, base text remains available | Pending: working Peek removed code interaction |
| Inspect two disjoint ranges in one source without duplicate tabs | `same-source-identity`: selected anchor 4 visible, anchor 1 open, one source tab | Pending: anchor 4's badge/color/label and focused range |
| Keep my unsaved changes while reviewing pinned source | `dirty-head-protected`: stale real source, pinned replacement, dirty tab retained after ending tour | Pending: stale rail/message, immutable source alongside unsaved buffer |
| Pin a tour tab and keep it after advancing | `pinned-tab-protected`: pinned tab retained, ordinary old previews closed | Pending: pinned tab after stop navigation |
| Keep an existing reviewer preview untouched | `reviewer-preview-protected`: same tab survives loading and ending | Pending: before/after editor screenshot |
| Move a tab and keep ownership | Unit test permanently releases moved tabs, including after moving back | Pending: real editor drag and survival after cleanup |
| Explore with a mouse/keyboard selection and resume Following | Event handling excludes programmatic selection; mode tests pass | Pending: real selection, Exploring state, resume |
| End a tour without closing my work | Native dirty, pinned, and reviewer-preview protection; no review acceptance created | Pending: final editor tabs and empty sidebar |

Phase 3's screenshot gap remains explicitly recorded in its own report. Its
merge does not retroactively supply visual evidence for either phase.

## Reproduce

Run the dependency-free suite from the repository root:

```sh
node --test test/*.test.js mcp/test/*.test.js editor-extension/test/*.test.js
```

Package with the extension's locked development dependencies and validate using
`python3 scripts/check-vsix.py <vsix>`. Extract it and run:

```sh
EXTENSION_PATH=/absolute/path/to/extracted/extension \
RELAY_TOUR_OUTPUT=/absolute/path/to/results \
RELAY_TOUR_MANUAL=1 node editor-extension/test/integration/runner.js
```

Once the disposable **Relay acceptance · workspace** window is ready, exercise
the matrix and save unedited screenshots here. The fixture's control file can
reload, submit an invalid load, record a snapshot, or finish; it never supplies
visual proof by itself. Windows, remote workspaces, and alternative language
server configurations are not verified by this run.

## Scope

This phase uses simple bounded column allocation. Role-aware shapes, placement
choices, custom pin controls, same-color separation, Sequence mode, the full
anchor list, and layout restoration belong to later phases. Presentation pause
clears decorations while preserving the editor arrangement.
