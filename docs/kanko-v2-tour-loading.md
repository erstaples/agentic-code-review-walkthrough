# Kankō v2: load and navigate an authored tour

Phase 3 connects a current change record plan to a native VS Code secondary sidebar.
It requires VS Code 1.139+ (the verified secondary-sidebar contribution API),
Node 22+, and bridge protocol 3 on both ends. No old stop/focus compatibility
routes or tools remain.

## Public agent operations

All calls take the absolute repository root as `workspace`.

| Operation | Additional arguments | Result |
| --- | --- | --- |
| `kanko_tour_load` | `recordId` | Validated first-beat snapshot and findings |
| `kanko_tour_navigate` | `action`, optional `expectedRevision` | New snapshot |
| `kanko_tour_set_state` | `mode`, optional `expectedRevision` | New snapshot |
| `kanko_tour_status` | None | Workspace identity and current snapshot |
| `kanko_tour_clear` | None | Unloaded snapshot |

Navigation actions are `nextBeat`, `previousBeat`, `nextStop`, `previousStop`,
and `goto`. `goto` requires an existing `stopId` and `beatId`. Beat navigation
crosses stop boundaries; stop navigation starts at that stop's first beat.
Trying to move beyond the plan returns `navigation_boundary` without mutation.

The change record service resolves its current plan, verifies change freshness, and
validates source-backed anchors before discovering the editor. The extension
independently checks the open workspace, manifest, source hashes, ranges, and
references before opening a view or publishing a snapshot. Invalid plans return
structured `details.findings` and retain the previous tour and editor tabs.
Sources are captured once per successful load. Changed working bytes require a
refresh, regenerated anchors, and another load.

## Extension-owned state

Every successful operation increments the presentation `revision`. Send it as
`expectedRevision` to reject stale navigation or mode changes. The extension
serializes operations; a rejected request does not poison the queue. This
revision is independent of the change record's aggregate revision.

A loaded snapshot includes the tour/plan identity, title, mode, stop/beat
indices and counts, current stop and beat, selected anchor, findings, and three
narration representations. The sidebar receives that snapshot when its webview
is ready, including when resolved after the load. Sidebar buttons send intents
to the same controller used by the bridge.

- **Following** opens the first active anchor of the current beat.
- **Exploring** advances narration without moving the current editor. Explicit
  citation-chip clicks still open their source.
- **Paused** removes decorations. Following resumes at the current beat.
- **End tour** clears the snapshot and decorations. It does not mark a stop
  reviewed, record approval, or close revision tabs.

## Citations and source display

Authored `{{a:N}}` tokens become numbered, keyboard-focusable sidebar buttons
with path/span tooltips and accessible labels. Terminal text uses
`② filename:line`; receipt text uses `② full/path:line–line @revision`. Working
snapshots retain their complete manifest identity. Receipt JSON and Markdown
include this rendered beat narration.

Narration supports a small Markdown subset (bold, emphasis, inline code, and
line breaks). Raw HTML and authored links are inert. Only escaped narration
and extension-generated citation buttons enter the webview. A nonce-based
content security policy prevents authored scripts and external resources.

Phase 3 introduced single-anchor presentation. Phase 4 now opens multiple
active anchors, reuses matching real head files, and tracks tab ownership; see
[the multi-anchor guide](kanko-v2-multi-anchor.md). `kanko.presentation.dimOpacity` and `showLabels` are applied when
painting; `kanko.tour.anchorLimit` bounds validation (default 24, maximum 99).

## Phase boundary and verification

Phase 4 implements multi-anchor presentation, colors, badges, removed-code
companions, automatic Exploring, and owned-preview cleanup. Layout placement,
the full anchor list, persistence, and restoration remain later phases.
The sidebar currently provides narration, citations, and navigation.

Run the dependency-free suite from the repository root:

```sh
node --test test/*.test.js mcp/test/*.test.js editor-extension/test/*.test.js
```

Run the native extension suite from `editor-extension` after installing locked
development dependencies:

```sh
npm run test:integration
```

The native runner creates a disposable Git repository, change record store, editor
profile, and extension directory. It exercises the real public MCP operations,
authenticated loopback bridge, source views, and snapshots. Set `EXTENSION_PATH`
to an extracted VSIX's `extension` directory to test the packaged artifact.
`VSCODE_EXECUTABLE_PATH` selects an installed executable. `KANKO_TOUR_MANUAL=1`
keeps the fixture open for up to 20 minutes for UI acceptance; the output folder
contains control instructions in the suite source and no authentication token.

See [the acceptance report](verification/kanko-v2-loading/README.md) for evidence
and screenshot status.
