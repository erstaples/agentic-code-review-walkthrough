# Wire contract

`protocol.js` is the source of truth for the protocol version, error codes, and
closed value sets. `fixtures.json` holds representative request and response envelopes per
endpoint, including deliberately invalid load and unloaded navigation requests.

Both sides of the bridge test against these fixtures without depending on each
other, which is what lets the extension and the MCP client be built in
parallel.

`editor-extension/lib/contract.js` is generated — run `node contract/sync.js`
after any change here. `test/contract.test.js` fails if the copy drifts.

Changing anything in this directory is a protocol change: bump
`PROTOCOL_VERSION` and update both sides.

Protocol 3 exposes `/tour/load`, `/tour/navigate`, `/tour/state`, `/status`, and
`/clear`. There are no compatibility routes for the former stop/focus workflow.
The change record MCP operation resolves the current plan and source manifest before
sending a load payload. The extension independently validates its sources.

`tour.js`, `tour-sources.js`, and `narration.js` are shared by the change record service
and extension. The sync script copies them into the VSIX; tests compare the
packaged source byte for byte (apart from the validator import name).
