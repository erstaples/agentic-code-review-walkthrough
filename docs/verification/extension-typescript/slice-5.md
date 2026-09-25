# Slice 5: React sidebar

Base: slice 4 at `4489b35`. September 25, 2026.

## Changes

The existing sidebar now renders through React components. The host still owns
navigation, editor placement, validation, and saved layouts. CSS, icons, visual
order, message fields, and escaped narration remain unchanged.

The message bridge holds the latest host snapshot and rejects older revisions.
React subscribes to that state; it does not keep a second snapshot. Filtering,
grouping, picker choices, scrolling, and focus are local. New stops reset the
filter, collapsed sections, and picker; the selected grouping order persists.

Rows and placement choices have stable keys, so a new snapshot retains focused
controls. Closing the picker preserves any filter entered while it was open.
If a focused placement becomes unavailable, focus moves to an available choice.
Unmounting removes message/key listeners and disconnects the resize observer.

React 19.3 and React DOM are bundled locally in production mode. The provider
supplies a single mount point under the existing nonce CSP. The package excludes
dependency folders and includes third-party notices. MCP remains directly
runnable with Node, without new dependencies.

## Verification

- Clean Node 22 build and package: 250 tests, strict checks, scoped formatting,
  six archive rejection tests, and fresh-build comparison pass.
- Fourteen rendered interaction tests use Testing Library and jsdom with an
  explicit VS Code message fake. They cover ordered messages, stale revisions,
  navigation, filters, grouping, picker actions, disabled controls, focus,
  escaped narration, keyboard navigation through 99 rows, and cleanup.
- Browser bundle startup and the ready handshake pass without Node globals.
- All 30 native scenarios pass against the extracted production VSIX on macOS
  with VS Code 1.139.0. Linux build and integration also pass in PR CI.
- The archive contains 12 files, including bundled-library notices.

## Actual sidebar checks

The extracted production package was loaded in the isolated persistent profile
from slice 4. The 99-anchor scene rendered under the existing CSP. Filtering to
99 found its row; opening it cleared the filter and scrolled to the row and
picker. The placement diagrams rendered correctly. Escape closed the picker
and returned focus to anchor 99.

Switching to Order and pressing End in the list focused anchor 99 through the
windowed rows. Enter opened its picker. Remembering the destination and choosing
Replace 2 opened source 99 in the lower editor. The sidebar showed the remembered
bottom destination. A real **Developer: Reload Window**, followed by loading the
same tour, retained the positions and preference in an exact snapshot comparison.

Run `scripts/build-vsix.sh` with Node 22 and `TMPDIR=/private/tmp` for the clean
checks. Run `test/integration/runner.js` against the extracted VSIX for native
tests. Use `test/integration/manual-host.js` with the `sidebar 99` scene for the
interaction check and its `snapshot` / `check-reload` actions around a real reload.

## Limits

Slice 6 still covers the full native UI checklist, theme/accessibility evidence,
screenshots, and responsiveness comparisons. The earlier intermittent Linux
saved-pin failure did not recur; it is not claimed fixed. jsdom establishes
rendered behavior, not native layout geometry or CSP enforcement; those were
checked separately in the real editor for the interactions listed above.
