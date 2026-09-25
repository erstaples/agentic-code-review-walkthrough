# Kankō v2 tour data contract

`CreateTourPlan` and `kanko_map_check` validate source-backed plans.
The schema is [tour-plan.schema.json](../schemas/tour-plan.schema.json); the
shared implementation is [shared/tour.ts](../shared/tour.ts).
[Editor loading and navigation](kanko-v2-tour-loading.md) use the validated plan.
Creating a plan does not contact the editor.

## Authoring a plan

Set `presentationVersion: 2` on every `CreateTourPlan`. Every stop must include
the required anchors and beats. Unversioned plans, other versions, and
metadata-only stops are rejected; there is no format detection, migration, or
compatibility path. `kanko_map_check` validates every current plan. Review map schema
version and the plan's entity `version` are separate from the presentation format.

Each stop needs a stable `id`, `title`, `risk` (`low`, `medium`, `high`), ordered
`anchors`, and ordered `beats`. The existing review map coverage rule still applies:
provide `coveredEntityIds`, or use `type: "context"` for an introductory stop.
Beat ids must be unique within their stop; stop ids must be unique in the plan.

Each anchor has:

| Field | Meaning |
| --- | --- |
| `n` | One-based position in the anchor array; no gaps or duplicates |
| `role` | `change`, `evidence`, `callee`, `caller`, `config`, `schema`, or `context` |
| `label` | One to five words |
| `path` | Repository-relative file path; use the destination path for a rename |
| `view` | `diff`, `head`, or `base` |
| `change` | `modified`, `added`, `deleted`, or `unchanged`, verified against the two source texts |
| `rev` | `{base, head}` identifying the review map's exact source pair |
| `context` | `{startLine, endLine}`, one-based and inclusive |
| `side` | Optional context coordinate side, `base` or `head` |
| `focus` | Optional array of `{side, range, kind?, contentHash?}` spans |
| `symbol` | Optional symbol name |
| `contentHash` | `sha256:` plus the context text's lowercase SHA-256 digest |
| `claimRefs` | Optional existing claim ids demonstrated by this anchor |

`side` defaults to `base` for a base view or deletion and `head` otherwise.
A single-side view must agree with `side`. Focus spans have independent base/head
coordinates, including removed code outside the head context. Their optional
`kind` is `added`, `removed`, or `unchanged`. Tour anchors require a revision pair
and an explicit `context`; a string revision or `range` alias is not accepted.

Hash exactly the selected lines, joined by LF, without the final line separator.
CR bytes in CRLF source remain part of the hash, matching the existing presenter.
A file's trailing newline does not create another valid source line. Empty,
binary, non-UTF-8, and absent files cannot supply line anchors. Git symlinks are
treated as their stored target text, not dereferenced.

For committed review maps, use the manifest's `effectiveBase` and `headCommit`.
For working-tree review maps, use `baselineCommit` and
`WORKTREE:<manifestDigest>` (for example, `WORKTREE:sha256:...`). This binds the
candidate to its selected manifest, not a moving `HEAD` name. The reader uses
selected working bytes when unstaged/untracked changes are included, selected
index blobs for staged-only changes, and the pinned current-HEAD tree otherwise.
After changes to selected files, refresh the review map and regenerate the anchors.

A beat is `{id, narration, active}`. Narration is Markdown and uses only
`{{a:N}}` tokens for file references. `active` contains unique anchor numbers in
display priority order; it may be empty. Tokens and active references must resolve
within the beat's stop. The validator catches repository paths (including bare
filenames such as `Makefile`), slash-separated file-shaped paths, and filenames
in code spans. Prose is not a complete file-reference grammar: authors must still
use tokens for ambiguous bare names that are not in the repository catalog.

## Findings and normalization

`kanko_map_apply` returns structured `findings` with `severity`, `code`, `location`,
and `message`. Existing string `warnings` remain available. A rejected plan
returns `invalid_tour_plan` with `details.findings`, including through MCP, and
none of the batch's domain events are stored. `kanko_map_check` checks the current
v2 plan against its current review map revision without rewriting it.

| Condition | Result |
| --- | --- |
| More than 7 anchors | Warning: consider splitting the stop |
| More than the configured hard limit | Error; default 24, configurable from 1 through 99 |
| More than 3 active anchors in one beat | Warning; preserve priority for later overflow handling |
| Invalid number, role, label, reference, path, revision, range, or hash | Error at the relevant field |
| Raw file path in narration | Error with a replacement token when possible |
| Compatible overlapping contexts | Warning, then merge before storage |
| Overlap with incompatible roles, views, or revisions | Error; consolidate explicitly |
| Observed claim without its own evidence anchor | Warning naming the claim |

Set `KANKO_TOUR_ANCHOR_LIMIT` for the MCP server, or pass `tourAnchorLimit` to
`ReviewMapService`. Invalid settings fail at startup. The extension independently
validates loads with its `kanko.tour.anchorLimit` setting; keep the MCP and editor limits aligned.
The ceiling is always 99.

Overlaps are compared only on the same file and coordinate side. Transitive
overlaps form a single group. The first anchor retains its label and optional
symbol; the merged context covers the union, with its hash recomputed from
verified source. Focus spans and claim references are retained. An anchor without
focus contributes its original context as a focus span. Different roles or views
require an author decision instead of silently discarding their meaning.

After merging, numbers are reassigned in original array order. All narration
tokens and `active` lists are rewritten together, with duplicate active numbers
removed while retaining priority. Revalidating that normalized plan is idempotent.
The stored numbers stay fixed for the running tour; there is no live renumbering.

An observed claim means a review map claim with `truthStatus: "observed"`.
At least one anchor with `role: "evidence"` must name that claim in `claimRefs`
somewhere in the plan. An unrelated evidence anchor does not satisfy it. This
warning concerns presentation coverage, not whether the claim has been proved or
accepted by a reviewer.

## Shared loading boundary

`validateTourPlan(plan, {readSource, revisions, repositoryPaths, claims, hardLimit})`
returns `{ok, plan, findings}`. On errors, `plan` is null. The source reader is
mandatory and returns `{base: textOrNull, head: textOrNull}` for a pinned anchor;
null means an absent file, while read failures throw. The review map adapter supplies
the revision pair, repository catalog, and claims. A loader must supply the same
inputs and only navigate after `ok` is true. No validator function opens files in
an editor or changes review state.

`npm --prefix editor-extension run runtime:build` generates the shared JavaScript
used by MCP and the extension. CI rejects stale output. The extension build
bundles that implementation into the VSIX.
