# Shared runtime

Maintain the TypeScript files here. From `editor-extension`, run
`npm run runtime:build` to generate readable JavaScript and declarations in
`generated/shared/`. Both MCP and the extension use that output.
`npm run runtime:check` checks compilation and rejects stale, missing or extra
output without changing files. CI runs it before tests and packaging.

The JSON fixtures in `contract/fixtures.json` cover representative requests and
responses. Changes to sent or accepted data require updating `PROTOCOL_VERSION`,
the fixtures and both consumers. Types and comments alone do not.

Received JSON stays `unknown` until validated. A successful `validateTourPlan`
returns a normalized plan; copied metadata that is not validated stays `unknown`.
