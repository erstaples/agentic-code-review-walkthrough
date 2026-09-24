# Phase 3 acceptance: tour loading and navigation

> Historical verification: JSON results and screenshots are preserved from the
> original run and may contain earlier product names and paths. They are not
> evidence for the current renamed build. See the current integration tests.

**Status: implementation checks pass; screenshot acceptance is incomplete.**

The user requires screenshots as proof. On 2026-09-24, computer control reported
that the Mac was locked and automatic unlock failed. No screenshots were
captured, and automated extension checks do not substitute for visual proof.
The PR must remain draft until the visible criteria below are exercised and
captured in the real editor.

## Evidence recorded

- 190 dependency-free tests pass, covering contract/source validation, review map
  freshness, bridge errors, controller navigation, and escaped citation rendering.
- The VSIX contains exactly 29 expected files; packaged files match their source.
- All 7 native integration tests pass against the extracted VSIX in VS Code
  1.139.0, using a disposable profile, repository, and review map store.
- [Automated snapshots](automated.json) record actual bridge results.
  [Check metadata](checks.json) records the package digest and missing screenshots.

The native fixture is a small, synthetic code review with two stops and two
beats per stop. It exercises the actual extension and authenticated public
bridge. It is not a screenshot or review of this PR's own implementation.

## Acceptance matrix

| I should be able to… | Automated evidence | Screenshot / interaction proof |
| --- | --- | --- |
| Load a complete authored tour and see stop, beat, risk, revisions, and narration | `load` snapshot and native source tab | Pending: loaded sidebar beside source |
| Advance beats/stops and jump back through public operations | Native navigation and `next-beat` snapshot | Pending: sidebar buttons, keyboard navigation, changed source |
| Click a numbered citation and identify its source | Escaped chip markup and citation tests | Pending: chip click, source tab and tooltip |
| Explore while narration advances without moving my editor | `exploring` snapshot and unchanged native tabs | Pending: Exploring before/after next beat |
| Pause and resume presentation at the current beat | State transitions and resumed source asserted | Pending: decorations absent when Paused, restored when Following |
| Reject an invalid tour without disturbing the current display | `rejected-load`: structured `invalid_active` finding, identical snapshot and tabs | Pending: matching display before/after invalid load |
| Read deleted code from its pinned base revision | `deleted-base` snapshot and actual document text asserted | Pending: base source with matching narration |
| End presentation without recording review acceptance | Native clear/unloaded state; no review sessions created | Pending: empty sidebar |
| Receive numbered terminal and revision-qualified receipt references | Controller and receipt tests, `narration` / `receiptNarration` in snapshots | Automated text proof; screenshot of sidebar chip pending |

Native checks assert state and document behavior. They do not establish visual
layout, decoration visibility, hover behavior, or mouse/keyboard usability.
These remain unverified until the screenshots and interaction record are added.

## Reproduce

From the repository root:

```sh
node --test test/*.test.js mcp/test/*.test.js editor-extension/test/*.test.js
```

Package the extension, validate with `python3 scripts/check-vsix.py <vsix>`, and
extract it. With the development dependencies installed in `editor-extension`:

```sh
EXTENSION_PATH=/absolute/path/to/extracted/extension \
KANKO_TOUR_MANUAL=1 KANKO_TOUR_OUTPUT=/absolute/path/to/results \
node editor-extension/test/integration/runner.js
```

The runner creates an isolated VS Code window titled **Kankō acceptance ·
workspace**. Once `ready.json` appears, use the sidebar and save screenshots here.
The optional `control.json` accepts `snapshot`, `invalid`, `load`, or `finish`
actions; include an `id` for evidence filenames. This fixture invokes the same
public bridge operations used by the automated suite. Finish closes only this
disposable test instance.

## Scope boundary

This phase supplies the public loading/navigation contract and sidebar
foundation. It presents one selected anchor at a time. Multi-anchor editor
presentation, layout placement, the complete anchor list, automatic Exploring,
and tab lifecycle management are later phases and are not accepted here.
