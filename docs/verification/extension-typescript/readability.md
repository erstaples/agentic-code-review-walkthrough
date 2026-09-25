# Readability verification

September 25, 2026.

## Changes

- Root formatter settings cover handwritten JavaScript, TypeScript, tests and
  build scripts. Generated extension copies come from the formatted originals.
  CI checks formatting before running tests.
- Sidebar hooks own list navigation, placement and shortcut subscriptions.
  Filtering, grouping, focus restoration and message fields are preserved.
- Layout helpers separate placement choices and diagrams, native editor calls,
  and saved stop data. The engine retains transaction ordering and tab ownership.
- The [JavaScript assessment](../../javascript-typescript-assessment.md) recommends
  shared source first, then MCP and active tests; no conversion is included here.

Formatting is a separate commit (`be69091`). A syntax-tree comparison with its
parent checked all 64 existing changed JavaScript/TypeScript files. The comparison
ignored comments, redundant parentheses and optional property-name quotes; their
remaining syntax trees matched.

## Checks

| Check | Result |
| --- | --- |
| Strict host, webview, shared JavaScript and type-fixture checks | Pass |
| Repository-wide formatting | Pass |
| Repository, MCP, extension and rendered sidebar tests | 250 passed |
| Archive rejection tests | 6 passed |
| Clean build and package under Node 22 | Pass |
| Archive allowlist and fresh-build byte comparison | 12 packaged files, pass |
| Extracted VSIX in VS Code 1.139.0 on macOS | 30 scenarios passed |

The clean package command was `bash scripts/build-vsix.sh`, with Node 22 on PATH,
`TMPDIR=/private/tmp` and a writable npm cache. Native tests used the extracted
package through `EXTENSION_PATH` and the isolated VS Code executable through
`VSCODE_EXECUTABLE_PATH`. [Bounded native results](readability-native.json) list
all scenarios and the checked archive digest.

Existing tests cover saved layouts and role preferences, pins, reviewer-owned
previews, custom geometry, sequence mode, placement diagrams, changed-source
rejection, keyboard access through anchor 99, filtering, picker focus, message
ordering and subscription cleanup. No tests were weakened for the extraction.

The first sandboxed native launch aborted before tests started. The isolated
native run outside the sandbox passed. The earlier intermittent Linux saved-pin
failure remains unexplained; this slice does not claim to fix it.

These are automated runtime and rendered-component checks. This slice does not
claim new human UI acceptance, theme screenshots, screen-reader verification or
responsiveness measurements. Those remain in slice 6.

Documentation maintenance note (September 25, 2026): outstanding slice 6 work
will be tracked in GitHub issues instead of a committed implementation plan.
The results and limits above remain historical.
