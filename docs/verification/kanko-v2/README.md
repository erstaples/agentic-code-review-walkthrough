# Kankō v2: editor capability verification

> Historical verification: JSON results and screenshots are preserved from the
> original run and may contain earlier product names and paths. They are not
> evidence for the current renamed build. See the current integration tests.

Phase 1 of the multi-file stops implementation. Base branch: `dev`.
Verified September 23, 2026 against VS Code 1.139.0 on macOS arm64,
Go extension 0.56.1, and gopls 0.23.0. The source is the local
`Kankō: Multi-File Stops and Editor Layout` PDF, especially pages 10-13 and
21-22. The private PDF is not copied into the repository.

This phase adds a disposable test extension and evidence. It changes no
production presentation behavior. Subsequent implementation branches and PRs
should start from and target `dev`.

## Findings and implementation decisions

| Question | Evidence | Consequence for implementation |
| --- | --- | --- |
| Can the previous layout be read? | `vscode.getEditorLayout` returned the full nested geometry. Saving a grid, switching to one group, and restoring it reproduced the returned object exactly at a fixed window size. The command is documented and also exists in the 1.90 source. | Correct the PDF's assumption. Capture pre-tour geometry and use it for restoration when appropriate. Geometry does **not** include tab membership, selections, or active-tab identity: track those separately before promising an exact workspace restoration. |
| Do the six shapes work? | Single, stack, split bottom, split top, columns, and grid all produced their expected number of groups. `tabGroups.all` exposed columns 1 through N in the tested transitions, matching the returned layout's leaf order. | The shape model is viable. Reconcile slots using actual tab/URI identity after user moves or closes groups; do not assume array position is permanent identity. |
| Do diff tabs show anchor badges? | Native diff tabs displayed `1` for a real-file modified side and `99` for a revision-backed modified side. The final badge provider deliberately supplies no decoration for the original-side URI. | A modified-side URI can carry the badge and color. Respect the user's tab-decoration settings; keep inline labels and panel identity available when badges are disabled. |
| Do revision documents get language symbols? | Both `file:` and `kanko-rev:` TypeScript documents returned `kankoProbe`. Go returned `Evidence` for `file:` and no symbols for `kanko-rev:` after repeated requests. Real-file positive controls succeeded for both languages. | Prefer a real file only when its content matches the reviewed revision, including unsaved editor contents. Keep revision documents for immutable review. Do not promise Go symbol breadcrumbs on them. TypeScript symbol availability does not establish full project-wide IntelliSense. |
| Can the panel start in the secondary sidebar? | The test WebviewView resolved and was visibly in the secondary sidebar. The `secondarySidebar` contribution exists in the 1.139 source but not 1.90. | The current `^1.90.0` production engine declaration cannot guarantee this placement. Before shipping the sidebar, either raise the supported minimum to a tested version with this contribution or retain a supported primary-sidebar fallback that the reviewer can move. This spike does not change the production minimum. |
| Does dragging a splitter emit a tab-group event? | A manual horizontal-splitter drag changed heights from 400/400 to 549/251 with four visible-range events and zero tab-group events. Programmatic resizing likewise produced range events without group events. Scrolling produced a range event while layout geometry stayed unchanged. | Do not equate a range event with customization. Compare layout geometry when range/group events arrive and before applying a beat, and distinguish engine changes from external changes. This also catches a missed event before the next automatic reshape. |
| Is fewer than 18 visible lines a reliable small-window test? | A three-line file reported only three visible lines while occupying the full editor area. | The PDF's unconditional threshold would incorrectly force Sequence mode for short files. Account for document length and end-of-file first; treat folding/wrapping and other ambiguous cases conservatively. Do not force a collapse based solely on visible line counts. |
| Does `preview: true` prevent duplicate files? | Explicitly opening the same URI in two columns produced two copies. Shape collapse also moved existing tabs into surviving groups. | Maintain URI/tab ownership and locate an existing editor before opening. Preview mode alone is insufficient, and collapsing a shape is not tab cleanup. |
| Do quick-pick modifiers work? | UI interaction dispatched Enter, Alt+Enter, and Shift+Enter as choose-placement, peek, and replace. Alt+0 opened the picker. | Use separate commands with a picker-specific context key for the modifier actions. `onDidAccept` itself provides no modifier information. This verifies dispatch, not the placement implementation. |
| Can existing removed-code handling respect a three-group cap? | Activating the existing presenter in an inline diff with three populated groups opened a fourth companion group. Pausing retained all four groups. | Route companions through the future layout allocator. At capacity, require an eligible slot or a seam/peek fallback; never silently create another group. Distinguish presentation pause (current behavior: retain editors) from tour pause (v2 requests cleanup). |

