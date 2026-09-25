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
esbuild does not check types. `npm run format` formats only migrated TypeScript,
build scripts, and TypeScript configurations. `npm run test:unit` compiles once
and runs the extension's existing Node test runner; `test:all` also runs the
repository, shared protocol, and direct-Node MCP suites. Tests import compiled
host modules through `test/compiled.js`. `.test-dist/` and `dist/` are disposable,
ignored output. On macOS use `TMPDIR=/private/tmp npm run test:all` when Git and
Node disagree about the system temporary directory's canonical path.

`src/shared/` defines tours, snapshots, layouts, saved layouts, and messages.
`src/host/` contains the host implementation, including tab ownership and request
validation. `src/webview/sidebar.ts` renders the existing sidebar; `bridge.ts`
owns the VS Code connection and adds the current revision to requests. React
belongs to slice 5.

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

Only the two generated bundles, CSS, icons, and release metadata ship. The
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

The bundle smoke test proves startup and the ready handshake without Node
globals. It does not establish visual parity, focus, geometry, or accessibility;
those require the native/UI acceptance in later migration slices.
