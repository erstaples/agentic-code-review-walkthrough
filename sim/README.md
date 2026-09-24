# kanko review simulator

Walk through a kanko review without a model. A scripted agent runs in your
terminal where Claude Code would be, and drives the kanko extension in VS Code
through the real MCP server. Talk to it the way you'd talk to the real agent:
say "next", ask questions, paste citations, raise concerns, pause, and close
out. A state gallery jumps VS Code straight into specific presentation states,
such as the removed-code companion, the seam, a stale anchor, or deferred
highlights.

```
 you ⇄ sim/agent.js ──stdio MCP──▶ mcp/server.js ──HTTP bridge──▶ kanko in VS Code
       (scripted agent)            (real dossier)                 (your installed extension)
```

## Quick start

Requires Node.js 22+, git, and VS Code with kanko installed (`./install.sh`,
or the development extension).

```sh
node sim/agent.js --open
```

This builds a small fixture repo under `~/.cache/kanko-sim/retry-backoff/repo`
and opens it in VS Code with `--open`. The simulator waits for the kanko
extension to claim that folder, then starts the tour. Keep the terminal and
VS Code side by side.

```
agent › Retries now back off exponentially with a cap instead of hammering…
           1. Introduce a capped backoff policy          implementation
           2. withRetry sleeps between attempts          risk ⚠
           …
━━ Stop 1/5 — Introduce a capped backoff policy · implementation
   src/backoff.js:3-11
  ⏺ tour_stop  diff · src/backoff.js head 3-11
  ⏺ tour_focus  src/backoff.js head 7-8 "capped at maxMs"
agent › The cap is enforced here, in the policy, so no caller can forget it.

you › why cap at 2s?
```

Without VS Code, add `--editor headless`: the highlighted code prints in the
terminal instead.

## Talking to it

Anything that isn't a command is treated as a question. It's matched against
the tour's scripted answers for the current stop, then for the whole tour. An
answer can move the editor focus. An unmatched question is recorded in the
dossier as an open question, the same as a real agent does, and shows up at
closeout.

| You say | What happens |
|---|---|
| `next`, `n`, ⏎, `lgtm` | Marks the stop reviewed (or reviewed-with-concern) and presents the next one. With `pace beat`, first plays the next focus beat. |
| `back`, `go 3`, `go retry-sleeps`, `again` | Revisits or replays a stop. |
| `skip` | Marks the stop skipped. |
| `concern <text>` | Records a concern. The stop closes as reviewed-with-concern. |
| `src/retry.js:14 what's this?` | Paste a **kanko: Copy Citation** marker. The agent focuses those lines, quotes them, and answers from any narration anchored there. `[base@sha]` and `[head@sha]` suffixes are honoured. |
| `focus src/retry.js:3 base old code` | Points anywhere: `path:start[-end] [base\|head\|working] [note]`. |
| `agenda`, `status` | The plan with review states. Bridge, deferred highlights, and dossier health. |
| `states`, `states <n\|name>`, `tour` | The UI state gallery (below), and back to the review. |
| `finish` | Roll-up, outcome prompt, receipt preview, optional local receipt, `tour_clear`. |
| `pause` | Records a paused session and exits. The next run resumes from the dossier. |
| `quit` | Exits without pausing. The next run also resumes. |
| `pace beat\|stop`, `speed 200\|instant` | Stop after each focus, or play a stop's beats in one turn; narration speed. |
| `text on\|off` | Behave as if the bridge were unavailable (a text tour with citations). |
| `tools off`, `verbose on` | Hide the `⏺` tool-call lines, or show full JSON arguments and results. |

## UI state gallery

`states` lists them, and `states <n|name>` sets one up. Each prints what to look
for and what to try in VS Code. The gallery finds suitable files in the actual
diff, so it also works on generated tours. States that need settings write them
to the fixture repo's `.vscode/settings.json`, which is git-excluded and applied
live. The settings are removed when you run `tour`.

| State | Shows |
|---|---|
| `rails` | Stop rails in the file view, before any focus. Try **Show Diff** in the status bar. |
| `focus` | Following: focus box, inline label, dimmed context. Select code to switch to Exploring; **kanko: Follow Presenter** / **Pause Presentation** from the palette. |
| `quiet` | `showLabels: false`, `dimOpacity: 1`. |
| `companion` | Removed-code focus in an inline diff, with a read-only base companion beside it. Pin or move it to take ownership. |
| `seam` | `removedCode: seam`: a dashed seam with a "peek removed code" hover. |
| `side-by-side` | An explicit side-by-side diff: focus lands in the original pane, with no companion. |
| `added` / `deleted` / `renamed` | How each file status opens and where focus can go. |
| `deferred` | Every changed file in one stop. Toggle **Show Diff**, then run `status` to watch deferred `(path, side)` pairs drain as you scroll. |
| `stale` | Focuses a line, then edits it on disk 3 s later: dashed, clamped rail with a Stale label. The file is restored on `tour`. |
| `text` | The text-tour fallback. |
| `errors` | Refused requests (`diff_identity_mismatch`, `range_out_of_bounds`) leave the current stop untouched. |
| `clear` | `tour_clear`. |

## Tours

```sh
node sim/agent.js --list
node sim/agent.js timeout-config --open                  # working-tree tour, file mode
node sim/agent.js --repo ~/src/myproject --range main..HEAD --open
node sim/agent.js --repo . --working                     # your uncommitted work
```

- **retry-backoff** (default): a committed branch with added, modified,
  deleted, and renamed files, a risk stop, missing evidence, and scripted
  answers.
- **timeout-config**: uncommitted work in file mode. Edit `src/config.js` in
  VS Code mid-review, then say `next`. The agent hits `stale_change`, refreshes
  the dossier, and walks you back through the invalidated stops.
- **`--repo`**: generates a tour from any repository's diff, with one stop per
  file and one focus beat per hunk. The narration is mechanical; it's for seeing
  kanko render real code. Your repository is never written to. Its dossier lives
  under the simulator's state directory, and gallery settings are printed for you
  to apply yourself instead of written.

To write a tour, copy `sim/tours/retry-backoff.json`. It has these parts:

- `repo`: fixture files per revision. Arrays of lines keep line numbers easy
  to check.
- `entities`: claims, decisions, risks, and evidence, each with a `key`.
- `stops`: each has `files` and ranges, an `intro`, focus `beats`, and `qa`
  entries (`keywords`, `answer`, and optional `focus` and `record`).
- Top level: tour-wide `qa` and a `closing` summary.

Stop `covers` lists the entity keys that the stop reviews.

## State and reset

Fixture repos and their dossiers live under `~/.cache/kanko-sim/<tour>/`
(change it with `--dir`). They survive between runs so a VS Code window can
stay open and a paused review can resume. A fixture is rebuilt automatically
when its tour's `repo` block changes. `--reset` rebuilds it and discards the
dossier.

`status` prints the dossier state directory. Emitted receipts are written there
too, never into a repository and never published.
