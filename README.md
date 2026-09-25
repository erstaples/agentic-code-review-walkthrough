# Kankō diff tours: Over-the-shoulder code reviews in the age of AI

Kankō walks you through a diff the way a human author would — opening files,
highlighting the lines it's talking about, and pausing for questions.

Reviewing a large diff cold is hard. The usual fix is to ask the author to
"walk me through it": they share their screen, start with the shape of the
work, then go unit by unit, jumping to real code and pointing at it while they
explain. This plugin gives an agentic coding tool the same ability — a
companion VS Code extension lets it drive your editor while it narrates.

The walkthrough is backed by a private, local **review map**. It connects
requirements, code, decisions, evidence, and review progress. Change notes hold
the explanations and decisions; an event log preserves their history across
process restarts. Each review map is tied to
an exact committed diff or byte-level working-tree manifest, so changed code
cannot silently inherit old review state.

## What a diff tour looks like

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
Up to three active anchors are presented with matching numbered colors, labels,
and tab badges. Layout placement and the complete anchor list are subsequent phases.

Questions, concerns, and decisions become sourced review map entries when they
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
git clone https://github.com/getkanko/kanko.git
cd kanko
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
in root `plugin.json`; the output is `editor-extension/kanko-<version>.vsix`.
The extension, MCP runtime, and Claude/Codex plugins share that release version.
To prepare a release, add notes under `## Unreleased` in
`editor-extension/CHANGELOG.md`, then run `node scripts/version.js bump patch`
(or `minor`, `major`, or an explicit version). Required manifest copies and the
checked-in runtime are updated together. See the
[release procedure](docs/extension-publication.md#release-procedure) for checks
and publishing with a `vX.Y.Z` tag.
It replaces that version's existing package without publishing or installing it.
From `editor-extension`, the same command is available as `npm run rebuild:vsix`.

To install the rebuilt extension locally, run `./install.sh`.

Published VSIX files and checksums are attached to
[extension releases](https://github.com/getkanko/kanko/releases).
See [the publication guide](docs/extension-publication.md) for CI, Marketplace
setup, and the release procedure.

**On WSL or a remote workspace**, the extension must be installed on the same
side as your code. Run `install.sh` from inside the remote environment, not
from the Windows or local host. The `kanko_tour_status` tool reports which workspace
it resolved, which makes a mismatch obvious immediately.

### Step 2 — your agent

<details open>
<summary><strong>Claude Code</strong></summary>

```sh
/plugin marketplace add getkanko/kanko
/plugin install kanko@kanko
```

</details>

<details open>
<summary><strong>Codex CLI</strong></summary>

Codex uses the portable Agent Plugins manifest and MCP configuration included
at the repository root:

```sh
codex plugin marketplace add getkanko/kanko
codex plugin add kanko@kanko
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

**Register the MCP server.** Add a stdio server named `kanko` running
`node /absolute/path/to/mcp/server.js`. For a JSON-configured client:

```json
{
  "mcpServers": {
    "kanko": {
      "command": "node",
      "args": ["/absolute/path/to/kanko/mcp/server.js"]
    }
  }
}
```

**Give the agent the procedure.** Point the tool's rules or instructions file
at [`skills/kanko-tour/SKILL.md`](skills/kanko-tour/SKILL.md). Reference
the file rather than copying its contents — it's the single source of truth,
and a copy will drift.

</details>

## Usage

To implement a change and keep its decisions and evidence, ask in plain language:

- "Read `path/to/spec.md` and implement it"
- "Implement this change and maintain change notes"
- "Use `$kanko-build` to build this feature"

The `kanko-build` skill activates for substantial implementation,
fix, refactor, and migration work. It records sourced requirements and material
decisions during development, then binds final claims, code references, and
evidence to the stable working-tree candidate. It never marks its own work as
human-reviewed.

For the later ownership walkthrough, ask:

- "tour the changes"
- "walk me through this diff"
- "tour the branch head diff against main"
- "guide me through what changed in the last three commits"

The `kanko-tour` skill opens the prepared review map when one exists. If coding
happened without change notes, it reconstructs a draft from the selected
diff and labels inferred rationale accordingly.

While reviewing, select one or more lines and use **Kankō: Copy
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
See [the loading guide](docs/kanko-v2-tour-loading.md) for the flow.

The MCP server has two boundaries. Editor navigation remains a thin proxy to
the extension. The review map application service owns durable review state in a
per-user application-state directory outside the repository. Set
`KANKO_STATE_DIR` to override that location. The default directory is
`~/Library/Application Support/kanko` on macOS, `%LOCALAPPDATA%/kanko`
on Windows, and `$XDG_STATE_HOME/kanko` (or `~/.local/state/kanko`) on Linux.

### Tools

| Tool | What it does |
|---|---|
| `kanko_tour_status` | Preflight — confirms the extension is reachable and reports the resolved workspace |
| `kanko_tour_load` | Validates and loads the current review map plan into the sidebar |
| `kanko_tour_navigate` | Moves by beat, by stop, or to an explicit stop and beat |
| `kanko_tour_set_state` | Sets Following, Exploring, or Paused |
| `kanko_tour_clear` | Ends the presentation and removes highlights |
| `kanko_map_open` | Opens or creates the review map for an exact committed or working-tree change |
| `kanko_map_get` | Reads a bounded overview, entity set, tour, evidence matrix, or resume recap |
| `kanko_map_apply` | Atomically applies typed, provenance-bearing domain commands |
| `kanko_map_check` | Verifies event integrity, exact change freshness, and v2 tour anchors without mutation |
| `kanko_map_refresh` | Adds a change revision and conservatively invalidates stale review state |
| `kanko_map_receipt` | Previews or emits immutable local JSON and Markdown receipts |
| `kanko_map_delete` | Permanently deletes one explicitly confirmed local review map |

Kankō v2's stop, anchor, and beat authoring contract is documented in
[the tour model guide](docs/kanko-v2-tour-model.md). It validates plans before
storage. [Multi-anchor presentation](docs/kanko-v2-multi-anchor.md) describes source
identity and tab ownership. [Loading and navigation](docs/kanko-v2-tour-loading.md) use bridge
protocol 3; the old stop/focus tools and routes have been removed.

**The bridge has no write verb.** No endpoint modifies a file, so "installing
this extension cannot alter your repository" is a property of the software
rather than a promise in a prompt.

The bridge has no repository write verb. Review map tools write only to local
application state, and receipt publication is intentionally absent. The
service uses immutable hash-chained event files, a single-writer lock, and an
`expectedRevision` check on every mutation. Secret-shaped values are redacted
before command content is persisted.

Throughout, the tour keeps narrating the pinned base/head commits, so the code
under review stays still while you annotate it.

## Current boundaries

- Presentation opens up to three active anchors in native diffs or source views.
  Matching head content uses a real file; other revisions use read-only documents.
  Layout placement and the complete anchor list are later phases.
- Selecting code with the mouse or keyboard switches to Exploring. Paused
  removes decorations while leaving the editor arrangement in place.
- Ending a tour removes highlights, the sidebar snapshot, and untouched tour
  previews. Reviewer-owned, pinned, dirty, or moved tabs stay open. Exact layout
  restoration is a later phase.
- Changed working trees conservatively invalidate review state and stale evidence.
  A loaded tour retains its captured source until it is reloaded.
- Review map claims and review decisions remain in the agent conversation; this
  sidebar displays the authored tour and does not record human acceptance.

## Development

The MCP server runs directly with Node.js 22 or newer and has no runtime
dependencies or compilation step. The editor extension uses TypeScript and
esbuild during development; its VSIX includes locally built host and browser
bundles and needs no package download at installation time.

```
mcp/               stdio MCP server — editor proxy and review map service
editor-extension/  VS Code extension — HTTP server, decorations, diff views
schemas/           versioned review map, event, receipt, and tool contracts
skills/            implementation-capture and walkthrough procedures
docs/              design spec
```

Run the repository, contract, MCP, and compiled extension tests with:

```sh
cd editor-extension
npm ci
npm run typecheck
npm run format:check
npm run test:all
```

On macOS, prefix the test command with `TMPDIR=/private/tmp` if Git resolves
system temporary directories differently from Node. The MCP and contract tests
are compiled with the extension tests by `npm --prefix editor-extension run test:all`.

See [extension development](editor-extension/DEVELOPMENT.md) for build, watch,
packaging, and isolated native test instructions.

## Prior art

[CodeTour](https://marketplace.visualstudio.com/items?itemName=vsls-contrib.codetour)
renders authored `.tour` files as a navigable sidebar. It was considered and
not used: its navigation is reviewer-driven rather than author-driven, its
steps have no diff awareness, and it offers no way to read the reviewer's
selection back.

## License

MIT

See [naming conventions](docs/branding.md) for product names and identifiers.
