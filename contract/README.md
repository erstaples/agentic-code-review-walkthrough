# Shared protocol

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

`contract-types.d.ts` describes the data used by these JavaScript modules.
MCP runs them directly with Node; `npm --prefix editor-extension run typecheck`
checks their JSDoc types. The sync script copies the declarations into the
extension, and a test detects differences.

Received JSON stays `unknown` until checked. A successful `validateTourPlan`
result carries a normalized `TourPlan`; optional metadata that the validator
copies without checking remains `unknown`. `TourPlanInput` allows callers to
omit fields that validation fills in.

Type declarations and comments alone do not require a protocol version change.
Changes to sent or accepted data require updating `PROTOCOL_VERSION`, fixtures,
and both consumers.
