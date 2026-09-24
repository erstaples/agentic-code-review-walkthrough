# Relay v2: multi-anchor editor presentation

Phase 4 extends the phase 3 load/navigation workflow with an anchor opener,
a six-color decoration registry, source identity, and conservative tab ownership.
The wire protocol remains 2. No retired stop/focus compatibility path is added.

## Observable behavior

A beat opens up to three active anchors, in priority order. The first takes
editor focus; later anchors preserve it. Existing matching tabs are reused in
their current group. The basic allocator uses available groups and creates up
to three columns; task 5 will supply the role-aware shape/placement engine.
It does not collapse or rearrange a reviewer's existing layout.

The same anchor number and palette color appear in narration chips, editor
rails/focus boxes, inline labels, and URI-based tab badges. The six decoration
sets are created lazily, reused by anchors 7 onward, and disposed on deactivation.
Label foreground/background colors are contributed separately for each palette
entry. Native added/removed backgrounds remain visible. Inline identity is
`① filename:line–line · label`; diff titles identify the filename and source pair.
The status bar lists active filenames, or the first plus a count above three.
User settings may hide tab decorations; labels and status still identify sources.

## Source choice and drift

The head side uses a real `file:` URI only when its saved bytes and any open
editor buffer match the captured source. Missing files, symlinks, changed bytes,
and mismatching unsaved buffers use a read-only `relay-rev:` document with a
repository-shaped path and pinned source identity. Real files retain normal
language features. Symbol support for revision URIs depends on the language
server; phase 1 found Go symbols unavailable for that scheme.

If a displayed real source changes, its focus is suppressed and its rail becomes
stale. The sidebar reports the changed source. Presenting again uses the pinned
snapshot without closing the dirty real editor. Copy Citation identifies the
head revision while a real file still matches, and uses working-file coordinates
after drift. Mouse/keyboard selections switch to Exploring; programmatic
selection commands do not.

`presentation.anchors` in snapshots reports each current-stop anchor's number,
path, status (`visible`, `open`, `not-open`, or `stale`), group, source scheme,
companion group, and removed-code mode. Later sidebar/layout work can consume
these facts without computing editor state in the webview.

## Tab ownership and removed code

Ownership tracks a concrete tab and original group. Only a newly opened tour
preview is owned. Pre-existing tabs are never adopted. Pinning, editing, or
moving a tab permanently releases ownership, even if the reviewer later undoes
that action. Stop changes close obsolete untouched tour previews. Ending the
tour closes remaining untouched owned previews. No user tab is closed, and
cleanup never saves or discards an unsaved buffer.

Within the current stop, inactive anchors may stay open until another anchor
needs their preview slot. Two disjoint anchors for the same source reuse its
editor; only one can supply that editor's decorations. Different source
revisions may need separate documents, notably a dirty real file and the pinned
snapshot. The tour does not close user tabs to eliminate those differences.

Removed base focus in an inline/automatic diff gets a base companion if a slot
is free. At capacity, or with `relay.presentation.removedCode: "seam"`, a seam
links to the pinned base through **Peek removed code**. Hunks are computed from
captured text, so staged-only and renamed sources do not consult a moving index
when placing seams. Companions use the same tab ownership and group bound.

## Remaining phases

Role-based stacked/split shapes, explicit placement and pin controls, same-color
separation, Sequence mode, full anchor-list scaling, and exact layout restoration
are not implemented in this phase. Paused clears presentation without collapsing
the workspace. See the [acceptance report](verification/relay-v2-multi-anchor/README.md)
for verified behavior and outstanding screenshot proof.
