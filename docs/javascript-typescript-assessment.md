# Remaining JavaScript: TypeScript assessment

September 25, 2026. Assessment only; the readability slice does not convert these files.

## Recommendation

Convert the shared runtime first, then MCP, then the tests that exercise them.
Keep the official VS Code API, React and esbuild. These conversions need clearer
models and runtime input checks, not another extension framework.

The extension's shipped host and sidebar source is already TypeScript. The
remaining handwritten runtime is four shared modules and thirteen MCP modules.
The largest benefit is in tour validation and the review map service: they pass
complex, related objects between functions with little compiler checking today.

## Inventory and order

Counts include handwritten `.js` and `.mjs` files after the readability slice;
generated extension copies and build output are excluded.

| Source | Files | Recommendation |
| --- | ---: | --- |
| Shared runtime | 4 | Convert first: protocol constants, tour validation, source loading and narration. Generate declarations from the implementations. |
| MCP runtime | 13 | Convert next: start with errors, identifiers and RPC; then storage, Git access, review events, service and tool dispatch. |
| Extension tests and fixtures | 33 | Convert current fixtures and fakes alongside their modules. These include four retired helper files and three spike files; decide whether those checks are still needed before spending time converting them. |
| Repository and MCP tests | 11 | Convert with the corresponding runtime modules, keeping malformed-input cases explicitly typed as unknown. |
| Build and maintenance scripts | 4 | Low priority: shared-source sync, release checks, formatting and the extension builder can remain short JavaScript scripts. |

The generated files under `editor-extension/lib/` should have one maintained
source. Converting a generated copy would introduce a second implementation.

## Keep installation simple

Today, `mcp.json` launches `node .../mcp/server.js`. The README promises Node 22+
and no runtime dependency installation or compilation. The shared modules are
also loaded directly by repository and MCP tests.

Recommended approach: develop in TypeScript and generate readable JavaScript
for the existing Node entry point. Developers run the build; plugin users do not.
Because plugins currently run from a Git checkout, generated runtime files must
remain available in that checkout until distribution changes. Keep them in a
clearly marked generated directory, retain a small launcher, and make CI fail
when rebuilding changes the checked-in output. Do not maintain both versions
by hand or minify the generated MCP code.

The extension and MCP should build from the same shared TypeScript sources.
Replace manual declarations and copying with generated output, and keep a check
that both consumers use the same implementations.

An alternative is direct TypeScript execution on Node 22.18+, which enables type
stripping by default. That would raise the documented minimum and require
compatible import paths and erasable syntax; Node does not type-check or read
`tsconfig.json`. Keep a separate strict compiler check either way.
[Node documentation](https://nodejs.org/api/typescript.html).

I recommend generated JavaScript for now because it preserves the current
runtime requirement and plugin launch path. Direct TypeScript is reasonable
only if we deliberately raise and enforce the minimum Node version.

## Proposed follow-up slices

1. **Shared source and build.** Move the four shared modules to TypeScript,
   generate their JavaScript and declarations, update both consumers, and prove
   that a fresh checkout still launches MCP without installing dependencies.
2. **MCP types.** Define request, event, stored-state and result types. Receive
   outside JSON as `unknown`, validate it, and preserve existing error messages,
   file formats and event replay. Convert tests and fixtures as each area moves.
3. **Test cleanup.** Type the remaining active test helpers. Check the retired
   helpers and spikes for unique coverage; preserve that coverage before removal.
   Keep small maintenance scripts in JavaScript unless typing solves a specific
   problem.

Acceptance should include strict checks without blanket `any` or suppression,
fresh-output comparisons, existing JSON and event fixtures, malformed requests,
MCP stdio startup from an installation-free checkout, and packaged extension
integration tests. The highest risk is changing persistence or validation while
trying to satisfy the compiler; those behaviors must remain unchanged.
