# Task 6 native acceptance

Verified the packaged Kankō extension in an isolated VS Code 1.139.0 development host on macOS, with vertically stacked editor groups. Explicit split-placement scenarios additionally exercise Below/Beside shapes. Screenshots are unmodified native captures of real source-backed tours; they are not mockups or browser approximations.

## Styling refinement

The latest styling is shown in [the wider sidebar](20-refined-wide.png), [the narrow sidebar](21-refined-narrow.png), and [keyboard-focused row actions](22-refined-keyboard-actions.png). These supersede the row styling in screenshots 01–19, which remain functional evidence.

Rows are 68px instead of 88px, with regular-weight monospace filenames, filled change badges, a shared subtle highlight, and separated row backgrounds. File roles remain visible. Pin/Move appear on hover or keyboard focus and stay visible for pinned rows. Position and Open controls fit inside the scrollport at the tested narrow width; long names and descriptions use ellipsis with full identity in the tooltip. The virtual list uses the same shorter row measurements.

Rechecked all 216 automated tests and 23 native scenarios. The final spacing adjustment was reloaded and visually checked in that native session. The final VSIX source parity check covers the updated CSS. Native visual coverage remains macOS dark theme.

## Observable criteria

| I should be able to… | Evidence |
| --- | --- |
| Map all three compact-stop numbers to filenames and roles before interpreting the beat | [Compact inventory and full-cap picker](01-compact-picker.png) |
| Peek at an unopened caller without replacing my stacked editors | [Native Peek widget](02-peek.png) |
| Remember a role destination, reset, and reuse it on the next opening | [Remember selected](03-remember-placement.png), [destination reused](04-remember-reused.png) |
| Pin the top source and see only the remaining eligible replacement | [Pinned picker](05-pinned-picker.png) |
| Find every file in a nine-anchor stop, including unopened files outside the beat | [Grouped stop](06-grouped-stop.png), [lower role sections](07-role-sections.png) |
| Advance the beat without losing the stop inventory or renumbering files | [Second beat](08-next-beat-inventory.png) |
| Search by filename and choose placement with Enter | [Fuzzy picker](09-fuzzy-file-picker.png), [keyboard placement](10-keyboard-placement.png) |
| Replace the previously focused group with Shift+Enter or peek with Alt+Enter | [Keyboard replacement](11-keyboard-replace.png), [keyboard Peek](12-keyboard-peek.png) |
| Browse a large stop without rendering all 99 rows at once | [Collapsed inactive roles](13-large-stop-collapsed.png), [filter to 99](14-filter-anchor-99.png), [End key reaches 99](15-virtual-list-end.png) |
| Select a two-digit anchor with Alt+Shift+9 | [Anchor 19 placement](16-two-digit-shortcut.png) |
| See Below/Beside diagrams and open a file below the existing source | [Split choices](17-split-picker.png), [stacked result](18-below-result.png) |
| Move a visible file without leaving a duplicate tab | [Moved file](19-moved-without-duplicate.png) |

The nine-anchor fixture includes every role. Each compact/grouped row retains its role even when it appears in In view. Native assertions compare the complete stop anchor collection across two different beat subsets. Large-stop filtering and End navigation were checked through real keyboard/UI actions; the accessibility tree contained only the viewport and overscan rows.

## Automated checks

- 216 unit, contract and MCP tests passed, including stop-wide inventory, virtualization, preview choices, reset behavior, revision-bound webview actions and ready-handshake delivery.
- 23 packaged native scenarios passed, including the earlier navigation, dirty/kept tabs, removed sources, cap/pin/customization and Sequence regressions; new scenarios cover all-role inventory across beats, real tab moves, native group renumbering and 99 source-backed anchors.
- All 36 VSIX files match packaged source; release metadata validation and whitespace checks pass.
- `checks.json` records the bounded final test results and native scenario names.

Commands from the repository root:

```sh
TMPDIR=/private/tmp node --test test/*.test.js mcp/test/*.test.js editor-extension/test/*.test.js
npm run package --prefix editor-extension
python3 scripts/check-vsix.py editor-extension/kanko-0.1.0.vsix
node scripts/check-extension-release.js
```

Extract the VSIX and run `editor-extension/test/integration/runner.js` with `EXTENSION_PATH` pointing to the extracted extension. `VSCODE_EXECUTABLE_PATH` can select an isolated local editor. For visual replay, set `KANKO_TOUR_MANUAL=1` and `KANKO_TOUR_OUTPUT` to a temporary output directory. Once `ready.json` exists, atomically write `control.json` with `{"id":"compact","action":"sidebar","options":{"count":3,"cap":2}}`, or use count 9/99 for grouped/large stops. `{"action":"layout","options":{"single":true,"cap":3}}` exposes Below/Beside choices. Interact with the actual sidebar, then send `{"action":"finish"}` to exit cleanly.

## Scope and findings

Visual checks cover macOS dark theme. The full theme/platform matrix remains task 8. Role preferences survive Reset within the loaded tour; disk persistence and return/reload restoration remain task 7. Preview cards communicate topology and numbered occupants, not exact pixel sizes of reviewer-resized groups.

Native verification found two issues that were repaired: the convenience Peek command returns before the underlying operation, so the implementation now awaits `goToLocations`; moving the last tab out of a group may renumber the destination, so tab placement now follows the destination group object. The final native regression also checks that the preview omits the closing group. The manual fixture reader tolerates an incomplete control-file write; final verification exits successfully.

Screenshots 01–16 precede a small scrollbar-padding adjustment. Screenshots 17–19 include it. The final automated run additionally verifies the native empty-group preview correction; it does not change the stacked-group screenshots, whose profile keeps empty groups open.
