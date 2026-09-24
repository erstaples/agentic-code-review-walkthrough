# kanko

Your agent walks you through a diff the way its author would — opening files,
highlighting the lines it's talking about, and pausing for questions.

Reviewing a large diff cold is hard. The usual fix is to ask the author to
"walk me through it": they share their screen, start with the shape of the
work, then go unit by unit, jumping to real code and pointing at it while they
explain. This plugin gives an agentic coding tool the same ability — a
companion VS Code extension lets it drive your editor while it narrates.

The walkthrough is backed by a private, local **living change dossier**. It
preserves the change thesis, claims, decisions, risks, evidence, questions,
and explicit review coverage across process restarts. Each dossier is tied to
an exact committed diff or byte-level working-tree manifest, so changed code
cannot silently inherit old review state.

## What a tour looks like

You ask for a tour of a diff. The agent reads the full changed files rather
than just the hunks, groups the change into *stops* — one logical,
commit-message-worthy unit each, which may span several files — and then works
through them one at a time.

For each stop it opens that stop's files in VS Code, highlights the relevant
ranges, and narrates what changed, why, how it connects to the rest of the code,
and anything non-obvious worth spotlighting.
As it zooms in on a particular function it highlights that range specifically,
so you're always looking at the code being discussed.

The **Tour** view in the secondary sidebar shows the current stop, beat,
risk, revisions, and narration. Numbered chips open the cited source. Use
**Previous beat**, **Next beat**, or the stop controls to navigate. **Following**
opens the selected anchor; **Exploring** lets narration advance while the
editor stays still; **Paused** removes tour highlights. **End tour** clears the
presentation without recording review acceptance.

An agent loads the complete authored plan and advances it through public MCP
operations. Invalid plans return findings before changing the current display.
For now, one selected anchor is presented at a time. Multi-anchor presentation,
layout placement, and the complete anchor list are subsequent phases.

Questions, concerns, and decisions become sourced dossier entries when they
matter beyond the current conversation. At closeout you can save an immutable
JSON and Markdown receipt covering what was reviewed, what evidence was
inspected, what risk was accepted, and what remains unresolved.

## Requirements

- **VS Code 1.139 or newer** with the `code` CLI on your `PATH`
- **Node.js 22 or newer** on the `PATH` of whichever agent launches the MCP server
- One of the supported agents below

The VS Code extension is what makes the tour *driven*. Without it the tour
still runs as text and clickable `path:line` links, and says plainly which
capabilities are unavailable — useful over SSH, in containers, or in editors
that aren't VS Code.

## Installation

### Step 1 — the VS Code extension (all agents)

```sh
git clone https://github.com/erstaples/agentic-code-review-walkthrough.git
cd agentic-code-review-walkthrough
./install.sh
```

`install.sh` verifies `node` and `code` are present, installs the packaged
extension, and then configures whichever agents it detects.

To rebuild the VSIX from the repository root:

```sh
./scripts/build-vsix.sh
```

This requires Node.js 22 or newer, npm, and Python 3.9 or newer. It installs
locked dependencies, checks release metadata, rebuilds and validates the VSIX,
and prints its absolute path. The filename follows the package name and version
in `editor-extension/package.json`, currently `editor-extension/kanko-0.1.1.vsix`.
It replaces that version's existing package without publishing or installing it.
From `editor-extension`, the same command is available as `npm run rebuild:vsix`.

To install the rebuilt extension locally, run `./install.sh`.

