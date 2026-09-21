# tour-changes Editor Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give an agentic coding tool the ability to drive VS Code while narrating a diff — opening files, highlighting the lines under discussion, reading back what the reviewer is looking at, and applying confirmed mid-review edits.

**Architecture:** Three processes, two hops. A dependency-free stdio MCP server (`mcp/`) discovers the right editor window through a lockfile and proxies JSON over authenticated loopback HTTP to a companion VS Code extension (`editor-extension/`), which owns all editor state. Code that touches the `vscode` API is isolated in one module per side so everything else is unit-testable without a display.

**Tech Stack:** Node.js 20+ (plain CommonJS, zero runtime dependencies), `node:test` for unit tests, `@vscode/test-electron` + `xvfb-run` for extension integration tests, VS Code Extension API.

**Spec:** [`docs/superpowers/specs/2026-09-21-tour-changes-editor-bridge-design.md`](../specs/2026-09-21-tour-changes-editor-bridge-design.md)
Product scope deliberately excluded from this plan: [`docs/superpowers/specs/2026-09-21-tour-changes-product-spec.md`](../specs/2026-09-21-tour-changes-product-spec.md)

## Global Constraints

- **Zero runtime dependencies** in `mcp/` and `editor-extension/`. Plugin installation never runs `npm install`. Dev dependencies are allowed and live in `package.json` `devDependencies` only.
- **Node 20+** required (uses `node:test`). The `node` binary must be on the PATH of whichever agent launches the MCP server.
- **Line numbers are 1-based and inclusive on the wire.** Conversion to VS Code's 0-based `Position` happens only in `editor-extension/lib/editor.js`.
- **Paths are repository-relative on the wire**, resolved against the matched workspace folder inside the extension.
- **Every HTTP request carries** `Authorization: Bearer <authToken>` and `{"protocolVersion": 1}` in its body (or `?protocolVersion=1` for GETs).
- **The HTTP server binds `127.0.0.1` only** and rejects any request carrying an `Origin` header.
- **No write verb in the bridge.** No endpoint may modify a file. `POST /rebaseline` reads and hashes only.
- **Error responses** are `{ "ok": false, "error": { "code": "...", "message": "..." } }` with codes drawn from: `unauthorized`, `protocol_mismatch`, `bad_request`, `file_not_found`, `range_out_of_bounds`, `git_failed`, `no_active_editor`, `content_drift`, `diff_identity_mismatch`.
- **Skill voice is second person.** No references to Claude-specific sibling skills by slash name.
- **Commit after every task.** Never use `git add -A`; stage named paths.

## Phases

Each phase ends with an installable, strictly more capable product.

| Phase | Capability delivered | Tasks |
|---|---|---|
| 0 | **Frozen contract.** The wire protocol both sides build against. Serial — blocks everything. | 0 |
| 1 | **Drive the editor.** Files open and highlight as the agent narrates; text-and-links fallback when absent. | 1–7b |
| 2 | **Real diffs.** Pinned commit identity, side-aware coordinates, native multi-file diff editor. | 8–11 |
| 3 | **Two-way.** Point at code and ask about it; the agent reads where you're looking. | 12–13 |
| 4 | **Mid-review edits.** Drift detection, confirmed edits, ledger, closeout receipt. | 14–17 |

## Parallel Execution

Work splits into three tracks that never edit the same file. After Task 0 they
run concurrently within each phase and join at a phase gate.

| Track | Owns | Never touches |
|---|---|---|
| **A — Extension** | `editor-extension/**` | `mcp/`, `skills/`, root config |
| **B — Bridge client** | `mcp/**`, `.mcp.json` | `editor-extension/`, `skills/` |
| **C — Product surface** | `skills/**`, `.claude-plugin/**`, `install.sh`, `README.md`, `LICENSE`, `test/` | `mcp/`, `editor-extension/` |

**Task 0 is serial and blocks all three tracks.** It freezes the wire protocol
as executable fixtures. Track A tests "given this request, I produce this
response" against those fixtures; Track B tests "given this response, I produce
this tool result" against the same fixtures. Neither track needs the other's
code to be correct or even to exist.

**Dispatch per phase** — tasks on the same row run concurrently:

| Phase | Track A | Track B | Track C | Gate |
|---|---|---|---|---|
| 0 | — | — | — | Task 0 (serial) |
| 1 | 4, 5, 6 | 2, 3, 7 | 1, 7b | Task G1 |
| 2 | 8, 9, 10 | 10b | 11 | Task G2 |
| 3 | 12 | 12b | 13 | Task G3 |
| 4 | 14, 15 | 15b | 16 | Task 17 |

Within a track, tasks are ordered and must run in sequence. Gate tasks (`G1`,
`G2`, `G3`, `17`) are integration checkpoints: they run the full suite across
both sides, verify by hand, and tag. A gate cannot start until every task in
its phase row is complete.

**Merge discipline for concurrent tracks:** each track works on its own branch
off the phase's starting commit (`track-a/phase-1`, `track-b/phase-1`,
`track-c/phase-1`). The gate task merges all three. Because file ownership does
not overlap, merges are expected to be conflict-free; a conflict means a track
edited outside its lane and should be corrected rather than resolved.

---

# Phase 0 — Freeze the contract

Serial. One task. Everything else depends on it, and nothing else may start
until it lands.

---

### Task 0: Shared protocol contract [serial — blocks A, B, C]

Both sides need the same constants and the same idea of what a valid exchange
looks like. The extension is packaged into a `.vsix` that cannot reach outside
its own directory, so its copy of the contract is generated and drift-checked
rather than shared by reference.

**Files:**
- Create: `contract/protocol.js`
- Create: `contract/fixtures.json`
- Create: `contract/README.md`
- Create: `contract/sync.js`
- Create: `test/contract.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `PROTOCOL_VERSION`, `ERROR_CODES`, `SIDES`, `STOP_TYPES`, `MODES`, `ROUTES` from `contract/protocol.js`; request/response fixtures keyed by endpoint from `contract/fixtures.json`; `node contract/sync.js` regenerates `editor-extension/lib/contract.js`

- [ ] **Step 1: Write the failing test**

Create `test/contract.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const contract = require("../contract/protocol.js");
const fixtures = require("../contract/fixtures.json");

test("the protocol version is 1", () => {
  assert.strictEqual(contract.PROTOCOL_VERSION, 1);
});

test("every documented error code is declared exactly once", () => {
  const expected = [
    "unauthorized", "protocol_mismatch", "bad_request", "file_not_found",
    "range_out_of_bounds", "git_failed", "no_active_editor", "content_drift",
    "diff_identity_mismatch",
  ].sort();
  assert.deepStrictEqual([...contract.ERROR_CODES].sort(), expected);
});

test("sides, modes, and stop types are closed sets", () => {
  assert.deepStrictEqual(contract.SIDES, ["base", "head", "working"]);
  assert.deepStrictEqual(contract.MODES, ["diff", "file"]);
  assert.deepStrictEqual(contract.STOP_TYPES, ["context", "implementation", "risk", "evidence", "limitation"]);
});

test("every route maps a tool name to a method and path", () => {
  for (const [tool, route] of Object.entries(contract.ROUTES)) {
    assert.match(tool, /^tour_[a-z_]+$/);
    assert.ok(["GET", "POST"].includes(route.method), `${tool} has a bad method`);
    assert.match(route.path, /^\/[a-z]+$/);
  }
});

test("every route has at least one request fixture and one response fixture", () => {
  for (const tool of Object.keys(contract.ROUTES)) {
    const f = fixtures[tool];
    assert.ok(f, `no fixtures for ${tool}`);
    assert.ok(Array.isArray(f.requests) && f.requests.length > 0, `${tool} has no request fixtures`);
    assert.ok(Array.isArray(f.responses) && f.responses.length > 0, `${tool} has no response fixtures`);
  }
});

test("every request fixture carries the protocol version", () => {
  for (const [tool, f] of Object.entries(fixtures)) {
    for (const req of f.requests) {
      if (contract.ROUTES[tool].method === "GET") continue;
      assert.strictEqual(req.body.protocolVersion, contract.PROTOCOL_VERSION, `${tool} request fixture is missing protocolVersion`);
    }
  }
});

test("error fixtures only use declared codes", () => {
  for (const [tool, f] of Object.entries(fixtures)) {
    for (const res of f.responses) {
      if (res.ok) continue;
      assert.ok(contract.ERROR_CODES.includes(res.error.code), `${tool} response fixture uses undeclared code ${res.error.code}`);
    }
  }
});

test("line numbers in fixtures are 1-based", () => {
  const scan = (node) => {
    if (Array.isArray(node)) return node.forEach(scan);
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node)) {
        if (/^(start|end)Line$/.test(k)) assert.ok(v >= 1, `${k} must be 1-based, got ${v}`);
        else scan(v);
      }
    }
  };
  scan(fixtures);
});