## Evidence

- [Automated observations](automated.json): returned layout trees, tab snapshots,
  resize/scroll signals, language-provider results, and companion behavior.
- [Manual observations](manual-observations.json): splitter measurements and
  keyboard dispatch observed through native UI interaction.
- [Diff badges and sidebar](badges-sidebar.png): real-file head above,
  revision-backed head below; badges 1 and 99; sidebar on the right.
- [Resized editor groups](resized.png): manually dragged splitter.
- [Anchor quick pick](quick-pick.png): number, filename, and placement detail.

The first automated run used the installed VS Code app. Visual checks used a
disposable copy of the same build with a distinct bundle identifier so native
UI automation could select the test process instead of the reviewer's normal
window. Both runs agreed on the core API findings. Changing the copy's identity
initially triggered a macOS Keychain request; that run was stopped. The runner
now uses in-memory extension secret storage and Chromium's basic password store
only within its disposable profile. It never signs in, imports credentials, or
uses that profile for ordinary browsing.

The full existing dependency-free suite passed: **133 tests, zero failures**.
On macOS, use a canonical `TMPDIR` for that suite because its repository identity
tests reject the `/var` versus `/private/var` alias. No test workaround changes
the product's repository identity rules.

## Reproduce

From the repository root, after installing the extension's locked development
dependencies with `npm ci --prefix editor-extension`:

```sh
node editor-extension/test/spikes/kanko-layout/run.js
```

The default downloads VS Code stable through `@vscode/test-electron` and runs
the API checks. The output directory is printed. Set `VSCODE_VERSION` to choose
a download version, or `VSCODE_EXECUTABLE_PATH` to use an existing executable.
No production extension, settings, or files are installed into the normal user
profile. Fixtures use synthetic Git commits, not this repository's history.

For Go checks, set `KANKO_SPIKE_GO_EXTENSION` to an installed `golang.go`
extension directory and put the desired Go/gopls binaries on `PATH`. The test
uses a symlink in its disposable extensions directory. Without it, absence of
the Go provider is recorded; it is not treated as a successful Go check.

Set `KANKO_SPIKE_OUTPUT` to an empty directory for repeatable artifact collection.
Set `KANKO_SPIKE_MANUAL=1` to leave the test window open after the API checks.
In that window:

1. Inspect the two diff tabs and the secondary sidebar; save a screenshot.
2. Write `{"action":"snapshot","id":"before-drag"}` to `control.json` in
   the output directory, and wait for `manual-before-drag.json`.
3. Drag the horizontal editor-group splitter. Write another snapshot with
   `"id":"after-drag"`; compare geometry and event counts.
4. Press Alt+0, then Enter. Repeat with Alt+Enter and Shift+Enter.
   Confirm `enter`, `peek`, and `replace` in `events.jsonl`.
5. Write `{"action":"finish"}` to `control.json` to close the test window.
   A manual run expires with a failure after 20 minutes if it is not finished.

The control file accepts only these fixture actions; it is not a product
endpoint. The fixture retains results and temporary files for inspection.
Remove its printed temporary directory when no longer needed.

```sh
TMPDIR=/private/tmp node --test test/*.test.js mcp/test/*.test.js editor-extension/test/*.test.js
```

## Boundaries for the next phase

The anchor/beat contract can proceed with these findings. This spike does not
implement the sidebar, placement engine, global tab deduplication, restoration
of tab membership, or agent-to-panel question handling. Those remain subsequent
phases, rather than capability claims inferred from a prototype.

Runtime verification covers the current macOS build. The 1.90 compatibility
comparison is source inspection, not a runtime test. Windows/Linux shortcuts,
remote workspaces, numbered Alt+N shortcuts, custom keyboard layouts, and
language-server versions other than those listed above remain release-matrix
checks. The six-shape ordering check covers engine-generated transitions;
arbitrary reviewer tab/group rearrangements still require identity-based
reconciliation in the implementation.

## Primary references

- [VS Code built-in commands: getEditorLayout](https://code.visualstudio.com/api/references/commands)
- [VS Code stable API: TabGroups, QuickPick, FileDecorationProvider](https://code.visualstudio.com/api/references/vscode-api)
- [VS Code 1.90 editor commands](https://github.com/microsoft/vscode/blob/1.90.0/src/vs/workbench/browser/parts/editor/editorCommands.ts)
- [VS Code 1.90 view contributions](https://github.com/microsoft/vscode/blob/1.90.0/src/vs/workbench/api/browser/viewsExtensionPoint.ts)
- [VS Code 1.139 view contributions](https://github.com/microsoft/vscode/blob/1.139.0/src/vs/workbench/api/browser/viewsExtensionPoint.ts)
