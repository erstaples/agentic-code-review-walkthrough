# Phase 4 acceptance: multiple anchors and tab ownership

> Historical verification: JSON results and screenshots are preserved from the
> original run and may contain earlier product names and paths. They are not
> evidence for the current renamed build. See the current integration tests.

**Status: visual checks completed; 197 automated tests and 13 packaged native checks pass.**

The 2026-09-24 visual run used the actual VS Code 1.139.0 editor, synthetic
sources, and a disposable profile. Screenshots below are unedited native window
captures. The primary sidebar was hidden to leave room for the three sources.
The installed editor and the user's profile were not modified.

## Visual finding and repair

The initial run found that **Peek removed code rendered but did not open**.
VS Code rejected the serialized arguments passed directly to its native command.
The link now passes anchor identifiers to an extension command, which resolves
the captured source and constructs the required VS Code URI, Position, and
Location values. Clicking the repaired link opened the captured base line in a
native peek widget. The repair also removes a duplicate hover entry and retains
removal metadata when switching to Exploring.

The integration check now invokes the command with JSON-round-tripped arguments
and verifies removal metadata survives Exploring. Native peek changes a diff
preview into a plain source preview; the test resets that scenario before later
tab-ownership tests. The final packaged run passes all 13 checks.

## Acceptance matrix

| I should be able to… | Observed result and evidence |
| --- | --- |
| See implementation and evidence together | [Loaded beat](01-loaded.png) shows service.js, service.test.js, and a base companion. [Next beat](02-evidence-beat.png) updates the narrative and active-source order. |
| Identify each source consistently | [Three anchors](03-three-anchors.png) shows violet 1, teal 2, amber 3 across chips, labels, tab badges, rails, and status. Labels clip at the right edge in narrow columns. |
| Present three anchors without a fourth group | [Three anchors](03-three-anchors.png), then [working removed-code peek](04-removed-code-peek.png): the widget opens within the existing group and shows the base-only `current: null` line. |
| Inspect captured base code while using a real-file tab | [Peek](04-removed-code-peek.png) opens the captured base source; [reloaded reviewer preview](12-reused-reviewer-preview.png) reuses the real head. Native `retained-peek-source` additionally checks the already-open real-file case and exact base contents. |
| Inspect disjoint ranges without duplicate source tabs | [Anchor 4](07-same-source.png) changes the one service.js tab's badge, rail, and label to coral 4 for lines 13–19. |
| Keep unsaved changes while reviewing pinned source | [Stale edit](14-stale-reviewer-edit.png), [immutable replacement](15-pinned-source-beside-dirty-buffer.png), and [ended tour](16-ended-keeps-unsaved-work.png) show the unsaved real tab retained while a captured copy is presented, then the captured preview closed. The deliberate fixture edit causes the displayed syntax diagnostics. |
| Keep a tab after making it permanent | Double-clicked service.test.js to Keep Open before stop navigation. It remains in group 2 through [moving another source](10-moved-preview.png) and [ending](11-ended-keeps-reviewer-tabs.png). |
| Keep an existing reviewer preview | The plain service.js preview opened by native peek remains after [ending](11-ended-keeps-reviewer-tabs.png), is reused on [reload](12-reused-reviewer-preview.png), and survives [ending again](16-ended-keeps-unsaved-work.png). Native checks separately verify identity preservation for a pre-existing reviewer-notes preview. |
| Move a tab and keep ownership | The untouched retired.js preview was moved from group 2 via the native Split & Move → Move Right menu. [Moved tab](10-moved-preview.png) and [ended tour](11-ended-keeps-reviewer-tabs.png) show it retained in group 3. Drag attempts did not move the tab; this proves the native menu path, not drag handling. |
| Explore and resume Following | A real Right-arrow selection automatically entered Exploring. [Next stop while Exploring](08-exploring-keeps-editors.png) preserves the source arrangement; Following resumes source presentation. [Paused](06-paused.png) removes tour paint without closing tabs. |
| Inspect a deleted file | [Deleted base](09-deleted-base-pinned-retained.png) shows retired.js from the base revision and the matching teal chip/rail/badge. |
| Reject an invalid load without replacing my review | [Before](12-reused-reviewer-preview.png) and [after](13-invalid-load-unchanged.png) retain the same beat and tabs. [Rejection response](invalid-load.json) records `invalid_active`. |
| End a tour without closing my work | [Final state](16-ended-keeps-unsaved-work.png) shows the empty tour sidebar, retained dirty source, permanent tabs, and moved base file. Tour decorations and owned companion/revision previews are gone. |

## Evidence and limits

[Native observations](automated.json) and [check metadata](checks.json) record the
13 native checks, package digest, and screenshot provenance. The 32 packaged
files match source. Captures 01, 02, 03, 05, and 06 came from the original
39ae464 candidate; the other captures use the repaired VSIX. Capture 05 is an
additional initial-run stale-source observation. The final automated run uses
the repaired package.

Long inline labels and code lines clip in the current narrow three-column
arrangement. Number, color, filename, and range remain recognizable; layout
shapes and placement belong to phase 5. This is not proof of polished narrow
layouts. The run covers the dark theme on macOS only, not light/high-contrast
themes, Windows, remote workspaces, other language servers, or other screen sizes.

The screenshots also exercise phase 3 navigation, modes, deleted-source
inspection, invalid-load stability, and end-tour behavior on this current phase 4
candidate. They do not claim historical screenshots of the phase 3 commit.

## Test editor launch failures

The computer-control tool initially selected the regular VS Code instance.
A disposable application copy with a distinct bundle identifier was used to
make the test window separately addressable. Altering that copy invalidated its
signature; an intermediate signing attempt also produced a framework Team-ID
mismatch. Renaming the application internally broke Electron helper lookup.
Keeping its original internal name and locally signing the complete temporary
copy without the hardened-runtime option resolved those launch failures.

Two subsequent sandboxed launches aborted in macOS `_RegisterApplication` before
extension activation. Launching the same test app outside the shell sandbox
succeeded and completed the suite. That comparison implicates the launch sandbox;
the crash report does not identify a narrower denied operation. These failures
were in the temporary copy, not the installed application. No system-wide
security setting was changed.

## Default layout for future runs

The test profile now opens editor groups downward, stacking them top to bottom.
All 13 native checks pass with this setting. [Stacked groups](17-stacked-groups.png)
shows the implementation, evidence, and base companion in three full-width rows.
Earlier screenshots above retain the original side-by-side acceptance evidence.

## Reproduce

From the repository root:

```sh
TMPDIR=/private/tmp node --test test/*.test.js mcp/test/*.test.js editor-extension/test/*.test.js
```

Package with the locked extension development dependencies, then validate with
`python3 scripts/check-vsix.py <vsix>`. Extract the package and run:

```sh
EXTENSION_PATH=/absolute/path/to/extracted/extension \
KANKO_TOUR_OUTPUT=/absolute/path/to/results \
KANKO_TOUR_MANUAL=1 node editor-extension/test/integration/runner.js
```

Use an execution context allowed to launch native desktop applications. The
fixture's control file can reload, submit an invalid load, record a snapshot,
or finish; those controls do not substitute for visible editor interaction.

## Scope

This phase uses simple bounded column allocation. Role-aware shapes, placement
choices, custom pin controls, same-color separation, Sequence mode, the full
anchor list, and layout restoration belong to later phases. Presentation pause
clears decorations while preserving the editor arrangement.
