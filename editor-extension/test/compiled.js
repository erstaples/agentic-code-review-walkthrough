"use strict";
// Build once with npm run build:test before running the Node suite.
const path = require("node:path");
const resolve = (modulePath) =>
  require.resolve(path.join(__dirname, "../.test-dist", modulePath));
const compiled = (modulePath) => require(resolve(modulePath));
compiled.resolve = resolve;
module.exports = compiled;
