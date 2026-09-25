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
repository, canonical contract, and direct-Node MCP suites. Tests import compiled
host modules through `test/compiled.js`. `.test-dist/` and `dist/` are disposable,
ignored output. On macOS use `TMPDIR=/private/tmp npm run test:all` when Git and
Node disagree about the system temporary directory's canonical path.

`src/shared/` holds the data definitions both sides use: tour data (re-exported
from the generated contract declarations), snapshots, layouts and saved layouts,
and the sidebar/host message unions. The sidebar list model also lives there,
because the host's anchor quick pick uses it. `src/host/` contains migrated host
modules; `lib/` contains unmigrated host code and generated contract copies.
Browser code may import `src/shared/` but never Node or VS Code modules.
The browser entry still bundles the imperative sidebar in `media/tour.js`;
its TypeScript conversion belongs to slice 3 and React to slice 5.

Host and webview configs have separate Node/VS Code and DOM environments. Both
are strict for TypeScript, with temporary `allowJs: true`, `checkJs: false` for
unmigrated code in `lib/` and `media/tour.js`. `typecheck` also runs
`tsconfig.contract.json`, which checks the shared JavaScript contracts and their
copies strictly through JSDoc, and `tsconfig.types.json`, which compiles the
type-level tests in `test/types/`. Those tests use `@ts-expect-error` to prove
that invalid messages, unnarrowed snapshots and unchecked stored layouts are
rejected; an unused directive fails the check. They do not replace the runtime
validation tests.

Shared runtime contracts still originate in `../contract/`; run
`node ../contract/sync.js` when changing them, including their declarations, and
keep the existing drift tests. Do not independently edit their generated `lib/`
copies. The MCP server continues to run without compilation or installed
dependencies.

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
