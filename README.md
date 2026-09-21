# tour-changes

Your agent walks you through a diff the way its author would — opening files,
highlighting the lines it's talking about, and pausing for questions.

Reviewing a large diff cold is hard. The usual fix is to ask the author to
"walk me through it": they share their screen, start with the shape of the
work, then go unit by unit, jumping to real code and pointing at it while they
explain. This plugin gives an agentic coding tool the same ability — a
companion VS Code extension lets it drive your editor while it narrates.

> **Status: design complete, implementation not started.**
> The architecture and wire protocol are specified in
> [`docs/superpowers/specs/2026-09-21-tour-changes-editor-bridge-design.md`](docs/superpowers/specs/2026-09-21-tour-changes-editor-bridge-design.md).
> Installation steps below describe the intended end state and are untested.
> One assumption is explicitly unverified — see [Known gaps](#known-gaps).

## What a tour looks like

You ask for a tour of a diff. The agent reads the full changed files rather
than just the hunks, groups the change into *stops* — one logical,
commit-message-worthy unit each, which may span several files — and then works
through them one at a time.

For each stop it opens that stop's files in VS Code's native multi-file diff
editor, highlights the relevant ranges, and narrates what changed, why, how it
connects to the rest of the code, and anything non-obvious worth spotlighting.
As it zooms in on a particular function it highlights that range specifically,
so you're always looking at the code being discussed.

Then it stops and waits. You can ask a question, say "next", go back, or jump
to a named stop. If you highlight something in the editor and ask "what's
this?", the agent reads your selection and answers about that code.

## Requirements

- **VS Code** with the `code` CLI on your `PATH`
- **Node.js** on the `PATH` of whichever agent launches the MCP server
- One of the supported agents below

The VS Code extension is what makes the tour *driven*. Without it the tour
still runs as text and clickable `path:line` links, and says plainly which
capabilities are unavailable — useful over SSH, in containers, or in editors
that aren't VS Code.

## Installation

### Step 1 — the VS Code extension (all agents)

```sh
git clone https://github.com/erstaples/claude-code-review-walkthrough.git
cd claude-code-review-walkthrough
./install.sh
```

`install.sh` verifies `node` and `code` are present, installs the packaged
extension, and then configures whichever agents it detects.

To install the extension by hand instead:

```sh
code --install-extension editor-extension/claude-tour-0.1.0.vsix
```

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

Codex reads the Claude plugin format natively — the same manifest, skills, and
MCP registration:

```sh
codex plugin marketplace add erstaples/claude-code-review-walkthrough
codex plugin add tour-changes@code-review-walkthrough
```

Verify the MCP server registered and its path resolved:

```sh
codex mcp get tour-bridge
```

If `args` still shows a literal `${CLAUDE_PLUGIN_ROOT}`, re-register it
explicitly:

```sh
codex mcp remove tour-bridge
codex mcp add tour-bridge -- node "$(pwd)/mcp/server.js"
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

Ask in plain language:

- "tour the changes"
- "walk me through this diff"
- "tour the branch head diff against main"
- "guide me through what changed in the last three commits"

The agent asks what to diff if it isn't clear, confirms the resolved `git diff`
command, and begins.

## How it works

Three processes, two hops — the agent talks to a small MCP server, which
proxies to the VS Code extension over an authenticated loopback HTTP channel.
The two find each other through a lockfile the extension writes on activation.
See [`diagram.md`](diagram.md) for the flow.

The MCP server is a stateless proxy; all editor state lives in the extension.
That keeps the piece the agent talks to trivial and the piece holding VS Code
APIs free of transport concerns.

### Tools

| Tool | What it does |
|---|---|
| `tour_status` | Preflight — confirms the extension is reachable and reports the resolved workspace |
| `tour_stop` | Opens a stop's files, as a multi-file diff or as working-tree files, and highlights its ranges |
| `tour_focus` | Points at one range inside the current stop, with an optional inline note |
| `tour_clear` | Removes highlights |
| `tour_context` | Reads what you're looking at — selection, cursor, enclosing symbol, visible range — so deictic questions land on the right code |

**There is no write path.** The protocol has no verb that modifies a file, so
"this plugin never edits your code" is a property of its shape rather than a
promise in a prompt.

Highlighting never moves your cursor or changes your selection. That would
overwrite the thing `tour_context` reads, and the selection belongs to you.

## Known gaps

- **`${CLAUDE_PLUGIN_ROOT}` substitution in Codex is unverified.** The `codex` binary references the variable, but `codex mcp get` displays it unexpanded. The Codex install instructions above include a check and a manual fallback. This is the one place the cross-agent story rests on an assumption rather than a probe.
- **`vscode.changes`** — the command driving the multi-file diff editor is built-in but has no formal API contract. Verified working against 1.138.0; a breaking change would mean falling back to per-file `vscode.diff`.
- **Lazy decoration.** The multi-file diff editor materializes each file's editors only when you scroll to them, so a stop's highlights land progressively rather than all at once. A file you never scroll to is never highlighted.
- **Large stops** may open more tabs than is comfortable. The skill classifies bulk and generated changes and samples representatively instead; no hard cap is implemented.

This is the first of two documents. The
[product spec](docs/superpowers/specs/2026-09-21-tour-changes-product-spec.md)
records what a tour needs beyond navigation — review state, evidence, rationale
provenance, and a closeout receipt — and is currently a stub.

## Development

Both halves are dependency-free plain JavaScript. Plugin installation doesn't
run `npm install`, so depending on an SDK would mean vendoring `node_modules`
into the repository.

```
mcp/               stdio MCP server — lockfile discovery, HTTP proxy
editor-extension/  VS Code extension — HTTP server, decorations, diff views
skills/            the tour procedure, loaded by Claude Code and Codex alike
docs/              design spec
```

## Prior art

[CodeTour](https://marketplace.visualstudio.com/items?itemName=vsls-contrib.codetour)
renders authored `.tour` files as a navigable sidebar. It was considered and
not used: its navigation is reviewer-driven rather than author-driven, its
steps have no diff awareness, and it offers no way to read the reviewer's
selection back.

## License

MIT
