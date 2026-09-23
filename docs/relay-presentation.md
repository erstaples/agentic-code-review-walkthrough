# Tour presentation

The presenter uses violet rails and outlines without setting line or character
backgrounds in diff editors. The only line background it sets is the workbench's
removed-line color in its own read-only companion documents. A separate dashed
bottom-border decoration handles removals at EOF; VS Code cannot vary a border
through per-range render options.

The existing `/stop`, `/focus`, and `/clear` protocol remains unchanged. Stop
ranges supply rail context; a focus supplies the tight span and narration label.
Pinned focus opens a native diff, except for added files with no base content.
Both revision documents and companions use the read-only `relay-rev` provider.
Renames retain their canonical current path while reading the old base path.

The narration panel described by the PDF is not present in this repository.
It can integrate through these local VS Code commands (not MCP tools):

| Command | Argument / result |
| --- | --- |
| `relay.presentation.activate` | `{ anchor, narration?, title?, claimIds? }` |
| `relay.presentation.detour` | `{ anchor, title }`; temporarily replaces the active beat |
| `relay.presentation.return` | Restores the saved beat, checking its hashes again |
| `relay.presentation.follow` | Enables focus dimming and labels |
| `relay.presentation.pause` | Retains rails, boxes, and labels without dimming |
| `relay.presentation.status` | Returns `{ state, stale, anchor }` for the panel's drift note |

Claim hover links dispatch `relay.presentation.openClaim` with a claim ID.
The extension exports `onDidRequestClaim`, which the panel subscribes to when
opening its claim drawer. Narration is escaped text; trusted Markdown only
allows that command. Seam hover Markdown only allows `editor.action.showReferences`.

An anchor has `path`, `side` (`base`, `head`, or `worktree`), `rev`, `context`
(`{ startLine, endLine }`, 1-based inclusive), optional `focus` spans, optional
`symbol`, and `contentHash`. Each focus span has its own `base`/`head` side and
`range`; `kind` may describe added, removed, or unchanged code. Legacy `range`
loads as `context` with no focus. Hashes are SHA-256 over context lines joined
with LF, prefixed with `sha256:`. Focus hashes are captured independently at
activation and retained across a detour; an optional span `contentHash` permits
comparison against an authored baseline. Immutable dossier events are not rewritten.

Selecting code switches Following to Exploring. In Exploring the rail and
boxes stay, labels and dimming disappear, and companions are not re-revealed.
Worktree edits trigger a 300 ms debounced hash check. Stale anchors keep a
clamped dashed rail and a Stale label without focus, dimming, or removal paint.
Visible-editor and relevant configuration changes rerun layout detection.

After opening a diff, a base focus waits up to 500 ms for its original editor.
The PDF assumes original-editor presence proves side-by-side layout. Integration
testing against VS Code 1.139 contradicts this: inline mode exposes both editors
and both report visible ranges. The implementation therefore uses the original
only when side-by-side is explicitly enabled and automatic inline switching is
disabled. In ambiguous automatic layout it conservatively supplies the configured
companion or seam, even in a wide window. This is a stable-API limitation; it does
not inspect private DOM or write settings. Zero-context hunks are cached by repository, pinned
revisions, and file for the tour; working-tree hunks are never cached.

Only marked companion preview tabs at their original placement are managed.
Pinning or moving one permanently gives ownership to the reviewer. The
`onBeatChange`, `onTourEnd`, and `never` close policies never close other tabs.
No companion scroll synchronization is attempted.
