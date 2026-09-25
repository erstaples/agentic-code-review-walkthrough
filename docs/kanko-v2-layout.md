# Reviewer-controlled tour layouts

The layout engine controls automatic placement, explicit placement choices,
and saved stop arrangements. The [sidebar](kanko-v2-sidebar.md) provides the
anchor picker. Settings and commands use the current Kankō names.

## Following and ownership

The engine reuses visible sources, including compatible anchors in the same
file. It fills empty groups and grows an untouched arrangement up to
`kanko.layout.maxGroups` (2–4, default 3). Once full, it uses the remembered
role destination when eligible, then replaces the least recently active eligible
source. Sources required by the incoming beat are reserved before any replacement.
All-pinned layouts report missing anchors in `layout.unplaced` without opening them.

A reviewer move, split, close, active-tab change or splitter resize makes the
arrangement customized. Following can fill or replace eligible slots but cannot
reshape it. Tour pins also prevent automatic growth. Scrolling does not count as customization. Exploring and Paused do
not automatically open, close or reshape editors; an explicit focus/placement
request is still a reviewer action. Native pinned, dirty, kept and reviewer-owned
preview tabs are protected. Tour pins survive automatic cleanup; ending a tour
relinquishes ownership of those pinned tabs.

The extension compares normalized geometry through `vscode.getEditorLayout`,
not visible-range events alone. It orders groups by current `viewColumn`:
`tabGroups.all` can retain creation order after inserting a split. Engine changes
are bracketed so their column changes do not masquerade as reviewer moves.

## Shapes and placement

`kanko.layout.orientation` is `auto`, `stacked`, or `columns`. For two groups,
`auto` uses stacked rows for side-by-side diffs and columns for plain sources.
Three groups use a top group above a split bottom row. Four groups use a grid.
Explicit placements also support splitting the top row. Existing reviewer
arrangements with more groups than the cap are retained; the engine adds none.

`presentation.layout` includes shape, slots, pins, customization, cap, per-anchor
placement options, missing anchors, Sequence state and role preferences. The
extension revalidates every request; the webview need not compute geometry.

The internal `kanko.tour.layout` command accepts:

```js
{ action: "pin", anchor: 2, pinned: true }
{ action: "place", anchor: 3, placement: { kind: "beside", of: 2 }, remember: true }
{ action: "place", anchor: 3, placement: { kind: "replace", of: 2 } }
{ action: "place", anchor: 3, placement: { kind: "peek" } }
{ action: "place", anchor: 3, placement: { kind: "auto" } }
{ action: "overrideSequence" }
```

Requests may include `expectedRevision`. Stale or unavailable placements fail
before changing editors. Only splits expressible by the six specified shapes
are offered, within the cap. Native new-group commands insert the empty leaf at
the requested location before applying the shape; this preserves existing tabs.
A source already open elsewhere is reused in its current group. Peek uses native
locations without allocating a slot or changing presentation identity.

Remembering a choice saves its resulting positional slot for that anchor's role,
not the referenced anchor number (which belongs to one stop). Later automatic
placements use that destination only when it is still present and eligible.
Preferences and compatible stop arrangements persist in VS Code profile state,
keyed to workspace and tour identity. Source/anchor changes and incompatible group
limits invalidate saved arrangements. Reset clears stop pins and customization
while preserving role destinations and reviewer-owned tabs. Saved state never
restores ownership of an existing tab. The sidebar supplies mouse/keyboard
placement controls; the command palette includes **Kankō: Toggle Pin on Active Tour Anchor**.

## Sequence

With `kanko.layout.sequenceFallback` enabled (default), an untouched, unpinned
layout collapses to one group if a settled editor viewport shows fewer than 18
lines. Short documents, EOF and disjoint folded ranges are not sufficient proof
of a cramped editor. Reviewer tabs and customized arrangements block automatic
collapse. Disposable previews are closed before merging groups so a merge does
not turn them into kept tabs.

Sequence lasts for the stop. Each beat shows its first selected active source.
The sidebar's **Show multiple groups** button restores the current beat and
suppresses fallback for that stop. The same override is available in the command
palette. A setting disables automatic fallback globally if desired.

Removed-code companions use the same allocator and group cap. They never
replace an active source or create a group in a customized arrangement; when
no slot is eligible, the existing removed-code Peek is used.