test("the extension's generated contract copy has not drifted", () => {
  const generated = path.join(__dirname, "..", "editor-extension", "lib", "contract.js");
  assert.ok(fs.existsSync(generated), "run: node contract/sync.js");
  const theirs = require(generated);
  assert.deepStrictEqual(
    { v: theirs.PROTOCOL_VERSION, e: theirs.ERROR_CODES, s: theirs.SIDES, m: theirs.MODES, t: theirs.STOP_TYPES },
    { v: contract.PROTOCOL_VERSION, e: contract.ERROR_CODES, s: contract.SIDES, m: contract.MODES, t: contract.STOP_TYPES }
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/contract.test.js`
Expected: FAIL — `Cannot find module '../contract/protocol.js'`.

- [ ] **Step 3: Write the contract**

Create `contract/protocol.js`:

```javascript
"use strict";

const PROTOCOL_VERSION = 1;

const ERROR_CODES = [
  "unauthorized",
  "protocol_mismatch",
  "bad_request",
  "file_not_found",
  "range_out_of_bounds",
  "git_failed",
  "no_active_editor",
  "content_drift",
  "diff_identity_mismatch",
];

const SIDES = ["base", "head", "working"];
const MODES = ["diff", "file"];
const STOP_TYPES = ["context", "implementation", "risk", "evidence", "limitation"];

const ROUTES = {
  tour_status: { method: "GET", path: "/status" },
  tour_stop: { method: "POST", path: "/stop" },
  tour_focus: { method: "POST", path: "/focus" },
  tour_clear: { method: "POST", path: "/clear" },
  tour_context: { method: "GET", path: "/context" },
  tour_rebaseline: { method: "POST", path: "/rebaseline" },
};

module.exports = { PROTOCOL_VERSION, ERROR_CODES, SIDES, MODES, STOP_TYPES, ROUTES };
```

Create `contract/fixtures.json`. Every entry is a real exchange both tracks
test against — Track A asserts it produces these responses, Track B asserts it
consumes them:

```json
{
  "tour_status": {
    "requests": [{ "query": { "protocolVersion": 1 }, "body": {} }],
    "responses": [
      { "ok": true, "protocolVersion": 1, "extensionVersion": "0.1.0", "ideName": "Visual Studio Code", "workspaceFolders": ["/repo"] },
      { "ok": false, "error": { "code": "unauthorized", "message": "missing or invalid bearer token" } }
    ]
  },
  "tour_stop": {
    "requests": [
      { "body": { "protocolVersion": 1, "stopId": "s1", "index": 1, "total": 3, "label": "Extract the retry policy", "type": "implementation", "mode": "file",
                  "base": { "sha": "WORKTREE", "name": "working tree" }, "head": { "sha": "WORKTREE", "name": "working tree" },
                  "files": [{ "path": "internal/retry/policy.go", "ranges": [{ "side": "working", "startLine": 12, "endLine": 48 }] }] } },
      { "body": { "protocolVersion": 1, "stopId": "s2", "index": 2, "total": 3, "label": "Cap the backoff", "type": "risk", "mode": "diff",
                  "base": { "sha": "4f2a9c1000000000000000000000000000000000", "name": "main" },
                  "head": { "sha": "8b71e03000000000000000000000000000000000", "name": "HEAD" },
                  "files": [{ "path": "internal/client/do.go", "ranges": [{ "side": "base", "startLine": 88, "endLine": 94 }, { "side": "head", "startLine": 88, "endLine": 91 }] }] } }
    ],
    "responses": [
      { "ok": true, "opened": ["internal/retry/policy.go"], "deferred": [] },
      { "ok": true, "opened": ["internal/client/do.go", "internal/retry/policy.go"], "deferred": ["internal/retry/policy.go"] },
      { "ok": false, "error": { "code": "diff_identity_mismatch", "message": "this tour is pinned to 4f2a9c1..8b71e03; got 4f2a9c1..cccc333" } },
      { "ok": false, "error": { "code": "content_drift", "message": "changed since this tour started: internal/retry/policy.go" } }
    ]
  },
  "tour_focus": {
    "requests": [
      { "body": { "protocolVersion": 1, "path": "internal/retry/policy.go", "side": "head", "startLine": 31, "endLine": 35, "note": "backoff is capped here, not in the caller" } }
    ],
    "responses": [
      { "ok": true, "revealed": true },
      { "ok": false, "error": { "code": "range_out_of_bounds", "message": "lines 99999-99999 fall outside 48-line file" } },
      { "ok": false, "error": { "code": "file_not_found", "message": "does/not/exist.go does not exist in this workspace" } }
    ]
  },
  "tour_clear": {
    "requests": [{ "body": { "protocolVersion": 1 } }],
    "responses": [{ "ok": true }]
  },
  "tour_context": {
    "requests": [{ "query": { "protocolVersion": 1 }, "body": {} }],
    "responses": [
      { "ok": true, "context": { "path": "internal/retry/policy.go", "side": "head", "cursor": { "line": 33, "character": 8 },
        "selection": { "startLine": 31, "endLine": 35, "text": "if d > max {\n\td = max\n}" },
        "symbol": { "name": "capBackoff", "kind": "Function", "startLine": 28, "endLine": 41 },
        "visibleRange": { "startLine": 18, "endLine": 52 },
        "nearby": { "before": "// cap prevents unbounded sleep\n", "after": "\nreturn d\n" },
        "stopId": "s2", "focus": { "path": "internal/retry/policy.go", "side": "head", "startLine": 31, "endLine": 35 } } },
      { "ok": true, "context": { "path": "internal/retry/policy.go", "side": "working", "cursor": { "line": 3, "character": 0 },
        "selection": null, "symbol": null, "visibleRange": { "startLine": 1, "endLine": 40 },
        "nearby": { "before": "", "after": "package retry\n" }, "stopId": null, "focus": null } },
      { "ok": false, "error": { "code": "no_active_editor", "message": "no editor is focused" } }
    ]
  },
  "tour_rebaseline": {
    "requests": [{ "body": { "protocolVersion": 1, "paths": ["internal/retry/policy.go"], "reason": "applied review edit at stop 2" } }],
    "responses": [
      { "ok": true, "digests": { "internal/retry/policy.go": "0000000000000000000000000000000000000000000000000000000000000000" } },
      { "ok": false, "error": { "code": "bad_request", "message": "paths must be a non-empty array" } }
    ]
  }
}
```

Create `contract/sync.js`:

```javascript
#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const c = require("./protocol.js");

const out = path.join(__dirname, "..", "editor-extension", "lib", "contract.js");
const body = `"use strict";

// Generated by contract/sync.js. Do not edit.
// The extension is packaged as a .vsix and cannot require outside its own
// directory, so the shared contract is copied here and drift-checked in CI.

module.exports = ${JSON.stringify(
  { PROTOCOL_VERSION: c.PROTOCOL_VERSION, ERROR_CODES: c.ERROR_CODES, SIDES: c.SIDES, MODES: c.MODES, STOP_TYPES: c.STOP_TYPES },
  null,
  2
)};
`;

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, body);
console.log(`wrote ${out}`);
```

Create `contract/README.md`:

```markdown
# Wire contract

`protocol.js` is the source of truth for the protocol version, error codes, and
closed value sets. `fixtures.json` holds canonical request/response pairs per
endpoint.

Both sides of the bridge test against these fixtures without depending on each
other, which is what lets the extension and the MCP client be built in
parallel.

`editor-extension/lib/contract.js` is generated — run `node contract/sync.js`
after any change here. `test/contract.test.js` fails if the copy drifts.

Changing anything in this directory is a protocol change: bump
`PROTOCOL_VERSION` and update both sides.
```

- [ ] **Step 4: Generate the extension's copy and run the test**

```bash
node contract/sync.js
node --test test/contract.test.js
```

Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add contract/protocol.js contract/fixtures.json contract/sync.js contract/README.md editor-extension/lib/contract.js test/contract.test.js
git commit -m "feat: freeze the bridge wire contract

Canonical request/response fixtures both sides test against without
depending on each other, which is what lets the extension and the MCP
client be built in parallel.

The extension's copy is generated rather than shared by reference,
because a .vsix cannot require outside its own directory."
```

---

# Phase 1 — Drive the editor

At the end of this phase the plugin installs into Claude Code or Codex, the
extension installs into VS Code, and asking for a tour opens and highlights
real files as the agent talks. Diff-mode rendering, selection read-back, and
edits are not yet present.

---

### Task 1: Plugin skeleton and generalized skill [Track C]

Turns the repository into an installable plugin. The skill still runs text-only
— no bridge exists yet — but it is correctly packaged, correctly named, and no
longer addresses a specific person.

**Files:**
- Create: `.claude-plugin/marketplace.json`
- Create: `.claude-plugin/plugin.json`
- Create: `skills/tour-changes/SKILL.md` (moved from `SKILL.md`)
- Create: `LICENSE`
- Delete: `SKILL.md`

**Interfaces:**
- Consumes: nothing
- Produces: plugin name `tour-changes`, marketplace name `code-review-walkthrough`, skill directory `skills/tour-changes/`

- [ ] **Step 1: Write the failing test**

Create `test/plugin-manifest.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const readJson = (p) => JSON.parse(fs.readFileSync(path.join(root, p), "utf8"));

test("marketplace declares the tour-changes plugin from the repo root", () => {
  const m = readJson(".claude-plugin/marketplace.json");
  assert.strictEqual(m.name, "code-review-walkthrough");
  const plugin = m.plugins.find((p) => p.name === "tour-changes");
  assert.ok(plugin, "tour-changes plugin missing from marketplace");
  assert.strictEqual(plugin.source, "./");
});

test("plugin.json name matches the marketplace entry", () => {
  assert.strictEqual(readJson(".claude-plugin/plugin.json").name, "tour-changes");
});

test("skill lives in a directory matching its frontmatter name", () => {
  const body = fs.readFileSync(path.join(root, "skills/tour-changes/SKILL.md"), "utf8");
  assert.match(body, /^name: tour-changes$/m);
});

test("skill is generalized: no personal name, no sibling-skill slash references", () => {
  const body = fs.readFileSync(path.join(root, "skills/tour-changes/SKILL.md"), "utf8");
  assert.doesNotMatch(body, /\bEric\b/);
  assert.doesNotMatch(body, /\/code-review|address-coderabbit/);
});

test("the old root-level SKILL.md is gone", () => {
  assert.strictEqual(fs.existsSync(path.join(root, "SKILL.md")), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test test/plugin-manifest.test.js`
Expected: FAIL — `ENOENT` on `.claude-plugin/marketplace.json`.

- [ ] **Step 3: Create the manifests**

`.claude-plugin/marketplace.json`:

```json
{
  "name": "code-review-walkthrough",
  "owner": { "name": "erstaples", "url": "https://github.com/erstaples" },
  "metadata": {
    "description": "Guided, editor-driven walkthroughs of a code diff",
    "version": "0.1.0"
  },
  "plugins": [
    {
      "name": "tour-changes",
      "source": "./",
      "description": "Walks you through a diff one logical change at a time, driving VS Code to open and highlight the code under discussion.",
      "version": "0.1.0",
      "author": { "name": "erstaples", "url": "https://github.com/erstaples" },
      "homepage": "https://github.com/erstaples/claude-code-review-walkthrough",
      "repository": "https://github.com/erstaples/claude-code-review-walkthrough",
      "license": "MIT",
      "keywords": ["code-review", "walkthrough", "diff", "vscode", "tour"],
      "category": "productivity"
    }
  ]
}
```

`.claude-plugin/plugin.json`:

```json
{
  "name": "tour-changes",
  "description": "Walks you through a diff one logical change at a time, driving VS Code to open and highlight the code under discussion.",
  "version": "0.1.0",
  "author": { "name": "erstaples", "url": "https://github.com/erstaples" },
  "homepage": "https://github.com/erstaples/claude-code-review-walkthrough",
  "repository": "https://github.com/erstaples/claude-code-review-walkthrough",
  "license": "MIT",
  "keywords": ["code-review", "walkthrough", "diff", "vscode", "tour"]
}
```

Create `LICENSE` containing the standard MIT license text, copyright `2026 Eric Staples`.

- [ ] **Step 4: Move and generalize the skill**

```bash
mkdir -p skills/tour-changes
git mv SKILL.md skills/tour-changes/SKILL.md 2>/dev/null || mv SKILL.md skills/tour-changes/SKILL.md
```

Then edit `skills/tour-changes/SKILL.md`. Replace the frontmatter with:

```yaml
---
name: tour-changes
description: Interactively walk the reviewer through a diff, one logical change at a time, narrating what changed, why, and how it connects to the rest of the code, flagging anything that looks off against repo conventions along the way. Use when the user says "tour the changes", "walk me through this diff", "guide me through what changed", "/tour-changes", or asks for a guided review of a diff/PR/branch rather than reading it themselves.
---
```

In the body, replace every occurrence of `Eric` with `you` or `the reviewer`
as grammar requires, and delete the sentence pointing at `/code-review` and
`address-coderabbit`. Replace the "Establish the diff range" step's opening
sentence with:

```markdown
Inspect the repository and propose the likely review range rather than asking
the reviewer to formulate one. Common shapes: current branch vs the default
branch, working tree vs `HEAD`, a commit range, or a fetched MR/PR. State the
resolved `git diff` command and proceed unless corrected.
```

- [ ] **Step 5: Run test to verify it passes**

Run: `node --test test/plugin-manifest.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 6: Commit**

```bash
git add .claude-plugin/marketplace.json .claude-plugin/plugin.json skills/tour-changes/SKILL.md LICENSE test/plugin-manifest.test.js
git rm --cached SKILL.md 2>/dev/null || true
git commit -m "feat: package tour-changes as an installable plugin

Moves the skill to skills/tour-changes/SKILL.md so its name matches its
directory, and generalizes the voice from a named individual for
distribution."
```

---

### Task 2: MCP stdio transport [Track B]

The JSON-RPC loop the agent talks to. Pure framing and dispatch, no tools yet.

**Files:**
- Create: `mcp/lib/rpc.js`
- Create: `mcp/test/rpc.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `createDispatcher({ serverInfo, tools, callTool })` returning `{ handle(message) -> Promise<response|null> }`; `parseLines(buffer) -> { messages: object[], rest: string }`

- [ ] **Step 1: Write the failing test**

Create `mcp/test/rpc.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert");
const { createDispatcher, parseLines } = require("../lib/rpc.js");

const tools = [{ name: "tour_status", description: "probe", inputSchema: { type: "object", properties: {} } }];
const make = (callTool = async () => ({ ok: true })) =>
  createDispatcher({ serverInfo: { name: "tour-bridge", version: "0.1.0" }, tools, callTool });

test("parseLines splits complete lines and retains the remainder", () => {
  const { messages, rest } = parseLines('{"a":1}\n{"b":2}\n{"c":');
  assert.deepStrictEqual(messages, [{ a: 1 }, { b: 2 }]);
  assert.strictEqual(rest, '{"c":');
});

test("parseLines ignores blank lines", () => {
  const { messages } = parseLines('{"a":1}\n\n\n');
  assert.deepStrictEqual(messages, [{ a: 1 }]);
});

test("initialize returns protocol version and server info", async () => {
  const res = await make().handle({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} });
  assert.strictEqual(res.id, 1);
  assert.strictEqual(res.result.protocolVersion, "2025-06-18");
  assert.strictEqual(res.result.serverInfo.name, "tour-bridge");
  assert.ok(res.result.capabilities.tools);
});

test("notifications get no response", async () => {
  assert.strictEqual(await make().handle({ jsonrpc: "2.0", method: "notifications/initialized" }), null);
});

test("tools/list returns the registered tools", async () => {
  const res = await make().handle({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  assert.deepStrictEqual(res.result.tools, tools);
});

test("tools/call returns the handler result as text content", async () => {
  const d = make(async (name, args) => ({ echoed: name, args }));
  const res = await d.handle({ jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "tour_status", arguments: { a: 1 } } });
  assert.strictEqual(res.result.isError, undefined);
  assert.deepStrictEqual(JSON.parse(res.result.content[0].text), { echoed: "tour_status", args: { a: 1 } });
});

test("a throwing tool becomes an isError result, not a transport error", async () => {
  const d = make(async () => { throw new Error("bridge unreachable"); });
  const res = await d.handle({ jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "tour_status", arguments: {} } });
  assert.strictEqual(res.result.isError, true);
  assert.match(res.result.content[0].text, /bridge unreachable/);
});

test("unknown methods return JSON-RPC error -32601", async () => {
  const res = await make().handle({ jsonrpc: "2.0", id: 5, method: "nope", params: {} });
  assert.strictEqual(res.error.code, -32601);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test mcp/test/rpc.test.js`
Expected: FAIL — `Cannot find module '../lib/rpc.js'`.

- [ ] **Step 3: Write the implementation**

Create `mcp/lib/rpc.js`:

```javascript
"use strict";

const PROTOCOL_VERSION = "2025-06-18";

function parseLines(buffer) {
  const parts = buffer.split("\n");
  const rest = parts.pop();
  const messages = [];
  for (const line of parts) {
    if (line.trim() === "") continue;
    try {
      messages.push(JSON.parse(line));
    } catch {
      // A malformed line cannot be attributed to a request id, so there is
      // nobody to answer. Dropping it keeps the stream alive.
    }
  }
  return { messages, rest };
}

function createDispatcher({ serverInfo, tools, callTool }) {
  async function handle(message) {
    if (message.id === undefined) return null;
    const reply = (result) => ({ jsonrpc: "2.0", id: message.id, result });

    switch (message.method) {
      case "initialize":
        return reply({
          protocolVersion: PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo,
        });
      case "tools/list":
        return reply({ tools });
      case "tools/call": {
        const { name, arguments: args } = message.params || {};
        try {
          const result = await callTool(name, args || {});
          return reply({ content: [{ type: "text", text: JSON.stringify(result, null, 2) }] });
        } catch (err) {
          return reply({ content: [{ type: "text", text: String(err && err.message ? err.message : err) }], isError: true });
        }
      }
      default:
        return { jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `unknown method: ${message.method}` } };
    }
  }

  return { handle };
}

module.exports = { createDispatcher, parseLines, PROTOCOL_VERSION };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test mcp/test/rpc.test.js`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add mcp/lib/rpc.js mcp/test/rpc.test.js
git commit -m "feat(mcp): add stdio JSON-RPC dispatcher

Implements initialize, tools/list, and tools/call directly rather than
depending on the MCP SDK, because plugin installation never runs
npm install and vendoring node_modules into a published repo is worse."
```

---

### Task 3: Lockfile discovery [Track B]

Resolving which editor window owns the current working directory. Pure logic
over an injected filesystem so every branch is testable.

**Files:**
- Create: `mcp/lib/discovery.js`
- Create: `mcp/test/discovery.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `resolveLock({ dir, cwd, fs, isAlive, protocolVersion }) -> { port, authToken, workspaceFolders, ... }`; throws `Error` with a `.code` of `no_bridge`, `ambiguous_bridge`, or `protocol_mismatch`

- [ ] **Step 1: Write the failing test**

Create `mcp/test/discovery.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert");
const { resolveLock } = require("../lib/discovery.js");

const lock = (over = {}) => ({
  protocolVersion: 1, port: 53411, authToken: "tok", pid: 100,
  ideName: "Visual Studio Code", extensionVersion: "0.1.0",
  workspaceFolders: ["/repo"], ...over,
});

function fakeFs(files) {
  const unlinked = [];
  return {
    unlinked,
    readdirSync: () => Object.keys(files),
    readFileSync: (p) => {
      const name = p.split("/").pop();
      if (!(name in files)) { const e = new Error("ENOENT"); e.code = "ENOENT"; throw e; }
      return JSON.stringify(files[name]);
    },
    unlinkSync: (p) => { unlinked.push(p.split("/").pop()); delete files[p.split("/").pop()]; },
  };
}

const alive = () => true;
const call = (files, cwd, isAlive = alive) =>
  resolveLock({ dir: "/locks", cwd, fs: fakeFs(files), isAlive, protocolVersion: 1 });

test("resolves the single lock whose workspace contains cwd", () => {
  const r = call({ "53411.lock": lock() }, "/repo/internal/retry");
  assert.strictEqual(r.port, 53411);
  assert.strictEqual(r.authToken, "tok");
});

test("cwd equal to the workspace root resolves", () => {
  assert.strictEqual(call({ "53411.lock": lock() }, "/repo").port, 53411);
});

test("a sibling directory sharing a name prefix does not match", () => {
  assert.throws(() => call({ "53411.lock": lock() }, "/repo-other/src"), /no_bridge|not open/i);
});

test("nested workspaces resolve to the longest matching prefix", () => {
  const files = {
    "1.lock": lock({ port: 1, workspaceFolders: ["/repo"] }),
    "2.lock": lock({ port: 2, workspaceFolders: ["/repo/sub"] }),
  };
  assert.strictEqual(call(files, "/repo/sub/pkg").port, 2);
});

test("two equally specific matches are ambiguous and never guessed", () => {
  const files = {
    "1.lock": lock({ port: 1, workspaceFolders: ["/repo"] }),
    "2.lock": lock({ port: 2, workspaceFolders: ["/repo"] }),
  };
  const err = assert.throws(() => call(files, "/repo"));
  assert.strictEqual(err.code, "ambiguous_bridge");
});

test("locks whose process is dead are skipped and unlinked", () => {
  const files = { "1.lock": lock({ port: 1, pid: 999 }), "2.lock": lock({ port: 2, pid: 100 }) };
  const fs = fakeFs(files);
  const r = resolveLock({ dir: "/locks", cwd: "/repo", fs, isAlive: (pid) => pid === 100, protocolVersion: 1 });
  assert.strictEqual(r.port, 2);
  assert.deepStrictEqual(fs.unlinked, ["1.lock"]);
});

test("no locks at all reports no_bridge", () => {
  const err = assert.throws(() => call({}, "/repo"));
  assert.strictEqual(err.code, "no_bridge");
});

test("a protocol version mismatch names both versions", () => {
  const err = assert.throws(() => call({ "1.lock": lock({ protocolVersion: 2 }) }, "/repo"));
  assert.strictEqual(err.code, "protocol_mismatch");
  assert.match(err.message, /2/);
  assert.match(err.message, /1/);
});

test("unparseable lock files are ignored rather than fatal", () => {
  const fs = fakeFs({ "1.lock": lock() });
  const orig = fs.readFileSync;
  fs.readdirSync = () => ["bad.lock", "1.lock"];
  fs.readFileSync = (p) => (p.endsWith("bad.lock") ? "{{{" : orig(p));
  assert.strictEqual(resolveLock({ dir: "/locks", cwd: "/repo", fs, isAlive: alive, protocolVersion: 1 }).port, 53411);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test mcp/test/discovery.test.js`
Expected: FAIL — `Cannot find module '../lib/discovery.js'`.

- [ ] **Step 3: Write the implementation**

Create `mcp/lib/discovery.js`:

```javascript
"use strict";

const nodePath = require("node:path");

function fail(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

function contains(folder, cwd) {
  const a = nodePath.resolve(folder);
  const b = nodePath.resolve(cwd);
  return b === a || b.startsWith(a.endsWith(nodePath.sep) ? a : a + nodePath.sep);
}

function defaultIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

function resolveLock({ dir, cwd, fs = require("node:fs"), isAlive = defaultIsAlive, protocolVersion }) {
  let names;
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith(".lock"));
  } catch {
    names = [];
  }

  const candidates = [];
  let mismatch = null;

  for (const name of names) {
    const full = nodePath.join(dir, name);
    let lock;
    try {
      lock = JSON.parse(fs.readFileSync(full, "utf8"));
    } catch {
      continue;
    }
    if (!isAlive(lock.pid)) {
      try { fs.unlinkSync(full); } catch { /* another process may have won the race */ }
      continue;
    }
    if (lock.protocolVersion !== protocolVersion) {
      mismatch = lock;
      continue;
    }
    for (const folder of lock.workspaceFolders || []) {
      if (contains(folder, cwd)) candidates.push({ lock, depth: nodePath.resolve(folder).length });
    }
  }

  if (candidates.length === 0) {
    if (mismatch) {
      throw fail("protocol_mismatch",
        `tour bridge speaks protocol ${mismatch.protocolVersion}, this plugin speaks ${protocolVersion}. Update whichever is older.`);
    }
    throw fail("no_bridge",
      `no tour bridge is listening for ${cwd}. Install the claude-tour extension and open this folder in VS Code.`);
  }

  const deepest = Math.max(...candidates.map((c) => c.depth));
  const winners = candidates.filter((c) => c.depth === deepest);
  if (winners.length > 1) {
    const folders = winners.map((w) => w.lock.workspaceFolders.join(", ")).join(" | ");
    throw fail("ambiguous_bridge",
      `more than one VS Code window claims ${cwd}: ${folders}. Close one, or run from inside the window you want.`);
  }

  return winners[0].lock;
}

module.exports = { resolveLock, defaultIsAlive };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test mcp/test/discovery.test.js`
Expected: PASS — 9 tests.

- [ ] **Step 5: Commit**

```bash
git add mcp/lib/discovery.js mcp/test/discovery.test.js
git commit -m "feat(mcp): resolve the editor window owning the current directory

Longest-prefix match over lockfile workspace folders, with dead-pid
sweeping. Refuses to guess when two windows claim the same directory --
picking one silently would drive the wrong editor."
```

---

### Task 4: Extension lockfile and HTTP server [Track A]

The extension's front door: a loopback server with bearer auth, and the
lockfile that lets the MCP server find it.

**Files:**
- Create: `editor-extension/package.json`
- Create: `editor-extension/lib/httpserver.js`
- Create: `editor-extension/lib/lockfile.js`
- Create: `editor-extension/test/httpserver.test.js`
- Create: `editor-extension/test/lockfile.test.js`

**Interfaces:**
- Consumes: `ERROR_CODES` from `editor-extension/lib/contract.js` (generated in Task 0)
- Produces: `startServer({ handlers, authToken, protocolVersion }) -> Promise<{ port, close() }>` where `handlers` is `{ "GET /status": async (body, query) => object, ... }`; `writeLock(dir, info) -> path`, `removeLock(path)`

- [ ] **Step 1: Write the failing test**

Create `editor-extension/test/httpserver.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert");
const { startServer } = require("../lib/httpserver.js");

const TOKEN = "secret-token";

async function withServer(handlers, fn) {
  const server = await startServer({ handlers, authToken: TOKEN, protocolVersion: 1 });
  try {
    await fn(`http://127.0.0.1:${server.port}`, server);
  } finally {
    await server.close();
  }
}

