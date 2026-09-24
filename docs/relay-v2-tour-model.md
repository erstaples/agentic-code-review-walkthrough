# Relay v2 tour data contract

Phase 2 adds source-backed validation to `CreateTourPlan` and `dossier_check`.
The schema is [tour-plan.schema.json](../schemas/tour-plan.schema.json); the
shared implementation is [contract/tour.js](../contract/tour.js). Editor loading
and navigation are phase 3. Creating a plan does not contact the editor.

## Authoring a plan

Set `presentationVersion: 2` on `CreateTourPlan`. A stop with `anchors` or
`beats` also selects v2 validation, so omitting the version cannot bypass it.
Every stop in that plan must use the v2 shape. Dossier schema version 1 and the
plan's existing `version` field retain their meanings. Legacy commands without
presentation fields still work; old events are replayed without rewriting or
applying new validation rules to them.

Each stop needs a stable `id`, `title`, `risk` (`low`, `medium`, `high`), ordered
`anchors`, and ordered `beats`. The existing dossier coverage rule still applies:
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
| `rev` | `{base, head}` identifying the dossier's exact source pair |
| `context` | `{startLine, endLine}`, one-based and inclusive |
| `side` | Optional context coordinate side, `base` or `head` |
| `focus` | Optional array of `{side, range, kind?, contentHash?}` spans |
| `symbol` | Optional symbol name |
| `contentHash` | `sha256:` plus the context text's lowercase SHA-256 digest |
| `claimRefs` | Optional existing claim ids demonstrated by this anchor |

`side` defaults to `base` for a base view or deletion and `head` otherwise.
A single-side view must agree with `side`. Focus spans have independent base/head
coordinates, including removed code outside the head context. Their optional
`kind` is `added`, `removed`, or `unchanged`. The legacy presentation anchor's
string `rev` and `range` alias remain unchanged; v2's revision pair and explicit
context belong to this new contract and will be adapted by the loader.

Hash exactly the selected lines, joined by LF, without the final line separator.
CR bytes in CRLF source remain part of the hash, matching the existing presenter.
A file's trailing newline does not create another valid source line. Empty,
binary, non-UTF-8, and absent files cannot supply line anchors. Git symlinks are
treated as their stored target text, not dereferenced.

For committed dossiers, use the manifest's `effectiveBase` and `headCommit`.
For working-tree dossiers, use `baselineCommit` and
`WORKTREE:<manifestDigest>` (for example, `WORKTREE:sha256:...`). This binds the
candidate to its selected manifest, not a moving `HEAD` name. The reader uses
selected working bytes when unstaged/untracked changes are included, selected
index blobs for staged-only changes, and the pinned current-HEAD tree otherwise.
After changes to selected files, refresh the dossier and regenerate the anchors.

A beat is `{id, narration, active}`. Narration is Markdown and uses only
`{{a:N}}` tokens for file references. `active` contains unique anchor numbers in
display priority order; it may be empty. Tokens and active references must resolve
within the beat's stop. The validator catches repository paths (including bare
filenames such as `Makefile`), slash-separated file-shaped paths, and filenames
in code spans. Prose is not a complete file-reference grammar: authors must still
use tokens for ambiguous bare names that are not in the repository catalog.

## Findings and normalization

`dossier_apply` returns structured `findings` with `severity`, `code`, `location`,
and `message`. Existing string `warnings` remain available. A rejected plan
returns `invalid_tour_plan` with `details.findings`, including through MCP, and
none of the batch's domain events are stored. `dossier_check` checks the current
v2 plan against its current dossier revision without rewriting it.

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

Set `RELAY_TOUR_ANCHOR_LIMIT` for the MCP server, or pass `tourAnchorLimit` to
`DossierService`. Invalid settings fail at startup. A future loader passes the
same setting as `hardLimit` to the shared validator; the ceiling is always 99.

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

An observed claim means a dossier claim with `truthStatus: "observed"`.
At least one anchor with `role: "evidence"` must name that claim in `claimRefs`
somewhere in the plan. An unrelated evidence anchor does not satisfy it. This
warning concerns presentation coverage, not whether the claim has been proved or
accepted by a reviewer.

## Shared loading boundary

`validateTourPlan(plan, {readSource, revisions, repositoryPaths, claims, hardLimit})`
returns `{ok, plan, findings}`. On errors, `plan` is null. The source reader is
mandatory and returns `{base: textOrNull, head: textOrNull}` for a pinned anchor;
null means an absent file, while read failures throw. The dossier adapter supplies
the revision pair, repository catalog, and claims. A loader must supply the same
inputs and only navigate after `ok` is true. No validator function opens files in
an editor or changes review state.

`contract/sync.js` copies the dependency-free validator into the VSIX. Tests
require that copy to match exactly. The current presenter continues using the
legacy anchor API until the separate phase 3 loader is implemented.
