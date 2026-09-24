# Kankō v2 tasks 7–8: final acceptance

This completes the planned implementation after merged tasks 1–6. Verified on
September 24, 2026 with the packaged extension in VS Code 1.139.0 on macOS arm64.
The original specification is the private 22-page multi-file stops PDF; it is
not copied into this repository. Questions to an agent, ledger, and sign-off
screens remain out of scope.

## Observable acceptance

All screenshots are unmodified captures of the real native editor. Default
scenarios use vertically stacked groups. Grid, split-placement and Sequence
scenarios deliberately test other shapes.

| I should be able to… | Evidence and result |
| --- | --- |
| Arrange a stop, leave it, and return without losing my choices | Mouse placement, remembered caller destination, pin, and native splitter drag; [arrangement](01-arranged-and-pinned.png), [return](02-return-restores-arrangement.png). Native assertions compare exact geometry and occupants. |
| Reload the actual editor and recover the same valid arrangement | [Before](03-durable-before-reload.png), [after](04-durable-after-reload.png), [bounded snapshot comparison](reload-result.json). The window was reloaded through the command palette, then the same authored tour was loaded. Sources 1/3, pin 3, role preference and resized geometry survive. |
| Keep a source closed or moved without reviving an obsolete slot | Native `closed-anchor-return` and `reviewer-moved-tab`: close the test, or move the service to group 2, navigate away/back, check live tab identity, and end. Closed anchors stay closed on return; moved tabs retain their group and survive exit. |
| Discard stale saved layouts after a rename, changed source, or smaller cap | Native `renamed-source` resolves the destination path against both revisions; unit tests reject changed revision, changed anchor definition, wrong geometry, unknown/duplicate numbers and reduced cap. Saved numbers never become arbitrary URI or command inputs. |
| Reset the stop while retaining remembered role choices | Native `move-reset` and `persisted-return-reload`; pins/customization reset, role destination remains. Dirty, kept, native-pinned and reviewer-owned tabs remain protected. |
| Pause/end without losing my work or leaving disposable previews | [Paused cleanup](08-paused-cleanup.png); native dirty-head, paused-dirty, kept-tab, reviewer-preview, and reviewer-moved-tab assertions. Empty tour groups collapse; groups containing reviewer work are preserved. |
| Identify and inspect both the service change and its regression test | [Source-backed example](05-service-and-regression.png), [evidence beat](06-evidence-beat.png). The service diff has its filename and revision pair; anchors 1/2 have badges, rails, labels and correct focus boxes (service lines 5–7, test lines 9–12). The fixture regression itself executes successfully. |
| Navigate rapidly without accumulating duplicate tour tabs | Twelve queued stop changes pass native assertions with at most three tabs. Same-file anchors reuse one tab; ordinary preview tabs retire on stop changes. Explicitly kept/pinned/reviewer-owned tabs are intentionally retained. |
| Find all files regardless of the current beat | Native all-role inventory comparison retains the same complete anchors across two beat subsets. [Seven-anchor roles](11-seven-anchor-roles.png) and prior [task 6 interaction evidence](../kanko-v2-sidebar/README.md) cover neutral section icons, In View role icons, immediate hover/focus labels and visible placement controls. |
| Use every required inventory scale | [1: header](09-single-anchor.png), [3: compact picker](10-three-anchor-picker.png), [7: roles](11-seven-anchor-roles.png), [12: inactive sections collapsed](12-twelve-anchor-collapsed.png), [24: filter](13-twenty-four-filter.png), [99: keyboard search](14-ninety-nine-keyboard-picker.png) and [opened with badge 99](15-ninety-nine-open.png). Native source-backed checks cover all six counts. |
| Protect an all-pinned arrangement | [All-pinned picker](18-all-pinned-picker.png) offers only Peek; native navigation keeps the pinned tabs and reports the unopened anchor. Unpinning makes exactly that slot eligible. |
| Read cramped sources and override the fallback | [Sequence](19-sequence.png), [override](20-sequence-override.png); native long-source/font-size assertions confirm one group and then two. Short files do not trigger the fallback. |
| Inspect removed code even when its file no longer exists | [Deleted base source](07-removed-code.png); native tests also cover removed-line companions, seam Peek, dirty real files switching to immutable sources, and the group cap. |
| Read the presentation in light and high-contrast themes | [Light](16-light-theme.png), [high contrast](17-high-contrast-dark.png). Numbers, filenames, labels, role icons, rails and focus outlines remain identifiable. Dark Modern is used for the other inventory/identity screenshots. |
| Distinguish repeated colors without losing numbering | The 99-anchor scenario preserves numeric identity. The explicit native grid scenario places anchors 1 and 7 diagonally when an empty alternative exists. Pins, remembered destinations and source priority still take precedence. |
| Author a tour that shows evidence rather than merely mentioning it | Both repository skills specify five-word labels, evidence anchors with claim references, numbered narration, focused beats, recommended seven-anchor stops and appropriate source views. Contract/MCP validation remains source-backed. |