const post = (base, path, body, headers = {}) =>
  fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}`, ...headers },
    body: JSON.stringify({ protocolVersion: 1, ...body }),
  });

test("binds loopback only", async () => {
  await withServer({}, async (_base, server) => {
    assert.strictEqual(server.address, "127.0.0.1");
  });
});

test("routes a GET to its handler and wraps the result in ok:true", async () => {
  await withServer({ "GET /status": async () => ({ extensionVersion: "0.1.0" }) }, async (base) => {
    const res = await fetch(`${base}/status?protocolVersion=1`, { headers: { authorization: `Bearer ${TOKEN}` } });
    assert.strictEqual(res.status, 200);
    assert.deepStrictEqual(await res.json(), { ok: true, extensionVersion: "0.1.0" });
  });
});

test("routes a POST body to its handler", async () => {
  await withServer({ "POST /focus": async (body) => ({ got: body.path }) }, async (base) => {
    const res = await post(base, "/focus", { path: "a.go" });
    assert.deepStrictEqual(await res.json(), { ok: true, got: "a.go" });
  });
});

test("a missing or wrong bearer token is unauthorized", async () => {
  await withServer({ "GET /status": async () => ({}) }, async (base) => {
    const bare = await fetch(`${base}/status?protocolVersion=1`);
    assert.strictEqual(bare.status, 401);
    assert.strictEqual((await bare.json()).error.code, "unauthorized");

    const wrong = await fetch(`${base}/status?protocolVersion=1`, { headers: { authorization: "Bearer nope" } });
    assert.strictEqual(wrong.status, 401);
  });
});

test("a request carrying an Origin header is rejected", async () => {
  await withServer({ "GET /status": async () => ({}) }, async (base) => {
    const res = await fetch(`${base}/status?protocolVersion=1`, {
      headers: { authorization: `Bearer ${TOKEN}`, origin: "https://evil.example" },
    });
    assert.strictEqual(res.status, 403);
    assert.strictEqual((await res.json()).error.code, "unauthorized");
  });
});

test("a protocol version mismatch is rejected before the handler runs", async () => {
  let called = false;
  await withServer({ "POST /focus": async () => { called = true; return {}; } }, async (base) => {
    const res = await fetch(`${base}/focus`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}` },
      body: JSON.stringify({ protocolVersion: 99 }),
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual((await res.json()).error.code, "protocol_mismatch");
    assert.strictEqual(called, false);
  });
});

test("an unknown route is bad_request", async () => {
  await withServer({}, async (base) => {
    assert.strictEqual((await post(base, "/nope", {})).status, 400);
  });
});

test("a handler error carrying a code becomes that error code", async () => {
  const boom = Object.assign(new Error("gone"), { code: "file_not_found" });
  await withServer({ "POST /focus": async () => { throw boom; } }, async (base) => {
    const res = await post(base, "/focus", {});
    assert.strictEqual(res.status, 400);
    const body = await res.json();
    assert.strictEqual(body.ok, false);
    assert.strictEqual(body.error.code, "file_not_found");
    assert.strictEqual(body.error.message, "gone");
  });
});

test("an unexpected handler error does not leak as a crash", async () => {
  await withServer({ "POST /focus": async () => { throw new Error("kaboom"); } }, async (base) => {
    const res = await post(base, "/focus", {});
    assert.strictEqual(res.status, 500);
    assert.strictEqual((await res.json()).error.code, "bad_request");
  });
});

test("recognised error codes come from the shared contract, not a local copy", async () => {
  const { ERROR_CODES } = require("../lib/contract.js");
  for (const code of ERROR_CODES) {
    const err = Object.assign(new Error(`synthetic ${code}`), { code });
    await withServer({ "POST /focus": async () => { throw err; } }, async (base) => {
      const body = await (await post(base, "/focus", {})).json();
      assert.strictEqual(body.error.code, code, `${code} was not passed through`);
    });
  }
});
```

`lib/contract.js` is generated by `node contract/sync.js` in Task 0. If it is
missing, run that first rather than hand-writing the constants.

Create `editor-extension/test/lockfile.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { writeLock, removeLock } = require("../lib/lockfile.js");

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "tourlock-"));

test("writes <port>.lock containing the pairing fields", () => {
  const dir = tmp();
  const info = { protocolVersion: 1, port: 53411, authToken: "tok", pid: 7, ideName: "Visual Studio Code", extensionVersion: "0.1.0", workspaceFolders: ["/repo"] };
  const p = writeLock(dir, info);
  assert.strictEqual(path.basename(p), "53411.lock");
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(p, "utf8")), info);
});

test("creates the directory when it does not exist", () => {
  const dir = path.join(tmp(), "nested", "deeper");
  writeLock(dir, { port: 1, authToken: "t", pid: 1, protocolVersion: 1, workspaceFolders: [] });
  assert.ok(fs.existsSync(dir));
});

test("the lock is not readable by other users", () => {
  const p = writeLock(tmp(), { port: 2, authToken: "t", pid: 1, protocolVersion: 1, workspaceFolders: [] });
  assert.strictEqual(fs.statSync(p).mode & 0o077, 0);
});