Published VSIX files and checksums are attached to
[extension releases](https://github.com/erstaples/agentic-code-review-walkthrough/releases).
See [the publication guide](docs/extension-publication.md) for CI, Marketplace
setup, and the release procedure.

**On WSL or a remote workspace**, the extension must be installed on the same
side as your code. Run `install.sh` from inside the remote environment, not
from the Windows or local host. The `tour_status` tool reports which workspace
it resolved, which makes a mismatch obvious immediately.

### Step 2 — your agent

<details open>
<summary><strong>Claude Code</strong></summary>

```sh
/plugin marketplace add erstaples/claude-code-review-walkthrough
/plugin install tour-changes@code-review-walkthrough
```

</details>

<details open>
<summary><strong>Codex CLI</strong></summary>

Codex uses the portable Agent Plugins manifest and MCP configuration included
at the repository root:

```sh
codex plugin marketplace add erstaples/claude-code-review-walkthrough
codex plugin add tour-changes@code-review-walkthrough
```

Start a new Codex thread after installation so it loads the plugin's skill and
MCP tools. To inspect the installed plugin:

```sh
codex plugin list
```

</details>

<details>
<summary><strong>Cursor, Gemini CLI, Windsurf, and other MCP clients</strong></summary>

These tools have no plugin manifest, so registration is manual. Two steps:

**Register the MCP server.** Add a stdio server named `tour-bridge` running
`node /absolute/path/to/mcp/server.js`. For a JSON-configured client:

```json
{
  "mcpServers": {
    "tour-bridge": {
      "command": "node",
      "args": ["/absolute/path/to/claude-code-review-walkthrough/mcp/server.js"]
    }
  }
}
```

**Give the agent the procedure.** Point the tool's rules or instructions file
at [`skills/tour-changes/SKILL.md`](skills/tour-changes/SKILL.md). Reference
the file rather than copying its contents — it's the single source of truth,
and a copy will drift.

</details>

## Usage

For implementation with continuous dossier capture, ask in plain language:

- "Read `path/to/spec.md` and implement it"
- "Implement this change and maintain a living dossier"
- "Use `$develop-with-dossier` to build this feature"

The `develop-with-dossier` skill activates for substantial implementation,
fix, refactor, and migration work. It records sourced requirements and material
decisions during development, then binds final claims, code references, and
evidence to the stable working-tree candidate. It never marks its own work as
human-reviewed.

For the later ownership walkthrough, ask:

- "tour the changes"
- "walk me through this diff"
- "tour the branch head diff against main"
- "guide me through what changed in the last three commits"

The `tour-changes` skill opens the prepared dossier when one exists. If coding
happened without dossier capture, it reconstructs a draft from the selected
diff and labels inferred rationale accordingly.

While reviewing, select one or more lines and use **kanko: Copy
Citation** from the editor context menu. It copies an agent-neutral,
repository-relative marker such as `editor-extension/lib/editor.js:56-70` for
pasting into Claude Code, Codex, another agent, or a review comment. Citations
from pinned walkthrough diffs also identify the side and revision, for example
`editor-extension/lib/editor.js:56-70 [base@a1b2c3d]`; the selected source text
is never copied.

## How it works

Three processes, two hops — the agent talks to a small MCP server, which
proxies to the VS Code extension over an authenticated loopback HTTP channel.
The two find each other through a lockfile the extension writes on activation.
See [the loading guide](docs/relay-v2-tour-loading.md) for the flow.

The MCP server has two boundaries. Editor navigation remains a thin proxy to
the extension. The dossier application service owns durable review state in a
per-user application-state directory outside the repository. Set
`TOUR_CHANGES_STATE_DIR` to override that location.

### Tools

| Tool | What it does |
|---|---|
| `tour_status` | Preflight — confirms the extension is reachable and reports the resolved workspace |
| `relay_load_tour` | Validates and loads the current dossier plan into the sidebar |
| `relay_navigate` | Moves by beat, by stop, or to an explicit stop and beat |
| `relay_set_state` | Sets Following, Exploring, or Paused |
| `tour_clear` | Ends the presentation and removes highlights |
| `dossier_open` | Opens or creates the dossier for an exact committed or working-tree change |
| `dossier_get` | Reads a bounded overview, entity set, tour, evidence matrix, or resume recap |
| `dossier_apply` | Atomically applies typed, provenance-bearing domain commands |
| `dossier_check` | Verifies event integrity, exact change freshness, and v2 tour anchors without mutation |
| `dossier_refresh` | Adds a change revision and conservatively invalidates stale review state |
| `dossier_receipt` | Previews or emits immutable local JSON and Markdown receipts |
| `dossier_delete` | Permanently deletes one explicitly confirmed local dossier |

Relay v2's stop, anchor, and beat authoring contract is documented in
[the tour model guide](docs/relay-v2-tour-model.md). It validates plans before
storage. [Loading and navigation](docs/relay-v2-tour-loading.md) use bridge
protocol 2; the old stop/focus tools and routes have been removed.

**The bridge has no write verb.** No endpoint modifies a file, so "installing
this extension cannot alter your repository" is a property of the software
rather than a promise in a prompt.

The bridge has no repository write verb. Dossier tools write only to local
application state, and receipt publication is intentionally absent. The
service uses immutable hash-chained event files, a single-writer lock, and an
`expectedRevision` check on every mutation. Secret-shaped values are redacted
before command content is persisted.

Throughout, the tour keeps narrating the pinned base/head commits, so the code
under review stays still while you annotate it.

## Current boundaries

- Presentation currently opens one selected anchor in a read-only revision view
  or native diff. Multi-anchor colors, badges, layout placement, and tab ownership
  are later phases.
- Explicit Exploring and Paused controls are available. Automatic changes of
  mode after editor interaction are not implemented yet.
- Ending a tour removes highlights and the sidebar snapshot; revision tabs stay
  open. Automatic tab cleanup is a later phase.
- Changed working trees conservatively invalidate review state and stale evidence.
  A loaded tour retains its captured source until it is reloaded.
- Dossier claims and review decisions remain in the agent conversation; this
  sidebar displays the authored tour and does not record human acceptance.

## Development

The runtime is dependency-free JavaScript. Plugin installation doesn't
run `npm install`, so depending on an SDK would mean vendoring `node_modules`
into the repository.

```
mcp/               stdio MCP server — editor proxy and dossier service
editor-extension/  VS Code extension — HTTP server, decorations, diff views
schemas/           versioned dossier, event, receipt, and tool contracts
skills/            implementation-capture and walkthrough procedures
docs/              design spec
```

Run the full dependency-free suite with:

```sh
node --test test/*.test.js mcp/test/*.test.js editor-extension/test/*.test.js
```

## Prior art

[CodeTour](https://marketplace.visualstudio.com/items?itemName=vsls-contrib.codetour)
renders authored `.tour` files as a navigable sidebar. It was considered and
not used: its navigation is reviewer-driven rather than author-driven, its
steps have no diff awareness, and it offers no way to read the reviewer's
selection back.

## License

MIT
