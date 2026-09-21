# Wire contract

`protocol.js` is the source of truth for the protocol version, error codes, and
closed value sets. `fixtures.json` holds canonical request/response pairs per
endpoint.

Both sides of the bridge test against these fixtures without depending on each
other, which is what lets the extension and the MCP client be built in
parallel.

`editor-extension/lib/contract.js` is generated — run `node contract/sync.js`
after any change here. `test/contract.test.js` fails if the copy drifts.

Changing anything in this directory is a protocol change: bump
`PROTOCOL_VERSION` and update both sides.
