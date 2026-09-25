# Extension development

Use Node.js 22 or newer, npm, Python 3, and VS Code 1.139 or newer.
From `editor-extension/`:

```sh
npm ci
npm run typecheck
npm run format:check
npm run test:all
npm run build
npm run watch
```

`watch` rebuilds both bundles as source changes. Run type checking separately;
esbuild does not check types. `npm run format` formats handwritten JavaScript and TypeScript throughout the
repository, plus TypeScript configurations. The root formatter settings also
apply to MCP, tests and fixtures. Generated extension copies are excluded; run
the shared-source sync after editing their originals. CI checks formatting
before tests. `npm run test:unit` compiles once
and runs the extension's existing Node test runner; `test:all` also runs the
repository, shared protocol, and direct-Node MCP suites. Tests import compiled
host modules through `test/compiled.js`. `.test-dist/` and `dist/` are disposable,
ignored output. On macOS use `TMPDIR=/private/tmp npm run test:all` when Git and
Node disagree about the system temporary directory's canonical path.

`src/shared/` defines tours, snapshots, layouts, saved layouts, and messages.
`src/host/` contains the host implementation, including tab ownership and request
validation. `src/webview/App.tsx` composes the React sidebar; `components/` contains its
header, rows, placement picker, narration, and navigation. `bridge.ts` owns the
VS Code connection, rejects older snapshots, and adds the latest revision to
requests. The host still owns editor movement and saved layouts.

Host and browser configurations use separate Node/VS Code and DOM environments.
All extension-owned source is strict TypeScript. `lib/` contains only generated,
checked JavaScript and declarations copied from `../contract/`; MCP still runs
those shared modules directly without installation or compilation. Run
`node ../contract/sync.js` after changing their canonical sources.

`typecheck` also checks the shared JavaScript and compile-time tests. Those tests
cover invalid messages, unchecked data, snapshots, and small injected API fakes.
Runtime validation remains necessary for external input.

The retired presentation helpers live under `test/legacy/` solely for historical
regression checks. They are not compiled into the extension. HTTP/MCP bridge
tests live in the extension suite so they use the compiled server; standalone
MCP tests still run with plain Node.

The pinned Node types target Node 22. As of September 24, npm publishes VS Code
API types only through 1.138.0, so this slice uses that compatible subset while
retaining the 1.139.0 minimum and testing on VS Code 1.139.0. Upgrade the type
package when matching 1.139 types are published.

## Packaging and native tests

From the repository root, `bash scripts/build-vsix.sh` performs a clean dependency
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
unzip -q editor-extension/kanko-0.1.0.vsix -d /private/tmp/kanko-package-test
EXTENSION_PATH=/private/tmp/kanko-package-test/extension \
  npm --prefix editor-extension run test:integration
```

Use a new extraction directory for each artifact. The runner creates a separate
workspace and editor profile. On Linux CI it runs under `xvfb-run`; on macOS you
can set `VSCODE_EXECUTABLE_PATH` to an installed VS Code executable. Set
`KANKO_TOUR_OUTPUT` to retain native result JSON. Launching GUI applications may
require permission outside a command sandbox.

`test/sidebar-ui.test.js` runs rendered React interactions through Testing Library
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
describes the next conversion work and the plugin startup constraint.
