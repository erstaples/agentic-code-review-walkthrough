# Task 5: layout engine acceptance

Verified September 24, 2026 on macOS arm64, VS Code 1.139.0, with the
packaged `getkankodev.kanko` 0.1.0 extension. Production candidate: `1717450`.
The ten screenshots were captured at `d03cf37`; the final guard change prevents
automatic growth with pins and avoids closing customized companion groups.
Those additional cases pass in the final packaged suite; the pictured scenarios
remain applicable. Later commits add evidence only. Base: `dev` at `fe95fd9`.

## Results

- 208 unit, contract and MCP tests pass.
- 19 native integration scenarios pass against the extracted VSIX, followed by
  a completed manual screenshot session. The host exited with code 0.
- Release metadata and all 34 packaged files match the source.
- Ten unmodified screenshots show actual editor interaction and presentation.
- The primary branded checkout remained on `dev`; work was isolated.

[Automated snapshots](automated.json) include the six shapes, caps 2/3/4,
all-visible preservation, all-pinned refusal, unpin replacement, customized
geometry, Exploring, both split-row placements, remembered role destination,
Sequence and its override, pinned layouts below capacity, and customized
companion groups with native empty-group cleanup enabled. Placement checks also run with the normal
`closeEmptyGroups` behavior enabled. [Check summary](checks.json) identifies
the candidate and test commands.

## User-visible acceptance

| I should be able to… | Procedure and observed result | Screenshot |
| --- | --- | --- |
| Start with vertically stacked sources | Loaded the two-anchor fixture with stacked orientation. Both identities and full labels are visible. | [Starting layout](01-stacked.png) |
| Pin both sources and advance safely | Used the command palette on each editor, then clicked Next beat. Both files remained; the sidebar reported two pins and one unopened source. | [All pinned](02-all-pinned.png) |
| Release one slot for a missing source | Unpinned the second anchor through the palette and clicked citation 3. Only the unpinned evidence source was replaced. | [Unpin and open](03-unpin-replaces.png) |
| Resize my editors without later reshaping | Dragged the horizontal divider from about y=873 to y=1100, then advanced twice. The four-anchor beat retained the two unequal groups and left missing sources unopened. | [Manual resize](04-reviewer-resize.png), [After navigation](05-custom-layout-retained.png) |
| Explore while narration advances | Clicked Exploring, then Next beat. The same two sources and divider position remained while the narration cited different files. | [Exploring](06-exploring-retained.png) |
| Read a cramped stop one source at a time | Loaded the long-source fixture with fallback enabled. The engine used one group and showed a Sequence explanation. | [Sequence](07-sequence.png) |
| Override Sequence in one click | Clicked Show multiple groups. Both long sources returned in stacked groups and the note disappeared. | [Override](08-sequence-override.png) |
| Keep the configured group limit | Loaded the four-anchor fixture at cap 3, then cap 4. Three showed one unopened source; four showed all four, without extra groups. | [Cap 3](09-cap-three.png), [Cap 4](10-cap-four.png) |

Fixture loads/configuration changes establish reproducible inputs. Pins,
unpinning, citation focus, navigation, splitter dragging, Exploring and the
Sequence override above were exercised through the actual editor UI. The full
placement picker remains task 6; placement semantics are exercised through the
extension command in the native suite, not claimed as completed picker UI.

## Scope and limits

Stacked orientation is the test default. The final two screenshots explicitly
verify the specified split-row/grid shapes rather than three or four full-width
rows. Narrow half-width groups can clip the existing inline label's trailing
text; number, tab filename and citation tooltip retain the source identity.
The full anchor list and placement controls in task 6 remain necessary.

This run covers macOS and the dark theme. Other operating systems, themes,
long-session persistence, reset and exact pre-tour restoration remain task 8
acceptance or task 7 implementation; they are not implied by these results.

The disposable acceptance app is the locally signed copy used in prior phases.
It is launched outside the restrictive shell sandbox, which previously caused
macOS application-registration crashes. No installed editor profile or global
security setting was changed. The current packaged run completed normally.

## Reproduce

```sh
TMPDIR=/private/tmp node --test test/*.test.js mcp/test/*.test.js editor-extension/test/*.test.js
npm ci --prefix editor-extension
npm run package --prefix editor-extension
python3 scripts/check-vsix.py editor-extension/kanko-0.1.0.vsix
```

Extract the VSIX, then run the native fixture with `EXTENSION_PATH` pointing to
its `extension` directory, `VSCODE_EXECUTABLE_PATH` to an installed VS Code binary,
and `KANKO_TOUR_OUTPUT` to a disposable output directory. Set
`KANKO_TOUR_MANUAL=1` to keep the host open for UI acceptance. The fixture's
`layout` control action accepts cap, starting beat and Sequence inputs; it does
not replace the manual interactions documented above.
