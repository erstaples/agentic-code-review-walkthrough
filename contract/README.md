# Wire contract

`protocol.js` is the source of truth for the protocol version, error codes, and
closed value sets. `fixtures.json` holds representative request and response envelopes per
endpoint, including deliberately invalid load and unloaded navigation requests.

Both sides of the bridge test against these fixtures without depending on each
other, which is what lets the extension and the MCP client be built in
parallel.

`editor-extension/lib/contract.js` is generated — run `node contract/sync.js`
after any change here, including type-only changes. `test/contract.test.js` fails if the copy drifts.

Changing the runtime behavior of anything in this directory is a protocol
change: bump `PROTOCOL_VERSION` and update both sides. Type-only changes are
the exception described under Types below.

Protocol 3 exposes `/tour/load`, `/tour/navigate`, `/tour/state`, `/status`, and
`/clear`. There are no compatibility routes for the former stop/focus workflow.
The review map MCP operation resolves the current plan and source manifest before
sending a load payload. The extension independently validates its sources.

`tour.js`, `tour-sources.js`, and `narration.js` are shared by the review map service
and extension. The sync script copies them into the VSIX; tests compare the
packaged source byte for byte (apart from the validator import name).

## Types

`contract-types.d.ts` declares the transported shapes: protocol constants,
anchors, spans, revisions, beats, stops, normalized plans, findings, and the
source-reader interface. The JavaScript modules stay the runtime source of
truth and run directly with Node; they reference these declarations through
JSDoc, and `npm --prefix editor-extension run typecheck` checks them strictly
(`tsconfig.contract.json`). Nothing here needs compiling or installing to run
the MCP server.

Received JSON is `unknown` until `validateTourPlan` accepts it; only a result
with `ok: true` carries a `TourPlan`. The sync script copies the declarations
to `editor-extension/lib/contract-types.d.ts`, and a drift test compares them.

A type-only change (declarations or JSDoc) does not change the wire protocol
and needs no version bump, but must leave every fixture and serialized field
unchanged. Changing what is sent or accepted is still a protocol change: bump
`PROTOCOL_VERSION`, then update the declarations with both sides.