test("removeLock is idempotent", () => {
  const p = writeLock(tmp(), { port: 3, authToken: "t", pid: 1, protocolVersion: 1, workspaceFolders: [] });
  removeLock(p);
  removeLock(p);
  assert.strictEqual(fs.existsSync(p), false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test editor-extension/test/`
Expected: FAIL — `Cannot find module '../lib/httpserver.js'`.

- [ ] **Step 3: Write the implementation**

Create `editor-extension/package.json`:

```json
{
  "name": "claude-tour",
  "displayName": "Claude Tour",
  "description": "Lets an agentic coding tool drive this editor during a guided diff walkthrough.",
  "version": "0.1.0",
  "publisher": "estaples",
  "license": "MIT",
  "repository": { "type": "git", "url": "git+https://github.com/erstaples/claude-code-review-walkthrough.git" },
  "engines": { "vscode": "^1.90.0" },
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./extension.js"
}
```

Create `editor-extension/lib/lockfile.js`:

```javascript
"use strict";

const fs = require("node:fs");
const path = require("node:path");

function writeLock(dir, info) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${info.port}.lock`);
  fs.writeFileSync(file, JSON.stringify(info), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return file;
}

function removeLock(file) {
  try {
    fs.unlinkSync(file);
  } catch {
    // Already gone, or never written. Deactivation must not throw.
  }
}

module.exports = { writeLock, removeLock };
```

Create `editor-extension/lib/httpserver.js`:

```javascript
"use strict";

const http = require("node:http");
const { ERROR_CODES } = require("./contract.js");

const KNOWN_CODES = new Set(ERROR_CODES);

const STATUS_FOR = { unauthorized: 401, protocol_mismatch: 400 };

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(body) });
  res.end(body);
}

const sendError = (res, status, code, message) => send(res, status, { ok: false, error: { code, message } });

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      // A tour payload is kilobytes. Anything larger is a bug or an attack.
      if (size > 1024 * 1024) { reject(Object.assign(new Error("request too large"), { code: "bad_request" })); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      if (chunks.length === 0) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
      catch { reject(Object.assign(new Error("body is not valid JSON"), { code: "bad_request" })); }
    });
    req.on("error", reject);
  });
}

function startServer({ handlers, authToken, protocolVersion }) {
  const server = http.createServer(async (req, res) => {
    try {
      if (req.headers.origin !== undefined) {
        return sendError(res, 403, "unauthorized", "browser-originated requests are not accepted");
      }
      if (req.headers.authorization !== `Bearer ${authToken}`) {
        return sendError(res, 401, "unauthorized", "missing or invalid bearer token");
      }

      const url = new URL(req.url, "http://127.0.0.1");
      const body = req.method === "GET" ? {} : await readBody(req);
      const claimed = req.method === "GET" ? Number(url.searchParams.get("protocolVersion")) : body.protocolVersion;
      if (claimed !== protocolVersion) {
        return sendError(res, 400, "protocol_mismatch",
          `extension speaks protocol ${protocolVersion}, caller sent ${claimed === undefined || Number.isNaN(claimed) ? "nothing" : claimed}`);
      }

      const handler = handlers[`${req.method} ${url.pathname}`];
      if (!handler) return sendError(res, 400, "bad_request", `no such endpoint: ${req.method} ${url.pathname}`);

      send(res, 200, { ok: true, ...(await handler(body, url.searchParams)) });
    } catch (err) {
      const code = err && KNOWN_CODES.has(err.code) ? err.code : "bad_request";
      const status = STATUS_FOR[code] || (code === "bad_request" && !(err && KNOWN_CODES.has(err.code)) ? 500 : 400);
      sendError(res, status, code, String(err && err.message ? err.message : err));
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      resolve({
        port: addr.port,
        address: addr.address,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

module.exports = { startServer };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test editor-extension/test/`
Expected: PASS — 13 tests.

- [ ] **Step 5: Commit**

```bash
git add editor-extension/package.json editor-extension/lib/httpserver.js editor-extension/lib/lockfile.js editor-extension/test/httpserver.test.js editor-extension/test/lockfile.test.js
git commit -m "feat(extension): add loopback HTTP server and pairing lockfile

Bearer auth on every request, bound to 127.0.0.1, and refuses any request
carrying an Origin header so a page in the browser cannot reach it."
```

---

### Task 5: Decoration intent store [Track A]

The spike found that the diff editor materializes editors lazily, so decoration
cannot be applied eagerly. This is the pure half of that: what to decorate, and
which editor a given intent belongs to. No `vscode` import.

**Files:**
- Create: `editor-extension/lib/decorations.js`
- Create: `editor-extension/test/decorations.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `createIntentStore()` with `setStop({ stopId, files })`, `setFocus({ path, side, startLine, endLine, note })`, `clear()`, `rangesFor(descriptor) -> { stop: Range[], focus: Range|null }`, `pendingPaths() -> string[]`, `markApplied(path)`; `Range` is `{ startLine, endLine }` 1-based inclusive

- [ ] **Step 1: Write the failing test**

Create `editor-extension/test/decorations.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert");
const { createIntentStore } = require("../lib/decorations.js");

const stop = {
  stopId: "s2",
  files: [
    { path: "a.go", ranges: [{ side: "head", startLine: 12, endLine: 48 }, { side: "base", startLine: 3, endLine: 5 }] },
    { path: "b.go", ranges: [{ side: "working", startLine: 1, endLine: 2 }] },
  ],
};

test("returns only the ranges matching the editor's path and side", () => {
  const s = createIntentStore();
  s.setStop(stop);
  assert.deepStrictEqual(s.rangesFor({ path: "a.go", side: "head" }).stop, [{ startLine: 12, endLine: 48 }]);
  assert.deepStrictEqual(s.rangesFor({ path: "a.go", side: "base" }).stop, [{ startLine: 3, endLine: 5 }]);
});

test("an editor not in the stop gets nothing", () => {
  const s = createIntentStore();
  s.setStop(stop);
  assert.deepStrictEqual(s.rangesFor({ path: "z.go", side: "head" }), { stop: [], focus: null });
});

test("focus is returned only for its own path and side", () => {
  const s = createIntentStore();
  s.setStop(stop);
  s.setFocus({ path: "a.go", side: "head", startLine: 31, endLine: 35, note: "capped here" });
  const hit = s.rangesFor({ path: "a.go", side: "head" });
  assert.deepStrictEqual(hit.focus, { startLine: 31, endLine: 35, note: "capped here" });
  assert.strictEqual(s.rangesFor({ path: "a.go", side: "base" }).focus, null);
});

test("a new stop replaces the previous stop and clears focus", () => {
  const s = createIntentStore();
  s.setStop(stop);
  s.setFocus({ path: "a.go", side: "head", startLine: 31, endLine: 35 });
  s.setStop({ stopId: "s3", files: [{ path: "c.go", ranges: [{ side: "head", startLine: 1, endLine: 1 }] }] });
  assert.deepStrictEqual(s.rangesFor({ path: "a.go", side: "head" }), { stop: [], focus: null });
  assert.deepStrictEqual(s.rangesFor({ path: "c.go", side: "head" }).stop, [{ startLine: 1, endLine: 1 }]);
});

test("clear drops everything", () => {
  const s = createIntentStore();
  s.setStop(stop);
  s.clear();
  assert.deepStrictEqual(s.rangesFor({ path: "a.go", side: "head" }), { stop: [], focus: null });
  assert.deepStrictEqual(s.pendingPaths(), []);
});

test("every stop path starts pending and leaves on markApplied", () => {
  const s = createIntentStore();
  s.setStop(stop);
  assert.deepStrictEqual(s.pendingPaths().sort(), ["a.go", "b.go"]);
  s.markApplied("a.go");
  assert.deepStrictEqual(s.pendingPaths(), ["b.go"]);
});

test("markApplied for an unknown path is harmless", () => {
  const s = createIntentStore();
  s.setStop(stop);
  s.markApplied("nope.go");
  assert.deepStrictEqual(s.pendingPaths().sort(), ["a.go", "b.go"]);
});

test("setFocus without a stop still yields the focus range", () => {
  const s = createIntentStore();
  s.setFocus({ path: "a.go", side: "working", startLine: 4, endLine: 4 });
  assert.deepStrictEqual(s.rangesFor({ path: "a.go", side: "working" }).focus, { startLine: 4, endLine: 4, note: undefined });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test editor-extension/test/decorations.test.js`
Expected: FAIL — `Cannot find module '../lib/decorations.js'`.

- [ ] **Step 3: Write the implementation**

Create `editor-extension/lib/decorations.js`:

```javascript
"use strict";

function createIntentStore() {
  let stop = null;
  let focus = null;
  let pending = new Set();

  return {
    setStop(next) {
      stop = next;
      focus = null;
      pending = new Set((next.files || []).map((f) => f.path));
    },
    setFocus(next) {
      focus = next;
    },
    clear() {
      stop = null;
      focus = null;
      pending = new Set();
    },
    currentStopId() {
      return stop ? stop.stopId : null;
    },
    currentFocus() {
      return focus;
    },
    rangesFor({ path, side }) {
      const file = stop && (stop.files || []).find((f) => f.path === path);
      const ranges = file
        ? file.ranges.filter((r) => r.side === side).map((r) => ({ startLine: r.startLine, endLine: r.endLine }))
        : [];
      const hit = focus && focus.path === path && focus.side === side
        ? { startLine: focus.startLine, endLine: focus.endLine, note: focus.note }
        : null;
      return { stop: ranges, focus: hit };
    },
    pendingPaths() {
      return [...pending];
    },
    markApplied(path) {
      pending.delete(path);
    },
  };
}

module.exports = { createIntentStore };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test editor-extension/test/decorations.test.js`
Expected: PASS — 8 tests.

- [ ] **Step 5: Commit**

```bash
git add editor-extension/lib/decorations.js editor-extension/test/decorations.test.js
git commit -m "feat(extension): hold decoration intent separately from editors

The multi-file diff editor materializes editors lazily, so a stop's
highlights cannot all be applied at open time. Intent is stored and
replayed as editors appear."
```

---

### Task 6: Wire the extension to VS Code [Track A]

The only module that imports `vscode`, plus the activation that ties the server,
lockfile, and intent store together. Verified by integration test under xvfb.

**Files:**
- Create: `editor-extension/lib/editor.js`
- Create: `editor-extension/extension.js`
- Create: `editor-extension/test/integration/index.js`
- Create: `editor-extension/test/integration/runner.js`
- Create: `editor-extension/test/integration/suite.test.js`
- Modify: `editor-extension/package.json` (add devDependencies and scripts)

**Interfaces:**
- Consumes: `createIntentStore` (Task 5), `startServer` (Task 4), `writeLock`/`removeLock` (Task 4)
- Produces: endpoints `GET /status`, `POST /stop` (mode `"file"` only), `POST /focus`, `POST /clear`

- [ ] **Step 1: Write the failing test**

Add to `editor-extension/package.json`:

```json
  "devDependencies": {
    "@vscode/test-electron": "^2.4.1",
    "@vscode/vsce": "^3.2.1"
  },
  "scripts": {
    "test:unit": "node --test test/",
    "test:integration": "xvfb-run -a node test/integration/runner.js",
    "package": "vsce package --allow-missing-repository --out claude-tour-0.1.0.vsix"
  }
```

Create `editor-extension/test/integration/runner.js`:

```javascript
const path = require("node:path");
const { runTests } = require("@vscode/test-electron");

runTests({
  extensionDevelopmentPath: path.resolve(__dirname, "../.."),
  extensionTestsPath: path.resolve(__dirname, "./index.js"),
  launchArgs: [path.resolve(__dirname, "../.."), "--disable-extensions", "--disable-gpu"],
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
```

Create `editor-extension/test/integration/index.js`:

```javascript
const path = require("node:path");
const { run: runNodeTests } = require("node:test");

exports.run = function run() {
  return new Promise((resolve, reject) => {
    let failed = 0;
    runNodeTests({ files: [path.resolve(__dirname, "suite.test.js")] })
      .on("test:fail", (e) => { failed++; console.error("FAIL:", e.name, e.details && e.details.error); })
      .on("test:pass", (e) => console.log("ok:", e.name))
      .on("end", () => (failed ? reject(new Error(`${failed} integration test(s) failed`)) : resolve()));
  });
};
```

Create `editor-extension/test/integration/suite.test.js`:

```javascript
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vscode = require("vscode");

let lock;
let base;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

before(async () => {
  await vscode.extensions.getExtension("estaples.claude-tour").activate();
  const dir = path.join(os.homedir(), ".claude", "tour");
  for (let i = 0; i < 40 && !lock; i++) {
    const names = fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => n.endsWith(".lock")) : [];
    const mine = names
      .map((n) => JSON.parse(fs.readFileSync(path.join(dir, n), "utf8")))
      .find((l) => l.pid === process.pid);
    if (mine) lock = mine;
    else await sleep(250);
  }
  assert.ok(lock, "extension did not write a lockfile for this process");
  base = `http://127.0.0.1:${lock.port}`;
});

after(() => {
  const p = path.join(os.homedir(), ".claude", "tour", `${lock.port}.lock`);
  assert.strictEqual(fs.existsSync(p), true, "lock should still exist while active");
});

const call = (method, route, body) =>
  fetch(base + route + (method === "GET" ? "?protocolVersion=1" : ""), {
    method,
    headers: { "content-type": "application/json", authorization: `Bearer ${lock.authToken}` },
    body: method === "GET" ? undefined : JSON.stringify({ protocolVersion: 1, ...body }),
  }).then((r) => r.json());

const fixture = () => vscode.workspace.workspaceFolders[0].uri.fsPath;

test("GET /status reports the workspace this window owns", async () => {
  const res = await call("GET", "/status");
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.protocolVersion, 1);
  assert.strictEqual(res.ideName, "Visual Studio Code");
  assert.deepStrictEqual(res.workspaceFolders, [fixture()]);
});

test("POST /stop in file mode opens the listed files", async () => {
  const res = await call("POST", "/stop", {
    stopId: "s1", index: 1, total: 1, label: "Smoke", type: "implementation", mode: "file",
    files: [{ path: "package.json", ranges: [{ side: "working", startLine: 1, endLine: 3 }] }],
  });
  assert.strictEqual(res.ok, true);
  assert.deepStrictEqual(res.opened, ["package.json"]);
  assert.deepStrictEqual(res.deferred, []);
  const open = vscode.window.visibleTextEditors.map((e) => e.document.uri.fsPath);
  assert.ok(open.some((p) => p.endsWith("package.json")), `package.json not open, saw ${open.join(", ")}`);
});

test("POST /focus succeeds and leaves the reviewer's selection alone", async () => {
  const editor = vscode.window.visibleTextEditors.find((e) => e.document.uri.fsPath.endsWith("package.json"));
  editor.selection = new vscode.Selection(0, 0, 0, 4);
  const res = await call("POST", "/focus", { path: "package.json", side: "working", startLine: 2, endLine: 2, note: "here" });
  assert.strictEqual(res.ok, true);
  await sleep(200);
  assert.strictEqual(editor.selection.start.line, 0);
  assert.strictEqual(editor.selection.end.character, 4);
});

test("a range past the end of the file is range_out_of_bounds", async () => {
  const res = await call("POST", "/focus", { path: "package.json", side: "working", startLine: 99999, endLine: 99999 });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error.code, "range_out_of_bounds");
});

test("an unknown path is file_not_found", async () => {
  const res = await call("POST", "/focus", { path: "does/not/exist.go", side: "working", startLine: 1, endLine: 1 });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error.code, "file_not_found");
});

test("POST /clear succeeds without closing tabs", async () => {
  const before = vscode.window.tabGroups.all.flatMap((g) => g.tabs).length;
  assert.strictEqual((await call("POST", "/clear", {})).ok, true);
  assert.strictEqual(vscode.window.tabGroups.all.flatMap((g) => g.tabs).length, before);
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd editor-extension && npm install && npm run test:integration
```

Expected: FAIL — activation throws because `extension.js` does not exist.

- [ ] **Step 3: Write the implementation**

Create `editor-extension/lib/editor.js`:

```javascript
"use strict";

const path = require("node:path");
const fs = require("node:fs");
const vscode = require("vscode");

const STOP = vscode.window.createTextEditorDecorationType({
  backgroundColor: new vscode.ThemeColor("editor.findMatchHighlightBackground"),
  isWholeLine: true,
  overviewRulerLane: vscode.OverviewRulerLane.Full,
  overviewRulerColor: new vscode.ThemeColor("editorOverviewRuler.findMatchForeground"),
});

const FOCUS = vscode.window.createTextEditorDecorationType({
  backgroundColor: new vscode.ThemeColor("editor.selectionHighlightBackground"),
  border: "1px solid",
  borderColor: new vscode.ThemeColor("editorOverviewRuler.findMatchForeground"),
  isWholeLine: true,
});

function fail(code, message) {
  return Object.assign(new Error(message), { code });
}

function workspaceRoot() {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) throw fail("bad_request", "no workspace folder is open");
  return folders[0].uri.fsPath;
}

function absolute(relPath) {
  const abs = path.join(workspaceRoot(), relPath);
  if (!fs.existsSync(abs)) throw fail("file_not_found", `${relPath} does not exist in this workspace`);
  return abs;
}

// The wire is 1-based inclusive; the VS Code API is 0-based. This is the only
// place that conversion happens.
function toRange(document, startLine, endLine) {
  if (startLine < 1 || endLine < startLine || endLine > document.lineCount) {
    throw fail("range_out_of_bounds", `lines ${startLine}-${endLine} fall outside ${document.lineCount}-line file`);
  }
  return new vscode.Range(startLine - 1, 0, endLine - 1, document.lineAt(endLine - 1).text.length);
}

function describe(editor) {
  const uri = editor.document.uri;
  if (uri.scheme === "file") {
    return { path: path.relative(workspaceRoot(), uri.fsPath), side: "working", ref: null };
  }
  if (uri.scheme === "git") {
    try {
      const q = JSON.parse(uri.query);
      return { path: path.relative(workspaceRoot(), q.path), side: null, ref: q.ref };
    } catch {
      return null;
    }
  }
  return null;
}

async function openFile(relPath) {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(absolute(relPath)));
  await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
  return doc;
}

function applyTo(editor, store, sideResolver) {
  const d = describe(editor);
  if (!d) return false;
  const side = d.side || sideResolver(d.ref);
  if (!side) return false;
  const { stop, focus } = store.rangesFor({ path: d.path, side });

  editor.setDecorations(STOP, stop.map((r) => toRange(editor.document, r.startLine, r.endLine)));
  editor.setDecorations(
    FOCUS,
    focus
      ? [{
          range: toRange(editor.document, focus.startLine, focus.endLine),
          renderOptions: focus.note
            ? { after: { contentText: `  ${focus.note}`, color: new vscode.ThemeColor("editorCodeLens.foreground"), fontStyle: "italic" } }
            : undefined,
        }]
      : []
  );

  if (stop.length > 0 || focus) store.markApplied(d.path);
  return true;
}

function applyAll(store, sideResolver) {
  for (const editor of vscode.window.visibleTextEditors) applyTo(editor, store, sideResolver);
}

function clearAll() {
  for (const editor of vscode.window.visibleTextEditors) {
    editor.setDecorations(STOP, []);
    editor.setDecorations(FOCUS, []);
  }
}

async function reveal(relPath, side, startLine, endLine, sideResolver) {
  const target = vscode.window.visibleTextEditors.find((e) => {
    const d = describe(e);
    return d && d.path === relPath && (d.side || sideResolver(d.ref)) === side;
  });
  if (!target) {
    if (side !== "working") return false;
    const doc = await openFile(relPath);
    const editor = await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
    editor.revealRange(toRange(doc, startLine, endLine), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
    return true;
  }
  target.revealRange(toRange(target.document, startLine, endLine), vscode.TextEditorRevealType.InCenterIfOutsideViewport);
  return true;
}

function validateRange(relPath, startLine, endLine) {
  const abs = absolute(relPath);
  const lines = fs.readFileSync(abs, "utf8").split("\n").length;
  if (startLine < 1 || endLine < startLine || endLine > lines) {
    throw fail("range_out_of_bounds", `lines ${startLine}-${endLine} fall outside ${lines}-line file ${relPath}`);
  }
}

function dispose() {
  STOP.dispose();
  FOCUS.dispose();
}

module.exports = { workspaceRoot, absolute, openFile, applyTo, applyAll, clearAll, reveal, describe, validateRange, dispose };
```

Create `editor-extension/extension.js`:

```javascript
"use strict";

const crypto = require("node:crypto");
const os = require("node:os");
const path = require("node:path");
const vscode = require("vscode");

const { startServer } = require("./lib/httpserver.js");
const { writeLock, removeLock } = require("./lib/lockfile.js");
const { createIntentStore } = require("./lib/decorations.js");
const editor = require("./lib/editor.js");

const PROTOCOL_VERSION = 1;
const LOCK_DIR = path.join(os.homedir(), ".claude", "tour");

let server = null;
let lockPath = null;

// Phase 1 has no pinned refs, so every git: editor is treated as unknown.
// Phase 2 replaces this with a base/head SHA lookup.
const sideResolver = () => null;

async function activate(context) {
  const store = createIntentStore();
  const extensionVersion = vscode.extensions.getExtension("estaples.claude-tour").packageJSON.version;
  const authToken = crypto.randomBytes(32).toString("base64url");

  const handlers = {
    "GET /status": async () => ({
      protocolVersion: PROTOCOL_VERSION,
      extensionVersion,
      ideName: vscode.env.appName,
      workspaceFolders: (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath),
    }),

    "POST /stop": async (body) => {
      if (body.mode !== "file") {
        throw Object.assign(new Error(`unsupported mode: ${body.mode}`), { code: "bad_request" });
      }
      for (const file of body.files || []) {
        for (const r of file.ranges || []) editor.validateRange(file.path, r.startLine, r.endLine);
      }
      store.setStop({ stopId: body.stopId, files: body.files || [] });
      const opened = [];
      for (const file of body.files || []) {
        await editor.openFile(file.path);
        opened.push(file.path);
      }
      editor.applyAll(store, sideResolver);
      return { opened, deferred: store.pendingPaths() };
    },

    "POST /focus": async (body) => {
      editor.validateRange(body.path, body.startLine, body.endLine);
      store.setFocus(body);
      const revealed = await editor.reveal(body.path, body.side, body.startLine, body.endLine, sideResolver);
      editor.applyAll(store, sideResolver);
      return { revealed };
    },

    "POST /clear": async () => {
      store.clear();
      editor.clearAll();
      return {};
    },
  };

  server = await startServer({ handlers, authToken, protocolVersion: PROTOCOL_VERSION });
  lockPath = writeLock(LOCK_DIR, {
    protocolVersion: PROTOCOL_VERSION,
    port: server.port,
    authToken,
    pid: process.pid,
    ideName: vscode.env.appName,
    extensionVersion,
    workspaceFolders: (vscode.workspace.workspaceFolders || []).map((f) => f.uri.fsPath),
  });

  context.subscriptions.push(
    vscode.window.onDidChangeVisibleTextEditors(() => editor.applyAll(store, sideResolver)),
    { dispose: () => { removeLock(lockPath); if (server) server.close(); editor.dispose(); } }
  );
}

function deactivate() {
  if (lockPath) removeLock(lockPath);
  if (server) return server.close();
}

module.exports = { activate, deactivate };
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd editor-extension && npm run test:unit && npm run test:integration
```

Expected: unit PASS (21 tests), integration PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add editor-extension/extension.js editor-extension/lib/editor.js editor-extension/test/integration editor-extension/package.json editor-extension/package-lock.json
git commit -m "feat(extension): open, reveal, and decorate on request

Isolates every vscode API call in lib/editor.js so the rest of the
extension is testable without a display. Focus deliberately does not set
editor.selection -- that belongs to the reviewer and GET /context will
read it."
```

---

### Task 7: MCP tools and server entry point [Track B]

Connects the MCP server to the bridge and registers it with the plugin. Tested
entirely against a stub bridge and the Task 0 fixtures — Track A's extension
does not need to exist.

**Files:**
- Create: `mcp/lib/bridge.js`
- Create: `mcp/lib/tools.js`
- Create: `mcp/server.js`
- Create: `mcp/test/tools.test.js`
- Create: `.mcp.json`

**Interfaces:**
- Consumes: `resolveLock` (Task 3), `createDispatcher`/`parseLines` (Task 2), `ROUTES`/`PROTOCOL_VERSION` (Task 0)
- Produces: MCP tools `tour_status`, `tour_stop`, `tour_focus`, `tour_clear`

- [ ] **Step 1: Write the failing test**

Create `mcp/test/tools.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const { TOOLS, createCallTool } = require("../lib/tools.js");

function stubBridge(routes) {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {};
      seen.push({ method: req.method, url: req.url, auth: req.headers.authorization, body });
      const [status, payload] = routes[`${req.method} ${req.url.split("?")[0]}`] || [400, { ok: false, error: { code: "bad_request", message: "no route" } }];
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(payload));
    });
  });
  return new Promise((resolve) =>
    server.listen(0, "127.0.0.1", () => resolve({ port: server.address().port, seen, close: () => server.close() }))
  );
}

test("the declared tools match the documented surface", () => {
  assert.deepStrictEqual(TOOLS.map((t) => t.name).sort(), ["tour_clear", "tour_focus", "tour_status", "tour_stop"]);
  for (const tool of TOOLS) {
    assert.ok(tool.description, `${tool.name} has no description`);
    assert.strictEqual(tool.inputSchema.type, "object");
  }
});

test("tour_status GETs /status with the lock's bearer token", async () => {
  const b = await stubBridge({ "GET /status": [200, { ok: true, extensionVersion: "0.1.0" }] });
  const callTool = createCallTool({ resolveLock: () => ({ port: b.port, authToken: "tok" }) });
  assert.deepStrictEqual(await callTool("tour_status", {}), { ok: true, extensionVersion: "0.1.0" });
  assert.strictEqual(b.seen[0].auth, "Bearer tok");
  assert.match(b.seen[0].url, /protocolVersion=1/);
  b.close();
});

test("tour_stop POSTs its arguments with the protocol version attached", async () => {
  const b = await stubBridge({ "POST /stop": [200, { ok: true, opened: ["a.go"], deferred: [] }] });
  const callTool = createCallTool({ resolveLock: () => ({ port: b.port, authToken: "tok" }) });
  const args = { stopId: "s1", label: "L", type: "implementation", mode: "file", files: [{ path: "a.go", ranges: [{ side: "working", startLine: 1, endLine: 2 }] }] };
  await callTool("tour_stop", args);
  assert.strictEqual(b.seen[0].body.protocolVersion, 1);
  assert.strictEqual(b.seen[0].body.stopId, "s1");
  b.close();
});

test("a bridge error becomes a thrown error carrying the code", async () => {
  const b = await stubBridge({ "POST /focus": [400, { ok: false, error: { code: "range_out_of_bounds", message: "too far" } }] });
  const callTool = createCallTool({ resolveLock: () => ({ port: b.port, authToken: "tok" }) });
  const err = await assert.rejects(() => callTool("tour_focus", { path: "a.go", side: "working", startLine: 9, endLine: 9 }));
  b.close();
});

test("a discovery failure surfaces its guidance verbatim", async () => {
  const callTool = createCallTool({
    resolveLock: () => { throw Object.assign(new Error("no tour bridge is listening for /repo"), { code: "no_bridge" }); },
  });
  await assert.rejects(() => callTool("tour_status", {}), /no tour bridge is listening/);
});

test("an unknown tool name is rejected", async () => {
  const callTool = createCallTool({ resolveLock: () => ({ port: 1, authToken: "t" }) });
  await assert.rejects(() => callTool("tour_nope", {}), /unknown tool/);
});

test("every phase-1 tool consumes its contract response fixtures", async () => {
  const fixtures = require("../../contract/fixtures.json");
  const { ROUTES } = require("../../contract/protocol.js");
  for (const name of ["tour_status", "tour_stop", "tour_focus", "tour_clear"]) {
    for (const response of fixtures[name].responses) {
      const route = ROUTES[name];
      const b = await stubBridge({ [`${route.method} ${route.path}`]: [response.ok ? 200 : 400, response] });
      const callTool = createCallTool({ resolveLock: () => ({ port: b.port, authToken: "tok" }) });
      const args = fixtures[name].requests[0].body;
      if (response.ok) {
        assert.deepStrictEqual(await callTool(name, args), response, `${name} mangled an ok response`);
      } else {
        await assert.rejects(
          () => callTool(name, args),
          (err) => err.code === response.error.code && err.message === response.error.message,
          `${name} did not surface ${response.error.code} with its message intact`
        );
      }
      b.close();
    }
  }
});
```

That last test is the contract half of this track: it proves the tool layer
surfaces every documented response without the extension existing.

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test mcp/test/tools.test.js`
Expected: FAIL — `Cannot find module '../lib/tools.js'`.

- [ ] **Step 3: Write the implementation**

Create `mcp/lib/bridge.js`:

```javascript
"use strict";

const PROTOCOL_VERSION = 1;

async function request(lock, method, route, body) {
  const url = `http://127.0.0.1:${lock.port}${route}` + (method === "GET" ? `?protocolVersion=${PROTOCOL_VERSION}` : "");
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: { "content-type": "application/json", authorization: `Bearer ${lock.authToken}` },
      body: method === "GET" ? undefined : JSON.stringify({ protocolVersion: PROTOCOL_VERSION, ...body }),
    });
  } catch (err) {
    throw Object.assign(new Error(`tour bridge at port ${lock.port} did not answer: ${err.message}`), { code: "no_bridge" });
  }

  const payload = await res.json().catch(() => ({ ok: false, error: { code: "bad_request", message: `non-JSON response (HTTP ${res.status})` } }));
  if (!payload.ok) {
    const { code, message } = payload.error || {};
    throw Object.assign(new Error(message || `bridge returned HTTP ${res.status}`), { code: code || "bad_request" });
  }
  return payload;
}

module.exports = { request, PROTOCOL_VERSION };
```

Create `mcp/lib/tools.js`:

```javascript
"use strict";

const { request } = require("./bridge.js");

const RANGE = {
  type: "object",
  required: ["side", "startLine", "endLine"],
  properties: {
    side: { type: "string", enum: ["base", "head", "working"], description: "Which side of the diff these line numbers belong to." },
    startLine: { type: "integer", description: "1-based inclusive." },
    endLine: { type: "integer", description: "1-based inclusive." },
  },
};

const TOOLS = [
  {
    name: "tour_status",
    description: "Preflight the editor bridge. Returns the extension version and the workspace folders of the VS Code window that owns the current directory. Call this before starting a tour; if it fails, run the tour as text and links instead.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "tour_stop",
    description: "Open a tour stop's files and highlight its ranges. Replaces the previous stop's highlights. Call once per stop, before narrating it.",
    inputSchema: {
      type: "object",
      required: ["stopId", "label", "type", "mode", "files"],
      properties: {
        stopId: { type: "string" },
        index: { type: "integer", description: "1-based position of this stop in the tour." },
        total: { type: "integer" },
        label: { type: "string" },
        type: { type: "string", enum: ["context", "implementation", "risk", "evidence", "limitation"] },
        mode: { type: "string", enum: ["file"], description: "Phase 1 supports file mode only." },
        files: {
          type: "array",
          items: {
            type: "object",
            required: ["path", "ranges"],
            properties: {
              path: { type: "string", description: "Repository-relative." },
              ranges: { type: "array", items: RANGE },
            },
          },
        },
      },
    },
  },
  {
    name: "tour_focus",
    description: "Point at one range inside the current stop. Reveals it and highlights it more strongly than the surrounding stop. Use this when zooming into a specific construct mid-narration rather than calling tour_stop again.",
    inputSchema: {
      type: "object",
      required: ["path", "side", "startLine", "endLine"],
      properties: {
        path: { type: "string", description: "Repository-relative." },
        side: RANGE.properties.side,
        startLine: { type: "integer" },
        endLine: { type: "integer" },
        note: { type: "string", description: "Short inline label rendered at the end of the range." },
      },
    },
  },
  {
    name: "tour_clear",
    description: "Remove all tour highlights. Call at the end of a tour. Does not close tabs.",
    inputSchema: { type: "object", properties: {} },
  },
];

const ROUTES = {
  tour_status: ["GET", "/status"],
  tour_stop: ["POST", "/stop"],
  tour_focus: ["POST", "/focus"],
  tour_clear: ["POST", "/clear"],
};

function createCallTool({ resolveLock }) {
  return async function callTool(name, args) {
    const route = ROUTES[name];
    if (!route) throw new Error(`unknown tool: ${name}`);
    const lock = resolveLock();
    return request(lock, route[0], route[1], args);
  };
}

module.exports = { TOOLS, ROUTES, createCallTool };
```

Create `mcp/server.js`:

```javascript
#!/usr/bin/env node
"use strict";

const os = require("node:os");
const path = require("node:path");

const { createDispatcher, parseLines } = require("./lib/rpc.js");
const { resolveLock } = require("./lib/discovery.js");
const { TOOLS, createCallTool } = require("./lib/tools.js");
const { PROTOCOL_VERSION } = require("./lib/bridge.js");

const LOCK_DIR = path.join(os.homedir(), ".claude", "tour");

const dispatcher = createDispatcher({
  serverInfo: { name: "tour-bridge", version: "0.1.0" },
  tools: TOOLS,
  callTool: createCallTool({
    resolveLock: () => resolveLock({ dir: LOCK_DIR, cwd: process.cwd(), protocolVersion: PROTOCOL_VERSION }),
  }),
});

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  const { messages, rest } = parseLines(buffer + chunk);
  buffer = rest;
  for (const message of messages) {
    const response = await dispatcher.handle(message);
    if (response) process.stdout.write(JSON.stringify(response) + "\n");
  }
});
process.stdin.on("end", () => process.exit(0));
```

Create `.mcp.json`:

```json
{
  "mcpServers": {
    "tour-bridge": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/mcp/server.js"]
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
node --test mcp/test/ test/contract.test.js
```

Expected: PASS — all `mcp/test` suites plus the contract suite.

- [ ] **Step 5: Commit**

```bash
git add mcp/server.js mcp/lib/bridge.js mcp/lib/tools.js mcp/test/tools.test.js .mcp.json
git commit -m "feat(mcp): expose the phase-1 tool surface

Tested against a stub bridge and the shared contract fixtures, so this
track does not wait on the extension."
```

---

### Task 7b: Installer and driven-tour skill guidance [Track C]

**Files:**
- Create: `install.sh`
- Modify: `skills/tour-changes/SKILL.md`

**Interfaces:**
- Consumes: tool names `tour_status`, `tour_stop`, `tour_focus`, `tour_clear` (Task 0 `ROUTES`)
- Produces: nothing downstream

- [ ] **Step 1: Write the installer**

Create `install.sh` (`chmod +x` it):

```bash
#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
vsix="$root/editor-extension/claude-tour-0.1.0.vsix"

for tool in node code; do
  command -v "$tool" >/dev/null || { echo "error: $tool is not on PATH" >&2; exit 1; }
done

if [ ! -f "$vsix" ]; then
  echo "building the extension..."
  (cd "$root/editor-extension" && npm install --silent && npm run package --silent)
fi

echo "installing the VS Code extension..."
code --install-extension "$vsix" --force

if command -v codex >/dev/null; then
  echo "checking the Codex MCP registration..."
  if codex mcp get tour-bridge 2>/dev/null | grep -q 'CLAUDE_PLUGIN_ROOT'; then
    echo "  Codex did not expand \${CLAUDE_PLUGIN_ROOT}; re-registering with an absolute path"
    codex mcp remove tour-bridge >/dev/null 2>&1 || true
    codex mcp add tour-bridge -- node "$root/mcp/server.js"
  fi
fi

cat <<EOF

Extension installed. Reload the VS Code window so it activates:
  Command Palette -> "Developer: Reload Window"

Then install the plugin for your agent:
  Claude Code:  /plugin marketplace add $root
                /plugin install tour-changes@code-review-walkthrough
  Codex CLI:    codex plugin marketplace add $root
                codex plugin add tour-changes@code-review-walkthrough
EOF
```

- [ ] **Step 2: Verify the installer fails cleanly without its inputs**

```bash
bash -n install.sh && PATH=/usr/bin:/bin ./install.sh; echo "exit=$?"
```

Expected: a one-line error naming the missing tool, exit 1 — not a stack trace
or a partial install.

- [ ] **Step 3: Teach the skill to drive the editor**

Edit `skills/tour-changes/SKILL.md`. Insert after the "Establish the diff range"
step:

```markdown
### 1b. Preflight the editor bridge

Call `tour_status`. On success, run a **driven tour**: the editor opens and
highlights code as you narrate. On failure, say in one line which capabilities
are unavailable and how to install the extension, then run a **text tour** —
identical narration, `path:line` citations only. Never block the tour on the
bridge.
```

Replace the "Group into stops" closing paragraph with:

```markdown
Build the full stop list before narrating, then present a compact agenda: the
problem and intended outcome, each stop's label and type, which stops are
foundational versus supporting, and which carry risk or uncertainty. Defer each
stop's detail until you reach it.

Stop types: `context`, `implementation`, `risk`, `evidence`, `limitation`.
```

In the "Narrate one stop at a time" step, insert before the "For each stop,
cover" list:

```markdown
In a driven tour, call `tour_stop` with the stop's files and ranges before
narrating, then `tour_focus` as you zoom into a specific construct. Use
`side: "working"` for ranges in the working tree. Do not call `tour_stop` again
mid-stop — that is what `tour_focus` is for.
```

Replace the citation constraint with:

```markdown
- In a driven tour, cite `<path>:<line>` for stop headers, jumps to code outside
  the current stop, answers worth revisiting, and the close-out. The editor
  carries moment-to-moment pointing. In a text tour, cite every file, function,
  type, or construct you name, since citations are the only navigation
  available.
```

In the "Close out" step, add:

```markdown
End a driven tour with `tour_clear`.
```

- [ ] **Step 4: Commit**

```bash
git add install.sh skills/tour-changes/SKILL.md
git commit -m "feat: add installer and driven-tour skill guidance

Falls back to text and links when the bridge is unreachable rather than
refusing to run."
```

---

### Task G1: Phase 1 gate — first usable release [Gate]

Runs after Tasks 1–7b are all complete. Merges the three track branches and
proves the whole thing works end to end.

**Files:**
- Modify: none (integration only)

- [ ] **Step 1: Merge the track branches**

```bash
git checkout main
git merge --no-ff track-a/phase-1 track-b/phase-1 track-c/phase-1
```

Expected: no conflicts. A conflict means a track edited outside its lane —
fix the offending commit rather than resolving the merge.

- [ ] **Step 2: Run every suite**

```bash
node --test test/ mcp/test/
cd editor-extension && npm run test:unit && npm run test:integration && cd ..
```

Expected: all PASS.

- [ ] **Step 3: Install and drive it by hand**

```bash
./install.sh
```

Reload the VS Code window. In a repository with uncommitted changes, ask your
agent to "tour the working tree". Confirm: an agenda appears before the first
stop; files open and highlight as it narrates; `tour_focus` moves the highlight
without moving your cursor; the tour ends with highlights cleared.

Then quit VS Code and ask for a tour again. Confirm it falls back to a text
tour with a one-line explanation rather than failing.

- [ ] **Step 4: Tag the first usable release**

```bash
git tag -a v0.1.0 -m "Phase 1: driven tours in file mode"
```

---

# Phase 2 — Real diffs

Adds pinned commit identity, side-aware coordinates, and the native multi-file
diff editor. At the end of this phase a tour of a branch renders as a real
side-by-side diff rather than working-tree files.

Track A runs Tasks 8, 9, 10 in sequence. Track B runs Task 10b. Track C runs
Task 11. All three start from the `v0.1.0` commit.

---

### Task 8: Git plumbing [Track A]

**Files:**
- Create: `editor-extension/lib/git.js`
- Create: `editor-extension/test/git.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `revParse(cwd, ref) -> Promise<string>`; `changedFiles(cwd, base, head) -> Promise<Array<{status, sourcePath, targetPath}>>`; `gitUriQuery(absPath, ref) -> string`

- [ ] **Step 1: Write the failing test**

Create `editor-extension/test/git.test.js`:

```javascript
const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");
const { revParse, changedFiles, gitUriQuery } = require("../lib/git.js");

let repo;
let baseSha;
let headSha;

const git = (...args) => cp.execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();

before(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "tourgit-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "T");
  fs.writeFileSync(path.join(repo, "keep.txt"), "one\ntwo\n");
  fs.writeFileSync(path.join(repo, "gone.txt"), "bye\n");
  git("add", "-A");
  git("commit", "-qm", "base");
  baseSha = git("rev-parse", "HEAD");
  fs.writeFileSync(path.join(repo, "keep.txt"), "one\ntwo\nthree\n");
  fs.unlinkSync(path.join(repo, "gone.txt"));
  fs.writeFileSync(path.join(repo, "new.txt"), "hello\n");
  git("add", "-A");
  git("commit", "-qm", "head");
  headSha = git("rev-parse", "HEAD");
});

after(() => fs.rmSync(repo, { recursive: true, force: true }));

test("revParse resolves a name to a full sha", async () => {
  assert.strictEqual(await revParse(repo, "HEAD"), headSha);
  assert.match(await revParse(repo, "main"), /^[0-9a-f]{40}$/);
});

test("revParse on an unknown ref fails with git_failed", async () => {
  await assert.rejects(() => revParse(repo, "no-such-ref"), (err) => err.code === "git_failed");
});

test("changedFiles classifies added, deleted, and modified", async () => {
  const changes = await changedFiles(repo, baseSha, headSha);
  const byPath = Object.fromEntries(changes.map((c) => [c.targetPath || c.sourcePath, c.status]));
  assert.strictEqual(byPath["keep.txt"], "M");
  assert.strictEqual(byPath["new.txt"], "A");
  assert.strictEqual(byPath["gone.txt"], "D");
});

test("changedFiles reports renames with both paths", async () => {
  git("mv", "keep.txt", "renamed.txt");
  git("commit", "-qm", "rename");
  const changes = await changedFiles(repo, headSha, git("rev-parse", "HEAD"));
  const rename = changes.find((c) => c.status === "R");
  assert.strictEqual(rename.sourcePath, "keep.txt");
  assert.strictEqual(rename.targetPath, "renamed.txt");
});

test("gitUriQuery encodes the path and ref the git scheme expects", () => {
  assert.deepStrictEqual(JSON.parse(gitUriQuery("/repo/a.go", "abc123")), { path: "/repo/a.go", ref: "abc123" });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test editor-extension/test/git.test.js`
Expected: FAIL — `Cannot find module '../lib/git.js'`.

- [ ] **Step 3: Write the implementation**

Create `editor-extension/lib/git.js`:

```javascript
"use strict";

const cp = require("node:child_process");
const util = require("node:util");
const execFile = util.promisify(cp.execFile);

async function run(cwd, args) {
  try {
    const { stdout } = await execFile("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    throw Object.assign(new Error(`git ${args.join(" ")} failed: ${String(err.stderr || err.message).trim()}`), { code: "git_failed" });
  }
}

async function revParse(cwd, ref) {
  return (await run(cwd, ["rev-parse", "--verify", `${ref}^{commit}`])).trim();
}

async function changedFiles(cwd, base, head) {
  const stdout = await run(cwd, ["diff", "--name-status", "-z", "--find-renames", base, head, "--"]);
  const fields = stdout.split("\0");
  const changes = [];
  for (let i = 0; i < fields.length && fields[i] !== ""; ) {
    const status = fields[i++];
    if (status.startsWith("R") || status.startsWith("C")) {
      changes.push({ status: status[0], sourcePath: fields[i++], targetPath: fields[i++] });
    } else {
      const p = fields[i++];
      changes.push({ status: status[0], sourcePath: p, targetPath: p });
    }
  }
  return changes;
}

const gitUriQuery = (absPath, ref) => JSON.stringify({ path: absPath, ref });

module.exports = { revParse, changedFiles, gitUriQuery };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test editor-extension/test/git.test.js`
Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add editor-extension/lib/git.js editor-extension/test/git.test.js
git commit -m "feat(extension): add git plumbing for diff-mode stops"
```

---

### Task 9: Diff identity enforcement [Track A]

**Files:**
- Create: `editor-extension/lib/identity.js`
- Create: `editor-extension/test/identity.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `createIdentity()` with `check({base, head})` throwing `diff_identity_mismatch`, `sideFor(ref) -> "base"|"head"|"working"|null`, `current()`, `reset()`

- [ ] **Step 1: Write the failing test**

Create `editor-extension/test/identity.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert");
const { createIdentity } = require("../lib/identity.js");

const base = { sha: "aaaa111", name: "main" };
const head = { sha: "bbbb222", name: "HEAD" };

test("the first stop establishes the identity", () => {
  const id = createIdentity();
  id.check({ base, head });
  assert.deepStrictEqual(id.current(), { base, head });
});

test("a matching later stop is accepted", () => {
  const id = createIdentity();
  id.check({ base, head });
  id.check({ base: { sha: "aaaa111", name: "whatever" }, head: { sha: "bbbb222", name: "other" } });
  assert.strictEqual(id.current().base.sha, "aaaa111");
});

test("a different sha is rejected with diff_identity_mismatch", () => {
  const id = createIdentity();
  id.check({ base, head });
  const err = assert.throws(() => id.check({ base, head: { sha: "cccc333", name: "HEAD" } }));
  assert.strictEqual(err.code, "diff_identity_mismatch");
  assert.match(err.message, /bbbb222/);
  assert.match(err.message, /cccc333/);
});

test("sideFor maps a ref back to its side", () => {
  const id = createIdentity();
  id.check({ base, head });
  assert.strictEqual(id.sideFor("aaaa111"), "base");
  assert.strictEqual(id.sideFor("bbbb222"), "head");
  assert.strictEqual(id.sideFor("dddd444"), null);
});

test("a WORKTREE head maps to the working side", () => {
  const id = createIdentity();
  id.check({ base, head: { sha: "WORKTREE", name: "working tree" } });
  assert.strictEqual(id.sideFor("WORKTREE"), "working");
});

test("reset allows a new tour in the same window", () => {
  const id = createIdentity();
  id.check({ base, head });
  id.reset();
  id.check({ base, head: { sha: "cccc333", name: "HEAD" } });
  assert.strictEqual(id.current().head.sha, "cccc333");
});

test("sideFor before any identity is established is null", () => {
  assert.strictEqual(createIdentity().sideFor("aaaa111"), null);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test editor-extension/test/identity.test.js`
Expected: FAIL — `Cannot find module '../lib/identity.js'`.

- [ ] **Step 3: Write the implementation**

Create `editor-extension/lib/identity.js`:

```javascript
"use strict";

function createIdentity() {
  let pinned = null;

  return {
    current: () => pinned,
    reset() {
      pinned = null;
    },
    check({ base, head }) {
      if (!pinned) {
        pinned = { base, head };
        return pinned;
      }
      if (pinned.base.sha !== base.sha || pinned.head.sha !== head.sha) {
        throw Object.assign(
          new Error(`this tour is pinned to ${pinned.base.sha}..${pinned.head.sha}; got ${base.sha}..${head.sha}. Call tour_clear to start a new tour.`),
          { code: "diff_identity_mismatch" }
        );
      }
      return pinned;
    },
    sideFor(ref) {
      if (!pinned) return null;
      if (ref === pinned.base.sha) return "base";
      if (ref === pinned.head.sha) return pinned.head.sha === "WORKTREE" ? "working" : "head";
      return null;
    },
  };
}

module.exports = { createIdentity };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test editor-extension/test/identity.test.js`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add editor-extension/lib/identity.js editor-extension/test/identity.test.js
git commit -m "feat(extension): pin a tour to an immutable base..head pair

A commit or checkout mid-tour cannot silently repoint a stop, and a ref
maps back to its side so diff-editor editors can be identified."
```

---

### Task 10: Multi-file diff mode with reactive decoration [Track A]

**Files:**
- Modify: `editor-extension/lib/editor.js`
- Modify: `editor-extension/extension.js`
- Modify: `editor-extension/test/integration/suite.test.js`

**Interfaces:**
- Consumes: `revParse`/`changedFiles`/`gitUriQuery` (Task 8), `createIdentity` (Task 9)
- Produces: `POST /stop` accepting `mode: "diff"`, returning `{ opened, deferred }`

- [ ] **Step 1: Write the failing test**

Append to `editor-extension/test/integration/suite.test.js`:

```javascript
const cp = require("node:child_process");
const gitIn = (...args) => cp.execFileSync("git", args, { cwd: fixture(), encoding: "utf8" }).trim();

test("POST /stop in diff mode opens the multi-file diff editor", async () => {
  const head = gitIn("rev-parse", "HEAD");
  const base = gitIn("rev-parse", "HEAD~1");
  const changed = gitIn("diff", "--name-only", base, head).split("\n").filter(Boolean);
  assert.ok(changed.length > 0, "fixture repo needs at least one changed file");

  await call("POST", "/clear", {});
  const res = await call("POST", "/stop", {
    stopId: "d1", index: 1, total: 1, label: "Diff smoke", type: "implementation", mode: "diff",
    base: { sha: base, name: "HEAD~1" }, head: { sha: head, name: "HEAD" },
    files: changed.map((p) => ({ path: p, ranges: [{ side: "head", startLine: 1, endLine: 1 }] })),
  });
  assert.strictEqual(res.ok, true);
  await sleep(1500);

  const multi = vscode.window.tabGroups.all
    .flatMap((g) => g.tabs)
    .find((t) => t.input instanceof vscode.TabInputTextMultiDiff);
  assert.ok(multi, "no multi-diff tab opened");
  assert.strictEqual(multi.input.textDiffs.length, changed.length);
});

test("a second stop with a different base is diff_identity_mismatch", async () => {
  const head = gitIn("rev-parse", "HEAD");
  const res = await call("POST", "/stop", {
    stopId: "d2", index: 2, total: 2, label: "Wrong identity", type: "implementation", mode: "diff",
    base: { sha: "0".repeat(40), name: "bogus" }, head: { sha: head, name: "HEAD" },
    files: [],
  });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error.code, "diff_identity_mismatch");
});

test("decorations reach diff-editor editors as they materialize", async () => {
  await sleep(500);
  const gitEditors = vscode.window.visibleTextEditors.filter((e) => e.document.uri.scheme === "git");
  assert.ok(gitEditors.length > 0, "expected at least one git: editor from the diff view");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd editor-extension && npm run test:integration`
Expected: FAIL — `unsupported mode: diff`.

- [ ] **Step 3: Write the implementation**

Add to `editor-extension/lib/editor.js`, before `module.exports`:

```javascript
async function openMultiDiff(title, files, base, head) {
  const { changedFiles, gitUriQuery } = require("./git.js");
  const root = workspaceRoot();
  const wanted = new Set(files.map((f) => f.path));
  const changes = (await changedFiles(root, base.sha, head.sha)).filter(
    (c) => wanted.has(c.targetPath) || wanted.has(c.sourcePath)
  );

  const gitUri = (rel, ref) => {
    const abs = path.join(root, rel);
    return vscode.Uri.file(abs).with({ scheme: "git", query: gitUriQuery(abs, ref) });
  };

  const resources = changes.map((c) => {
    const label = vscode.Uri.file(path.join(root, c.status === "D" ? c.sourcePath : c.targetPath));
    if (c.status === "A") return [label, undefined, gitUri(c.targetPath, head.sha)];
    if (c.status === "D") return [label, gitUri(c.sourcePath, base.sha), undefined];
    return [label, gitUri(c.sourcePath, base.sha), gitUri(c.targetPath, head.sha)];
  });

  if (resources.length === 0) throw fail("bad_request", `none of the requested files differ between ${base.sha} and ${head.sha}`);
  await vscode.commands.executeCommand("vscode.changes", title, resources);
  return changes.map((c) => c.targetPath || c.sourcePath);
}
```

Add `openMultiDiff` to the `module.exports` list in `lib/editor.js`.

In `editor-extension/extension.js`, add to the requires:

```javascript
const { createIdentity } = require("./lib/identity.js");
```

Replace the `sideResolver` constant with, inside `activate`:

```javascript
  const identity = createIdentity();
  const sideResolver = (ref) => identity.sideFor(ref);
```

Replace the `POST /stop` handler:

```javascript
    "POST /stop": async (body) => {
      if (body.mode === "diff") {
        if (!body.base || !body.head) throw Object.assign(new Error("diff mode requires base and head"), { code: "bad_request" });
        identity.check({ base: body.base, head: body.head });
        store.setStop({ stopId: body.stopId, files: body.files || [] });
        const opened = await editor.openMultiDiff(body.label, body.files || [], body.base, body.head);
        editor.applyAll(store, sideResolver);
        return { opened, deferred: store.pendingPaths() };
      }

      if (body.mode !== "file") {
        throw Object.assign(new Error(`unsupported mode: ${body.mode}`), { code: "bad_request" });
      }
      if (body.base && body.head) identity.check({ base: body.base, head: body.head });
      for (const file of body.files || []) {
        for (const r of file.ranges || []) editor.validateRange(file.path, r.startLine, r.endLine);
      }
      store.setStop({ stopId: body.stopId, files: body.files || [] });
      const opened = [];
      for (const file of body.files || []) {
        await editor.openFile(file.path);
        opened.push(file.path);
      }
      editor.applyAll(store, sideResolver);
      return { opened, deferred: store.pendingPaths() };
    },
```

In the `POST /clear` handler, add `identity.reset();` before `store.clear();`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd editor-extension && npm run test:unit && npm run test:integration
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add editor-extension/lib/editor.js editor-extension/extension.js editor-extension/test/integration/suite.test.js
git commit -m "feat(extension): render stops in the multi-file diff editor

Decoration is applied reactively via onDidChangeVisibleTextEditors,
because the diff editor materializes each file's editors only when the
reviewer scrolls to them."
```

---

### Task 10b: Diff-mode tool schema [Track B]

**Files:**
- Modify: `mcp/lib/tools.js`
- Modify: `mcp/test/tools.test.js`

**Interfaces:**
- Consumes: `MODES`, fixtures for `tour_stop` (Task 0)
- Produces: `tour_stop` accepting `mode: "diff"` with `base`/`head`

- [ ] **Step 1: Write the failing test**

Append to `mcp/test/tools.test.js`:

```javascript
test("tour_stop accepts both modes and requires pinned refs", () => {
  const stop = TOOLS.find((t) => t.name === "tour_stop");
  assert.deepStrictEqual(stop.inputSchema.properties.mode.enum, ["file", "diff"]);
  for (const key of ["base", "head"]) {
    assert.deepStrictEqual(stop.inputSchema.properties[key].required, ["sha", "name"]);
  }
  assert.ok(stop.inputSchema.required.includes("base"));
  assert.ok(stop.inputSchema.required.includes("head"));
});

test("the diff-mode fixture round-trips through tour_stop", async () => {
  const fixtures = require("../../contract/fixtures.json");
  const diffRequest = fixtures.tour_stop.requests.find((r) => r.body.mode === "diff");
  assert.ok(diffRequest, "contract has no diff-mode request fixture");
  const b = await stubBridge({ "POST /stop": [200, { ok: true, opened: ["internal/client/do.go"], deferred: [] }] });
  const callTool = createCallTool({ resolveLock: () => ({ port: b.port, authToken: "tok" }) });
  const { protocolVersion, ...args } = diffRequest.body;
  await callTool("tour_stop", args);
  assert.strictEqual(b.seen[0].body.base.sha, diffRequest.body.base.sha);
  assert.strictEqual(b.seen[0].body.head.sha, diffRequest.body.head.sha);
  b.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test mcp/test/tools.test.js`
Expected: FAIL — the `mode` enum is `["file"]` and `base`/`head` are absent.

- [ ] **Step 3: Write the implementation**

In `mcp/lib/tools.js`, inside the `tour_stop` definition:

Change `required` to `["stopId", "label", "type", "mode", "base", "head", "files"]`.

Replace the `mode` property with:

```javascript
        mode: { type: "string", enum: ["file", "diff"], description: "Use \"diff\" to render the stop in the native multi-file diff editor -- correct for touring committed work. Use \"file\" for working-tree files." },
```

Add to `properties`:

```javascript
        base: { type: "object", required: ["sha", "name"], properties: { sha: { type: "string" }, name: { type: "string" } }, description: "Pinned base commit. Resolve with git rev-parse before the first stop and reuse it for every stop in the tour." },
        head: { type: "object", required: ["sha", "name"], properties: { sha: { type: "string" }, name: { type: "string" } }, description: "Pinned head commit, or sha \"WORKTREE\" for a tour of uncommitted work." },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test mcp/test/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp/lib/tools.js mcp/test/tools.test.js
git commit -m "feat(mcp): accept diff mode and pinned refs on tour_stop"
```

---

### Task 11: Teach the skill to pin refs and use diff mode [Track C]

**Files:**
- Modify: `skills/tour-changes/SKILL.md`

**Interfaces:**
- Consumes: `tour_stop` with `mode: "diff"` (Tasks 10, 10b)
- Produces: nothing downstream

- [ ] **Step 1: Update the diff-range step**

In `skills/tour-changes/SKILL.md`, replace the "Establish the diff range" body with:

```markdown
Inspect the repository and propose the likely review range rather than asking
the reviewer to formulate one. Common shapes: current branch vs the default
branch, working tree vs `HEAD`, a commit range, or a fetched MR/PR. State the
resolved `git diff` command and proceed unless corrected.

Then **pin it**. Run `git rev-parse --verify <ref>^{commit}` on both ends and
carry the resulting SHAs for the rest of the tour, keeping the human-readable
names for display. For a tour of uncommitted work, use the literal head sha
`"WORKTREE"`.

Pinning is what keeps a commit, rebase, or checkout during the tour from
silently repointing a stop you have already narrated.

If the diff is empty, report that and stop.
```

- [ ] **Step 2: Update the stop narration step**

Replace the `tour_stop` paragraph added in Task 7b with:

```markdown
In a driven tour, call `tour_stop` before narrating, passing the pinned `base`
and `head` on every call. Use `mode: "diff"` when touring committed work — the
stop renders as a real side-by-side diff — and `mode: "file"` when touring the
working tree. Anchor ranges with `side: "head"` for added or changed code,
`side: "base"` for code that was deleted, and `side: "working"` only in file
mode.

Then `tour_focus` as you zoom into a specific construct. Do not call
`tour_stop` again mid-stop; that is what `tour_focus` is for.

If `tour_stop` returns a non-empty `deferred` list, those files have not been
highlighted yet — the diff editor materializes them on scroll. Do not claim to
be pointing at code in a deferred file.
```

- [ ] **Step 3: Commit**

```bash
git add skills/tour-changes/SKILL.md
git commit -m "feat(skill): pin refs and tour committed work as real diffs"
```

---

### Task G2: Phase 2 gate [Gate]

Runs after Tasks 8, 9, 10, 10b, 11 are complete.

- [ ] **Step 1: Merge the track branches**

```bash
git checkout main
git merge --no-ff track-a/phase-2 track-b/phase-2 track-c/phase-2
```

Expected: no conflicts.

- [ ] **Step 2: Run every suite**

```bash
node --test test/ mcp/test/
cd editor-extension && npm run test:unit && npm run test:integration && cd ..
```

Expected: all PASS.

- [ ] **Step 3: Verify by hand**

Install the current build and ask for a tour of a branch against `main`.
Confirm each stop opens the multi-file diff editor, highlights land on the
correct side, and a `git commit` made mid-tour produces a clear
`diff_identity_mismatch` rather than silently repointing a stop.

- [ ] **Step 4: Tag**

```bash
git tag -a v0.2.0 -m "Phase 2: pinned diff identity and multi-file diff stops"
```

---

# Phase 3 — Two-way

Adds `GET /context`, so the reviewer can point at code and ask about it.

Track A runs Task 12, Track B runs Task 12b, Track C runs Task 13. All start
from `v0.2.0`.

---

### Task 12: Reading what the reviewer is looking at [Track A]

**Files:**
- Modify: `editor-extension/lib/editor.js`
- Modify: `editor-extension/extension.js`
- Modify: `editor-extension/test/integration/suite.test.js`

**Interfaces:**
- Consumes: `describe`/`workspaceRoot` (Task 6), `sideFor` (Task 9), `currentStopId`/`currentFocus` (Task 5)
- Produces: `GET /context` returning the shape in `contract/fixtures.json`

- [ ] **Step 1: Write the failing test**

Append to `editor-extension/test/integration/suite.test.js`:

```javascript
test("GET /context reports cursor and visible range with no selection", async () => {
  const doc = await vscode.workspace.openTextDocument(vscode.Uri.file(path.join(fixture(), "package.json")));
  const ed = await vscode.window.showTextDocument(doc, { preview: false });
  ed.selection = new vscode.Selection(1, 2, 1, 2);
  await sleep(300);

  const res = await call("GET", "/context");
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.context.path, "package.json");
  assert.strictEqual(res.context.side, "working");
  assert.deepStrictEqual(res.context.cursor, { line: 2, character: 2 });
  assert.strictEqual(res.context.selection, null);
  assert.ok(res.context.visibleRange.startLine >= 1);
  assert.strictEqual(typeof res.context.nearby.before, "string");
});

test("GET /context returns the selection when one exists", async () => {
  const ed = vscode.window.activeTextEditor;
  ed.selection = new vscode.Selection(0, 0, 2, 0);
  await sleep(300);
  const res = await call("GET", "/context");
  assert.strictEqual(res.context.selection.startLine, 1);
  assert.strictEqual(res.context.selection.endLine, 3);
  assert.ok(res.context.selection.text.length > 0);
});

test("the /context response carries every field the contract promises", async () => {
  const fixture = require("../../../contract/fixtures.json").tour_context.responses.find((r) => r.ok);
  const res = await call("GET", "/context");
  for (const key of Object.keys(fixture.context)) {
    assert.ok(key in res.context, `/context response is missing ${key}`);
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd editor-extension && npm run test:integration`
Expected: FAIL — `no such endpoint: GET /context`.

- [ ] **Step 3: Write the implementation**

Add to `editor-extension/lib/editor.js`, before `module.exports`:

```javascript
function innermostSymbol(symbols, line) {
  for (const s of symbols) {
    if (s.range.start.line <= line && line <= s.range.end.line) {
      return (
        innermostSymbol(s.children || [], line) || {
          name: s.name,
          kind: vscode.SymbolKind[s.kind] || String(s.kind),
          startLine: s.range.start.line + 1,
          endLine: s.range.end.line + 1,
        }
      );
    }
  }
  return null;
}

async function readContext(sideResolver) {
  const active = vscode.window.activeTextEditor;
  if (!active) throw fail("no_active_editor", "no editor is focused");

  const d = describe(active);
  if (!d) throw fail("no_active_editor", `the focused editor (${active.document.uri.scheme}) is not part of this workspace`);
  const side = d.side || sideResolver(d.ref) || "unknown";
  const doc = active.document;
  const sel = active.selection;

  const selection = sel.isEmpty
    ? null
    : { startLine: sel.start.line + 1, endLine: sel.end.line + 1, text: doc.getText(sel) };

  const visible = active.visibleRanges[0];
  const visibleRange = visible
    ? { startLine: visible.start.line + 1, endLine: visible.end.line + 1 }
    : { startLine: 1, endLine: doc.lineCount };

  const anchor = sel.start.line;
  const sliceFrom = Math.max(0, anchor - 10);
  const sliceTo = Math.min(doc.lineCount - 1, sel.end.line + 10);

  let symbol = null;
  try {
    const symbols = await vscode.commands.executeCommand("vscode.executeDocumentSymbolProvider", doc.uri);
    symbol = innermostSymbol(symbols || [], anchor);
  } catch {
    // No language server for this document. The selection and nearby lines
    // still answer most questions.
  }

  return {
    path: d.path,
    side,
    cursor: { line: active.selection.active.line + 1, character: active.selection.active.character },
    selection,
    symbol,
    visibleRange,
    nearby: {
      before: doc.getText(new vscode.Range(sliceFrom, 0, anchor, 0)),
      after: doc.getText(new vscode.Range(sel.end.line, 0, sliceTo, doc.lineAt(sliceTo).text.length)),
    },
  };
}
```

Add `readContext` to `module.exports` in `lib/editor.js`.

Add to the `handlers` object in `editor-extension/extension.js`:

```javascript
    "GET /context": async () => ({
      context: {
        ...(await editor.readContext(sideResolver)),
        stopId: store.currentStopId(),
        focus: store.currentFocus() || null,
      },
    }),
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd editor-extension && npm run test:unit && npm run test:integration
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add editor-extension/lib/editor.js editor-extension/extension.js editor-extension/test/integration/suite.test.js
git commit -m "feat(extension): report the reviewer's current context

Returns cursor, symbol, and visible range whether or not anything is
selected, because reviewers park a cursor far more often than they
highlight exact lines."
```

---

### Task 12b: The tour_context tool [Track B]

**Files:**
- Modify: `mcp/lib/tools.js`
- Modify: `mcp/test/tools.test.js`

**Interfaces:**
- Consumes: `ROUTES.tour_context`, `tour_context` fixtures (Task 0)
- Produces: MCP tool `tour_context`

- [ ] **Step 1: Write the failing test**

Append to `mcp/test/tools.test.js`:

```javascript
test("tour_context is declared and GETs /context", async () => {
  assert.ok(TOOLS.find((t) => t.name === "tour_context"));
  const b = await stubBridge({ "GET /context": [200, { ok: true, context: { path: "a.go", side: "head" } }] });
  const callTool = createCallTool({ resolveLock: () => ({ port: b.port, authToken: "tok" }) });
  const res = await callTool("tour_context", {});
  assert.strictEqual(res.context.path, "a.go");
  assert.strictEqual(b.seen[0].method, "GET");
  b.close();
});

test("tour_context passes through a no_active_editor error", async () => {
  const fixture = require("../../contract/fixtures.json").tour_context.responses.find((r) => !r.ok);
  const b = await stubBridge({ "GET /context": [400, fixture] });
  const callTool = createCallTool({ resolveLock: () => ({ port: b.port, authToken: "tok" }) });
  await assert.rejects(() => callTool("tour_context", {}), /no editor is focused/);
  b.close();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test mcp/test/tools.test.js`
Expected: FAIL — `unknown tool: tour_context`.

- [ ] **Step 3: Write the implementation**

Add to `mcp/lib/tools.js` `TOOLS`:

```javascript
  {
    name: "tour_context",
    description: "Read what the reviewer is looking at right now: active file and diff side, cursor position, selection if any, enclosing symbol, visible range, and ten lines either side. Call this first when a question is deictic -- \"what's this?\", \"why here?\", \"what does that call do?\". The nearby lines are a fast path, not a substitute for reading definitions, callers, tests, or history.",
    inputSchema: { type: "object", properties: {} },
  },
```

Add to `ROUTES`: `tour_context: ["GET", "/context"],`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test mcp/test/`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp/lib/tools.js mcp/test/tools.test.js
git commit -m "feat(mcp): add the tour_context tool"
```

---

### Task 13: Teach the skill to answer deictic questions [Track C]

**Files:**
- Modify: `skills/tour-changes/SKILL.md`

- [ ] **Step 1: Add the question-handling guidance**

In `skills/tour-changes/SKILL.md`, under the constraint about answering
interruptions, add:

```markdown
- When a question points at something without naming it — "what's this?", "why
  here?", "what does that call do?" — call `tour_context` first, then answer
  about what it reports. Do not guess which code they mean.
- `nearby` in that response is a fast path, not context. Read definitions,
  callers, tests, or history when the question needs them. Proximity is not
  relevance.
- If `tour_context` reports `side: "unknown"`, the reviewer is looking at an
  editor outside this tour. Say so rather than answering as if it were in scope.
```

- [ ] **Step 2: Commit**

```bash
git add skills/tour-changes/SKILL.md
git commit -m "feat(skill): answer deictic questions from editor context"
```

---

### Task G3: Phase 3 gate [Gate]

Runs after Tasks 12, 12b, 13 are complete.

- [ ] **Step 1: Merge and test**

```bash
git checkout main
git merge --no-ff track-a/phase-3 track-b/phase-3 track-c/phase-3
node --test test/ mcp/test/
cd editor-extension && npm run test:unit && npm run test:integration && cd ..
```

Expected: no conflicts, all PASS.

- [ ] **Step 2: Verify by hand**

Start a tour, highlight an unrelated function in an open file, and ask "what's
this?". Confirm the answer is about the highlighted code. Then place a bare
cursor in a different function, select nothing, and ask "why is this here?".
Confirm the answer is about the enclosing symbol rather than a guess.

- [ ] **Step 3: Tag**

```bash
git tag -a v0.3.0 -m "Phase 3: two-way context read-back"
```

---

# Phase 4 — Mid-review edits

Adds content hashing, drift detection, rebaseline, and the confirm-then-apply
edit loop with a ledger and closeout receipt.

Track A runs Tasks 14 and 15 in sequence, Track B runs Task 15b, Track C runs
Task 16. All start from `v0.3.0`.

---

### Task 14: Content hashing and drift detection [Track A]

**Files:**
- Create: `editor-extension/lib/hashes.js`
- Create: `editor-extension/test/hashes.test.js`

**Interfaces:**
- Consumes: nothing
- Produces: `createHashStore({ readFile })` with `baseline(paths) -> {path: digest}`, `check(paths)` throwing `content_drift`, `has(path)`, `reset()`

- [ ] **Step 1: Write the failing test**

Create `editor-extension/test/hashes.test.js`:

```javascript
const { test } = require("node:test");
const assert = require("node:assert");
const { createHashStore } = require("../lib/hashes.js");

function store(contents) {
  const files = { ...contents };
  const s = createHashStore({
    readFile: (p) => {
      if (!(p in files)) throw Object.assign(new Error("gone"), { code: "file_not_found" });
      return files[p];
    },
  });
  return { s, files };
}

test("baseline records a digest per path", () => {
  const { s } = store({ "a.go": "one" });
  const digests = s.baseline(["a.go"]);
  assert.match(digests["a.go"], /^[0-9a-f]{64}$/);
  assert.strictEqual(s.has("a.go"), true);
});

test("check passes when content is unchanged", () => {
  const { s } = store({ "a.go": "one" });
  s.baseline(["a.go"]);
  assert.doesNotThrow(() => s.check(["a.go"]));
});

test("check throws content_drift naming only the changed files", () => {
  const { s, files } = store({ "a.go": "one", "b.go": "two" });
  s.baseline(["a.go", "b.go"]);
  files["a.go"] = "changed";
  const err = assert.throws(() => s.check(["a.go", "b.go"]));
  assert.strictEqual(err.code, "content_drift");
  assert.match(err.message, /a\.go/);
  assert.doesNotMatch(err.message, /b\.go/);
});

test("paths with no baseline are ignored by check", () => {
  const { s } = store({ "a.go": "one" });
  assert.doesNotThrow(() => s.check(["never-seen.go"]));
});

test("baseline again after a change clears the drift", () => {
  const { s, files } = store({ "a.go": "one" });
  s.baseline(["a.go"]);
  files["a.go"] = "changed";
  assert.throws(() => s.check(["a.go"]));
  s.baseline(["a.go"]);
  assert.doesNotThrow(() => s.check(["a.go"]));
});

test("a file deleted after baselining is drift, not a crash", () => {
  const { s, files } = store({ "a.go": "one" });
  s.baseline(["a.go"]);
  delete files["a.go"];
  assert.strictEqual(assert.throws(() => s.check(["a.go"])).code, "content_drift");
});

test("reset forgets every baseline", () => {
  const { s, files } = store({ "a.go": "one" });
  s.baseline(["a.go"]);
  s.reset();
  files["a.go"] = "changed";
  assert.doesNotThrow(() => s.check(["a.go"]));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test editor-extension/test/hashes.test.js`
Expected: FAIL — `Cannot find module '../lib/hashes.js'`.

- [ ] **Step 3: Write the implementation**

Create `editor-extension/lib/hashes.js`:

```javascript
"use strict";

const crypto = require("node:crypto");

function createHashStore({ readFile }) {
  const digests = new Map();
  const digest = (text) => crypto.createHash("sha256").update(text).digest("hex");

  const readOrNull = (p) => {
    try {
      return readFile(p);
    } catch {
      return null;
    }
  };

  return {
    has: (p) => digests.has(p),
    reset: () => digests.clear(),
    baseline(paths) {
      const out = {};
      for (const p of paths) {
        const text = readOrNull(p);
        if (text === null) continue;
        out[p] = digest(text);
        digests.set(p, out[p]);
      }
      return out;
    },
    check(paths) {
      const drifted = [];
      for (const p of paths) {
        if (!digests.has(p)) continue;
        const text = readOrNull(p);
        if (text === null || digest(text) !== digests.get(p)) drifted.push(p);
      }
      if (drifted.length > 0) {
        throw Object.assign(
          new Error(`changed since this tour started: ${drifted.join(", ")}. If you changed them deliberately, call tour_rebaseline; otherwise stop and tell the reviewer.`),
          { code: "content_drift", paths: drifted }
        );
      }
    },
  };
}

module.exports = { createHashStore };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test editor-extension/test/hashes.test.js`
Expected: PASS — 7 tests.

- [ ] **Step 5: Commit**

```bash
git add editor-extension/lib/hashes.js editor-extension/test/hashes.test.js
git commit -m "feat(extension): detect content drift during a tour"
```

---

### Task 15: Wire drift detection into the extension [Track A]

**Files:**
- Modify: `editor-extension/extension.js`
- Modify: `editor-extension/test/integration/suite.test.js`

**Interfaces:**
- Consumes: `createHashStore` (Task 14)
- Produces: `POST /rebaseline`; `content_drift` from `/stop`, `/focus`, `/context`

- [ ] **Step 1: Write the failing test**

Append to `editor-extension/test/integration/suite.test.js`:

```javascript
test("editing a toured file is reported as content_drift", async () => {
  const rel = "drift-probe.txt";
  const abs = path.join(fixture(), rel);
  fs.writeFileSync(abs, "before\n");

  await call("POST", "/clear", {});
  const opened = await call("POST", "/stop", {
    stopId: "h1", index: 1, total: 1, label: "Drift", type: "implementation", mode: "file",
    base: { sha: "WORKTREE", name: "working tree" }, head: { sha: "WORKTREE", name: "working tree" },
    files: [{ path: rel, ranges: [{ side: "working", startLine: 1, endLine: 1 }] }],
  });
  assert.strictEqual(opened.ok, true);

  fs.writeFileSync(abs, "after\n");
  const res = await call("POST", "/focus", { path: rel, side: "working", startLine: 1, endLine: 1 });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error.code, "content_drift");
  assert.match(res.error.message, /drift-probe/);
});

test("rebaseline clears the drift for the named paths", async () => {
  const rel = "drift-probe.txt";
  const re = await call("POST", "/rebaseline", { paths: [rel], reason: "applied review edit" });
  assert.strictEqual(re.ok, true);
  assert.match(re.digests[rel], /^[0-9a-f]{64}$/);

  const res = await call("POST", "/focus", { path: rel, side: "working", startLine: 1, endLine: 1 });
  assert.strictEqual(res.ok, true);
  fs.unlinkSync(path.join(fixture(), rel));
});

test("rebaseline with no paths is bad_request", async () => {
  const res = await call("POST", "/rebaseline", { paths: [], reason: "nothing" });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.error.code, "bad_request");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd editor-extension && npm run test:integration`
Expected: FAIL — `no such endpoint: POST /rebaseline`.

- [ ] **Step 3: Write the implementation**

In `editor-extension/extension.js`, add to the requires:

```javascript
const fsp = require("node:fs");
const { createHashStore } = require("./lib/hashes.js");
```

Inside `activate`, after `const identity = createIdentity();`:

```javascript
  const hashes = createHashStore({ readFile: (rel) => fsp.readFileSync(editor.absolute(rel), "utf8") });
  const touched = (body) => (body.files || []).map((f) => f.path);
```

In the `POST /stop` handler, add `hashes.check(touched(body));` immediately
after each `identity.check(...)` call, and add this immediately before each
`return { opened, deferred: ... };`:

```javascript
      if (body.head && body.head.sha === "WORKTREE") hashes.baseline(touched(body));
```

In the `POST /focus` handler, add `hashes.check([body.path]);` as the first line.

Replace the `GET /context` handler so drift is reported:

```javascript
    "GET /context": async () => {
      const context = await editor.readContext(sideResolver);
      hashes.check([context.path]);
      return { context: { ...context, stopId: store.currentStopId(), focus: store.currentFocus() || null } };
    },
```

Add a new handler:

```javascript
    "POST /rebaseline": async (body) => {
      if (!Array.isArray(body.paths) || body.paths.length === 0) {
        throw Object.assign(new Error("paths must be a non-empty array"), { code: "bad_request" });
      }
      console.log(`[claude-tour] rebaseline ${body.paths.join(", ")}: ${body.reason || "no reason given"}`);
      return { digests: hashes.baseline(body.paths) };
    },
```

In the `POST /clear` handler, add `hashes.reset();`.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd editor-extension && npm run test:unit && npm run test:integration
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add editor-extension/extension.js editor-extension/test/integration/suite.test.js
git commit -m "feat(extension): distinguish a deliberate edit from drift

content_drift exists to catch the ground moving under a tour. An applied
edit moves it on purpose, so rebaseline marks it expected; drift without
a preceding rebaseline still stops the tour."
```

---

### Task 15b: The tour_rebaseline tool [Track B]

**Files:**
- Modify: `mcp/lib/tools.js`
- Modify: `mcp/test/tools.test.js`

**Interfaces:**
- Consumes: `ROUTES.tour_rebaseline`, `tour_rebaseline` fixtures (Task 0)
- Produces: MCP tool `tour_rebaseline`

- [ ] **Step 1: Write the failing test**

Append to `mcp/test/tools.test.js`:

```javascript
test("tour_rebaseline is declared and POSTs /rebaseline", async () => {
  const tool = TOOLS.find((t) => t.name === "tour_rebaseline");
  assert.ok(tool);
  assert.deepStrictEqual(tool.inputSchema.required, ["paths", "reason"]);

  const b = await stubBridge({ "POST /rebaseline": [200, { ok: true, digests: { "a.go": "abc" } }] });
  const callTool = createCallTool({ resolveLock: () => ({ port: b.port, authToken: "tok" }) });
  await callTool("tour_rebaseline", { paths: ["a.go"], reason: "applied edit at stop 2" });
  assert.deepStrictEqual(b.seen[0].body.paths, ["a.go"]);
  assert.strictEqual(b.seen[0].body.reason, "applied edit at stop 2");
  b.close();
});

test("the full tool surface matches the contract routes", () => {
  const { ROUTES } = require("../../contract/protocol.js");
  assert.deepStrictEqual(TOOLS.map((t) => t.name).sort(), Object.keys(ROUTES).sort());
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test mcp/test/tools.test.js`
Expected: FAIL — `unknown tool: tour_rebaseline`.

- [ ] **Step 3: Write the implementation**

Add to `mcp/lib/tools.js` `TOOLS`:

```javascript
  {
    name: "tour_rebaseline",
    description: "Re-hash files after you have applied an approved mid-review edit, so the deliberate change is not reported as drift. Call this immediately after editing, never before. Reads and hashes only -- it does not write.",
    inputSchema: {
      type: "object",
      required: ["paths", "reason"],
      properties: {
        paths: { type: "array", items: { type: "string" }, description: "Repository-relative paths you just changed." },
        reason: { type: "string", description: "Short note, e.g. \"applied review edit at stop 2\"." },
      },
    },
  },
```

Add to `ROUTES`: `tour_rebaseline: ["POST", "/rebaseline"],`

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test mcp/test/ test/contract.test.js`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add mcp/lib/tools.js mcp/test/tools.test.js
git commit -m "feat(mcp): add the tour_rebaseline tool"
```

---

### Task 16: The edit loop, ledger, and receipt [Track C]

**Files:**
- Modify: `skills/tour-changes/SKILL.md`
- Create: `skills/tour-changes/references/ledger.md`

**Interfaces:**
- Consumes: `tour_rebaseline` (Task 15b)
- Produces: nothing downstream

- [ ] **Step 1: Write the ledger reference**

Create `skills/tour-changes/references/ledger.md`:

```markdown
# Tour ledger and receipt

Maintain this state for the life of one tour. It is conversation state, not a
file — nothing is persisted unless the reviewer asks for it.

## Entries

| Entry | Fields |
|---|---|
| Stop | id, label, type, coverage (`covered`, `skipped`, `partial`) |
| Question | stop id, what was asked, the answer given |
| Concern | stop id, `path:line`, what it is, disposition (`open`, `accepted`, `dismissed`) |
| Edit | stop id, path, range, what changed, why the reviewer asked |
| Deferred | stop id, what was requested, why it was not done now |
| Uncovered | path or area, why it was not reached |

A declined or deferred change is still an entry. Those are the ones that get
lost otherwise.

## Receipt

Render at close-out, grouped by disposition:

- **Reviewed** — stops covered with no open concern.
- **Reviewed with a concern** — stop, the concern, and its `path:line`.
- **Changed during review** — every edit, with the file, what changed, and which stop prompted it.
- **Deferred** — requested but not done, with the reason.
- **Not covered** — stops skipped, and any area of the diff the tour did not reach.

Print it. Write it to a file or publish it only if the reviewer asks.

Do not claim a stop was reviewed because you narrated it. Coverage is what the
reviewer engaged with, and a stop they said "next" through in one word is
`partial` at best.
```

- [ ] **Step 2: Add the edit loop to the skill**

In `skills/tour-changes/SKILL.md`, add a new step before "Close out":

```markdown
### 4b. Apply changes the reviewer asks for

Giving feedback in the moment is the point of a walkthrough. When the reviewer
asks for a change:

1. State what you will change and why, in terms of the stop that prompted it.
2. Show the change.
3. Apply it only on an explicit yes.
4. Call `tour_rebaseline` with the paths you touched and a short reason.
5. Record it in the ledger.
6. Recompute any `working`-side ranges in later stops before using them.
7. Return to where the tour paused.

If the reviewer declines or defers, record that too.

Do not stage, commit, or branch. Edits land in the working tree as ordinary
changes; attribution lives in the ledger, which keeps this working on a
detached HEAD and on branches the reviewer does not own.

Editing is cheap when touring committed work, because `base` and `head` anchors
point at git blobs that a working-tree edit cannot perturb. It is expensive
when touring a dirty tree, because then the tour's "after" side is the thing
being edited. Say so if the reviewer asks for many changes to an uncommitted
tour.

If any tool returns `content_drift` and you did not just edit that file, stop
and tell the reviewer. Do not re-resolve silently.
```

- [ ] **Step 3: Add the ledger to the close-out step**

Replace the "Close out" step body with:

```markdown
Give a short closing summary: the overall shape of the change, and a roll-up of
concerns. Then render the review receipt described in
`references/ledger.md` — what was reviewed, what carried a concern, what was
changed during the review, what was deferred, and what was not covered.

Do not equate reaching the last stop with a completed review. Say plainly what
was skipped.

End a driven tour with `tour_clear`.
```

- [ ] **Step 4: Add the ledger constraints**

Add to the "Constraints" section:

```markdown
- Track the ledger from the first stop, not retroactively at the end. A
  question answered three stops ago is not reconstructable.
- Never stage, commit, push, or post review comments. Applying an approved edit
  to the working tree is the only write this skill performs.
```

- [ ] **Step 5: Commit**

```bash
git add skills/tour-changes/SKILL.md skills/tour-changes/references/ledger.md
git commit -m "feat(skill): confirm-then-apply edits with a ledger and receipt

An edit with nowhere to be recorded is the untracked follow-up this
feature exists to prevent."
```

---

### Task 17: Ship it [Gate]

Runs after Tasks 14, 15, 15b, 16 are complete.

**Files:**
- Modify: `README.md`
- Create: `editor-extension/README.md`
- Create: `.github/workflows/test.yml`

- [ ] **Step 1: Merge the track branches**

```bash
git checkout main
git merge --no-ff track-a/phase-4 track-b/phase-4 track-c/phase-4
```

Expected: no conflicts.

- [ ] **Step 2: Write the CI workflow**

Create `.github/workflows/test.yml`:

```yaml
name: test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22" }
      - name: contract has not drifted
        run: node contract/sync.js && git diff --exit-code editor-extension/lib/contract.js
      - run: node --test test/ mcp/test/
      - run: npm install
        working-directory: editor-extension
      - run: npm run test:unit
        working-directory: editor-extension
      - run: sudo apt-get update && sudo apt-get install -y xvfb
      - run: npm run test:integration
        working-directory: editor-extension
```

- [ ] **Step 3: Write the extension README**

Create `editor-extension/README.md`:

```markdown
# Claude Tour

Companion extension for the [tour-changes](https://github.com/erstaples/claude-code-review-walkthrough)
plugin. It lets an agentic coding tool open files, highlight ranges, render
diffs, and read your current editor context while walking you through a change.

It listens on `127.0.0.1` on an ephemeral port, requires a bearer token written
to a `0600` lockfile under `~/.claude/tour/`, and refuses any request carrying
an `Origin` header. It has no endpoint that writes to a file.

Install it with the plugin's `install.sh` rather than on its own.
```

- [ ] **Step 4: Update the root README**

In `README.md`, replace the status banner with:

```markdown
> **Status: v1.0.0.** All four phases shipped. The one remaining unverified
> assumption is `${CLAUDE_PLUGIN_ROOT}` expansion in Codex — see
> [Known gaps](#known-gaps); `install.sh` detects and works around it.
```

Remove the "design complete, implementation not started" language wherever it
appears, and confirm the tools table lists all six tools.

- [ ] **Step 5: Run the full suite and package**

```bash
node contract/sync.js && git diff --exit-code editor-extension/lib/contract.js
node --test test/ mcp/test/
cd editor-extension && npm run test:unit && npm run test:integration && npm run package && cd ..
```

Expected: all PASS, and `editor-extension/claude-tour-0.1.0.vsix` exists.

- [ ] **Step 6: Verify a clean install end to end**

```bash
code --uninstall-extension estaples.claude-tour || true
./install.sh
```

Reload VS Code, install the plugin into both Claude Code and Codex, and run one
full tour in each: agenda, driven diff stops, a deictic question, one applied
edit, and a closeout receipt.

- [ ] **Step 7: Commit and tag**

```bash
git add README.md editor-extension/README.md editor-extension/claude-tour-0.1.0.vsix .github/workflows/test.yml
git commit -m "chore: ship v1.0.0

Adds CI across the contract drift check, unit tests, and xvfb-backed
integration tests, packages the extension, and updates the README now
that all four phases are complete."
git tag -a v1.0.0 -m "Driven tours with diff rendering, context read-back, and recorded mid-review edits"
```