## Persistence and lifecycle contract

Profile-local `globalState` stores arrangements outside the repository, with a
hashed key for the canonical workspace and tour identity. Each stop is bound to
the exact change identity and its authored anchors/beats. It stores actual
nested geometry, visible semantic anchors, pins, activity order, customization,
Sequence and override state. Role destinations are tour-wide and survive Reset
and source refresh. They do not leak into another tour or workspace.

The engine observes the real editor before navigation and saves external moves,
closes and splitter changes. Returning restores a compatible arrangement once,
without immediately replacing it with the first beat's defaults. Visiting a stop
in Exploring defers restoration until Following. Invalid/version-incompatible
state falls back to a fresh arrangement.

Saved state never conveys tab ownership. On reload, existing tabs are treated as
reviewer-owned; matching tabs are reused where they are, and incompatible saved
placements cannot move or replace them automatically. To release those tabs for
a fresh default presentation, close them explicitly and use Reset. This is a
conservative protection boundary, not a promise to recover ownership across a
process restart. If reviewer work conflicts with a saved layout, its current
arrangement wins.

## Reconciliation with the original spec

- The capability spike established that `vscode.getEditorLayout` can read actual
  nested geometry. Persistence therefore includes sizes and custom geometry,
  beyond the PDF's named-shape sketch. It does not promise exact restoration of
  the entire pre-tour workspace or its selections.
- The PDF's unconditional single-group collapse on pause/end would move reviewer
  work. Cleanup collapses only an empty tour workspace and preserves protected
  groups, as required by the lifecycle acceptance.
- The PDF's strict color-adjacency sentence is impossible for two same-colored
  anchors in a two-group layout. The engine prefers a diagonal in a grid when
  available; the stable number is always the identity. User choices and pins win.
- The merged task 6 refinements supersede the mockup's bold filenames and repeated
  textual role labels: neutral section icons and In View role icons remain, with
  full accessible names and immediate hover/focus labels. This PR preserves them.
- Sequence uses the spike's conservative viewport rule: short files/EOF/folds
  cannot prove that a viewport is cramped. Removed-code companions share the cap.
- VS Code's automated extension-test host uses in-memory profile storage. An
  in-session load is not proof of disk persistence. The durable manual host
  separately proves the real window-reload boundary.

## Checks and reproduction

[`checks.json`](checks.json) records the final counts and native snapshot names:
227 repository/contract/MCP tests, 30 packaged native tests with 45 snapshots,
and 20 native screenshots. Package/source parity (37 files), release metadata
and whitespace checks pass. The [Linux build and packaged integration run](https://github.com/getkanko/kanko/actions/runs/36059246225) also passed.

Linux initially exposed a pin-restoration race: an editor observer awaiting
geometry could finish after navigation changed the stop. Observation now runs
inside the same controller queue as navigation and pin actions. A controller
regression verifies this ordering; both native platforms pass with the fix.

```sh
TMPDIR=/private/tmp node --test test/*.test.js mcp/test/*.test.js editor-extension/test/*.test.js
npm run package --prefix editor-extension
python3 scripts/check-vsix.py editor-extension/kanko-0.1.0.vsix
node scripts/check-extension-release.js
```

Extract the VSIX to a temporary directory. Set `EXTENSION_PATH` to its extracted
`extension` directory and `VSCODE_EXECUTABLE_PATH` to the isolated editor binary.
Run `editor-extension/test/integration/runner.js` for automated native scenarios.
Its normal profile uses stacked groups, with explicit shape-test exceptions.

For durable native interaction, run:

```sh
TMPDIR=/private/tmp node editor-extension/test/integration/manual-host.js /private/tmp/kanko-manual start
node editor-extension/test/integration/manual-host.js /private/tmp/kanko-manual persistence
node editor-extension/test/integration/manual-host.js /private/tmp/kanko-manual snapshot
# Use Developer: Reload Window in the native editor, then:
node editor-extension/test/integration/manual-host.js /private/tmp/kanko-manual check-reload
```

The helper prepares fixtures and uses public presentation endpoints. Use the
native UI for placement, pinning, dragging, navigation, filtering, theme changes
and reload. The `load`, `sidebar 1|3|7|12|24|99`, and `sequence` scenes support
visual replay. Close retained fixture tabs before switching to a fresh scene.
Both hosts isolate profile, extension and shared storage directories. The normal
editor profile and keychain are not used. The existing manual integration
`control.json` protocol must be written atomically (temporary file plus rename).

## Remaining verification limits

Fresh screenshots and physical interaction cover macOS 1.139.0 with Dark Modern,
Light Modern and Dark High Contrast. Linux packaged integration passed in PR CI;
Windows, remote hosts, non-US keyboard layouts, Light High Contrast and a full
screen-reader audit were not executed here. Existing TypeScript/Go symbol-provider
constraints remain as documented by the capability spike. No support for
per-editor-group colored chrome is claimed. These are release-matrix limits,
not missing task 7 persistence or task 8 inventory/lifecycle implementation.
