# Offline end-to-end review harness

Step through a full code review without a model. A scripted agent replays the
tool calls a model would make, in order, against the real stdio MCP server.
The server writes a real dossier, and its `tour_*` calls cross the real HTTP
bridge to an editor.

```
scenario JSON ──▶ scripted agent ──stdio JSON-RPC──▶ mcp/server.js ──HTTP──▶ headless editor
 (the "model")     e2e/lib/scenario.js                 (unchanged)            or a real VS Code
```

- **No model, no network.** Everything runs locally in a throwaway git repo
  and a throwaway dossier state directory.
- **The shipped surface only.** The harness spawns `mcp/server.js` and speaks
  MCP to it the way Claude Code or Codex does. It doesn't import server
  internals.
- **A headless editor that validates like the real one.** It runs the
  extension's own `httpserver.js`, `lockfile.js`, `identity.js`, and `git.js`.
  It mirrors `editor.js` range and diff-side validation and records what would
  be highlighted, so a bad range fails the same way it would in VS Code.

## Running

```sh
node e2e/run.js                           # every scenario, non-interactive
node e2e/run.js committed-review --step   # walk through one review, step by step
node e2e/run.js --list
```

| Option | Effect |
|---|---|
| `--step` | Pause before every step. Keys: **⏎** run it, **c** continue without pausing, **a** show the resolved arguments, **r** show the previous result, **q** quit. |
| `--break <target>` | Run straight to the target, then start stepping. A target is a 1-based step number, a step `id`, a tool name, or a tour stop id, for example `--break drop-busy-wait`. |
| `--editor headless` | Default. Runs the in-process headless editor and prints each stop's and focus's highlighted code. |
| `--editor vscode` | Drives a real VS Code. Opens the fixture repo with `code --new-window`, waits for the kanko extension's lockfile, then runs the tour in that window. The fixture is kept so the window stays valid. |
| `--editor none` | Runs a text tour. `tour_status` must fail with `no_bridge`, other `tour_*` calls are skipped, and the dossier flow still runs. |
| `--keep` | Keep the fixture repo and dossier state, and print their paths so you can inspect events and receipts. |
| `--transcript <file>` | Write a Markdown transcript: narration, every tool call with its resolved arguments, results, and highlighted code. |
| `-v`, `--verbose` | Print full arguments and results. |

The exit code is non-zero when any scenario fails, so the harness works as a
CI gate. `test/e2e.test.js` runs every scenario under `node --test`, in both
headless and text-tour modes, as part of the normal suite.

## Scenarios

| Scenario | Covers |
|---|---|
| `committed-review` | Full tour of a committed branch: dossier preparation and a four-stop plan, diff-mode stops with head- and base-side focus, a reviewer question and its answer, claim and risk dispositions, a concern, recap, closeout, receipt preview and emit, integrity check, and `tour_clear`. |
| `working-tree-drift` | Tour of uncommitted work. The author edits a file mid-review, which produces `stale_change`, then `dossier_check`, `dossier_refresh` with conservative invalidation, pause, and a fresh `dossier_open` that resumes from the recap. |
| `guardrails` | Calls a confused model might make: repinning mid-tour, out-of-range focus, a base side on an added file, the wrong side in file mode, focus after clear, stale `expectedRevision`, missing provenance, and an unconfirmed delete. |

## Writing a scenario

A scenario is a JSON file in `e2e/scenarios/`:

```json
{
  "name": "my-feature",
  "description": "One line shown in --list.",
  "repo": {
    "base": { "src/a.js": ["line 1", "line 2"] },
    "head": { "src/a.js": ["line 1", "changed"], "src/gone.js": null },
    "worktree": { "notes.md": "uncommitted\n" }
  },
  "vars": { "agent": { "kind": "agent", "id": "scripted-agent" } },
  "steps": [
    { "reviewer": "Tour this branch.", "say": "Opening the dossier." },
    { "id": "open", "call": "dossier_open", "args": { "workspace": "{{ repo.workspace }}", "selection": { "kind": "committed", "base": "{{ repo.base }}", "head": "{{ repo.head }}" }, "actor": "{{ agent }}" },
      "match": { "requiredNextAction": "prepare" } }
  ]
}
```

**Repo.** `base` is committed on `main` (or `baseBranch`). `head` is committed
on `feature` (or `headBranch`), where `null` deletes a file. `worktree` is left
uncommitted. File content can be a string or an array of lines. Arrays make
line numbers in ranges easy to check.

**Steps.** A step can have any of these fields:

- `call` + `args`: a tool call. Arguments are checked against the tool's
  advertised `inputSchema` before the call, so a scenario that has drifted
  from the schema fails loudly. Set `"validateArgs": false` to send a
  deliberately invalid call.
- `id`: stores the result as `steps.<id>` for later templates.
- `match`: a partial deep match on the result. Arrays match by position.
  Operators: `{"$len": n}`, `{"$exists": bool}`, `{"$contains": s}`,
  `{"$regex": s}`, `{"$gte": n}`.
- `expectError`: the step must fail with this error `code`. Without it, any
  tool error fails the scenario.
- `capture`: `{"name": "path.in.result"}` saves a value as a top-level
  template variable.
- `edit`: `{"path": content}` writes to the workspace mid-review, to simulate
  drift. `null` deletes a file.
- `say` / `reviewer`: the agent's narration and the reviewer's line. They're
  shown while stepping and written to the transcript.

**Templates.** `"{{ expr }}"` as a whole string inserts the raw value, such as
an object or number. Inside a longer string it interpolates. Available
expressions:

- `repo.workspace`, `repo.base`, `repo.head`, `repo.baseName`, `repo.headName`
- `vars` entries by name
- `steps.<id>...`, `last`, and captured names
- `rev`: the latest `aggregateRevision` seen
- `dossierId`: the latest dossier id seen

Paths support `[n]` (negative counts from the end), `[key=value]`, and
`[key~substring]`. For example:
`{{ steps.claims.entities[statement~capped].id }}`.

Execution stops at the first failing step, because every later step depends
on the state the earlier ones built.

## Environment

The harness isolates itself with two variables that the MCP server honours:
`TOUR_CHANGES_STATE_DIR` for dossier state, and `TOUR_CHANGES_LOCK_DIR` for
bridge lockfiles. In `--editor vscode` mode, the lock directory is left at its
default (`~/.claude/tour`) so the real extension and the server can find each
other.
