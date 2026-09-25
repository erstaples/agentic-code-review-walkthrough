# JavaScript and TypeScript status

Updated September 25, 2026 after the readability and runtime conversion slices.

The extension host, React sidebar, shared runtime and MCP implementation now use
strict TypeScript. Repository tests, MCP tests, active extension unit tests and
the shared native fixture are TypeScript too. No new application framework was
needed.

## Maintained source

| Area | Source | Build output |
| --- | --- | --- |
| Extension host and sidebar | `editor-extension/src/` | Two extension bundles |
| Shared validation, source loading and narration | `shared/` | `generated/shared/` |
| MCP server, storage, Git access and review maps | `mcp/**/*.ts` | `generated/mcp/` |
| Active unit tests and fixtures | `test/`, `mcp/test/`, `editor-extension/test/` | Ignored `editor-extension/.test-dist/checks/` |

Both consumers use the generated shared implementation. Manual declarations and
separately copied extension implementations have been removed. CI checks that
rebuilding produces exactly the checked-in runtime files.

## JavaScript intentionally retained

Generated output is excluded from these counts.

| Area | Files | Reason |
| --- | ---: | --- |
| MCP launcher | 1 | Preserves the existing Node entry point. |
| Build and maintenance scripts | 5 | Small developer tools with little benefit from another compilation step. |
| Native acceptance harness | 4 | Runs inside VS Code; still exercises the packaged extension. Its shared fixture is typed. |
| Retired regression tests and helpers | 9 | Preserve historical checks without adding types to retired implementations. Includes the compiled-module loader. |
| Layout spike | 3 | An isolated experiment, outside the shipped extension. |

The next useful conversion would be the native harness if we extend it. Retired
helpers and the spike should be evaluated for unique coverage before removal;
converting them alone would add little value. There is no remaining handwritten
JavaScript application logic in the shipped extension or MCP implementation.

## Plugin startup and checks

`mcp/server.js` loads readable generated JavaScript. Plugin users still need
Node 22 or newer, with no dependency installation or build. Developers regenerate
output with `npm --prefix editor-extension run runtime:build`.

`npm --prefix editor-extension run typecheck` checks runtime source, active unit
tests and type-only fixtures. `test:all` compiles and runs the Node tests. The
checks include malformed requests, replay of events recorded by the previous
JavaScript implementation, unchanged state and receipt hashes, generated-output
drift, and MCP startup from a copy containing only the launcher and generated
files. Native acceptance uses the extracted VSIX.

External JSON is checked before entering typed code. Known fields with invalid
types are rejected; additional entity metadata remains allowed. Existing valid
stored events, serialized formats and protocol/schema versions are preserved.
