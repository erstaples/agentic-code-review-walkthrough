# Extension development

Use Make, Bash 3.2+, Node.js 22+, npm, jq, Python 3.9+, and VS Code 1.139+.
The root Makefile is the development entry point. From the repository root:

```sh
make setup
make check
make test
make build
make watch
```

`make watch` rebuilds both bundles as source changes. Run type checking separately;
esbuild does not check types. `make format` formats handwritten JavaScript,
TypeScript and TypeScript configurations throughout the repository. Generated
runtime files are excluded; rebuild them after editing their TypeScript sources.
CI checks formatting before tests.

`test:unit` compiles and runs extension tests; `test:all` also runs repository and
MCP tests. Active tests import typed source and compile into `.test-dist/checks/`.
The retired JavaScript tests use `test/compiled.js` for the remaining host helpers.
`.test-dist/` and `dist/` are disposable, ignored output. On macOS use
`TMPDIR=/private/tmp npm run test:all` when Git and Node disagree about the system
temporary directory's canonical path.

`src/shared/` defines tours, snapshots, layouts, saved layouts, and messages.
`src/host/` contains the host implementation, including tab ownership and request
validation. `src/webview/App.tsx` composes the React sidebar; `components/` contains its
header, rows, placement picker, narration, and navigation. `bridge.ts` owns the
VS Code connection, rejects older snapshots, and adds the latest revision to
requests. The host still owns editor movement and saved layouts.

Host and browser configurations use separate Node/VS Code and DOM environments.
The host, sidebar, shared runtime and MCP implementation use strict TypeScript.
Shared source lives in `../shared/` and MCP source in `../mcp/`.
`make runtime` generates readable JavaScript and declarations under
`../generated/`. MCP and the extension consume the same shared output.
`make runtime-check` rejects stale, missing and extra generated files.

`typecheck` also checks active unit tests and type-only fixtures. These cover
invalid messages, unchecked data, snapshots and injected API fakes. Received JSON
still needs runtime validation. Plugin users run the small `mcp/server.js`
launcher without installing dependencies or compiling TypeScript.

Retired presentation helpers live under `test/legacy/` for historical regression
checks and are not shipped. HTTP/MCP bridge tests exercise the server with real
requests. The native harness remains JavaScript and uses the typed shared fixture.

The pinned Node types target Node 22. As of September 24, npm publishes VS Code
API types only through 1.138.0, so this slice uses that compatible subset while
retaining the 1.139.0 minimum and testing on VS Code 1.139.0. Upgrade the type
package when matching 1.139 types are published.

## Packaging and native tests

From the repository root, `make rebuild` performs a clean dependency
install, all Node tests, archive rejection tests, release checks, type checking,
formatting checks, bundling, packaging, and fresh-build archive comparison.
`npm run package` also runs the required checks/build via `vscode:prepublish`.

Only the two generated bundles, CSS, icons, release metadata, and bundled-library
notices ship. React is included in the production browser bundle; packaging
excludes dependency folders and needs no runtime install or development server. The
archive checker has its own explicit allowlist and rebuilds before comparing
bytes; stale bundles, legacy entry points, source, tests, and dependency folders
are rejected. This also applies to the publish job's downloaded artifact.

Native tests must use the extracted VSIX, not `.test-dist`:

```sh
version=$(make --no-print-directory version)
unzip -q "editor-extension/kanko-$version.vsix" -d /private/tmp/kanko-package-test
EXTENSION_PATH=/private/tmp/kanko-package-test/extension \
  make integration
```

Use a new extraction directory for each artifact. The runner creates a separate
workspace and editor profile. On Linux CI it runs under `xvfb-run`; on macOS you
can set `VSCODE_EXECUTABLE_PATH` to an installed VS Code executable. Set
`KANKO_TOUR_OUTPUT` to retain native result JSON. Launching GUI applications may
require permission outside a command sandbox.

`test/sidebar-ui.test.ts` runs rendered React interactions through Testing Library
and jsdom, with an explicit VS Code message fake. It covers current revisions,
filtering, grouping, windowed keyboard navigation, picker focus and updates,
disabled actions, escaped narration, and subscription cleanup. These tests run
in both `test:unit` and `test:all` using the existing Node runner. The browser
bundle smoke test separately checks startup without Node globals. Actual
geometry, scrolling, CSP enforcement, themes, and accessibility still require
native UI acceptance.

## Readability

Use descriptive local names, one declaration per statement, and short guards.
Split a function when it mixes responsibilities; avoid adding helpers that only
rename an expression. Comments should explain a reason the code cannot show.

The sidebar hooks separate list filtering and focus (`useAnchorList`), placement
choices (`usePlacement`), and document/host shortcuts (`useSidebarShortcuts`).
`App.tsx` renders their state. Shortcuts use the current render's actions; keep
that property when changing subscriptions.

The layout engine coordinates ordered operations. `layout-placement.ts` chooses
slots and builds diagrams, `layout-editors.ts` handles native editor calls, and
`layout-persistence.ts` handles saved stop layouts and role preferences. Keep
observations and storage writes inside the existing transaction order.

The [remaining JavaScript assessment](../docs/javascript-typescript-assessment.md)
lists the files deliberately retained and the checks protecting plugin startup.
