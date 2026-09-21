"use strict";

const path = require("node:path");
const nodeTest = require("node:test");

const SUITE = path.resolve(__dirname, "suite.test.js");

// node:test's run({ isolation: "none" }) finalises its root test only from a
// process "beforeExit" event, which an extension host never reaches. Registering
// the suite here gives a promise that settles on the suite's own completion.
exports.run = async function run() {
  const failures = [];

  const record = (label, err) => {
    failures.push(label);
    console.error("FAIL:", label, err);
  };

  const test = (name, fn) =>
    nodeTest.test(name, async (t) => {
      try {
        await fn(t);
      } catch (err) {
        record(name, err);
        throw err;
      }
      console.log("ok:", name);
    });

  const hook = (register, label) => (fn) =>
    register(async (t) => {
      try {
        await fn(t);
      } catch (err) {
        record(label, err);
        throw err;
      }
    });

  await nodeTest.suite("claude-tour", () => {
    require(SUITE)({
      test,
      before: hook(nodeTest.before, "before hook"),
      after: hook(nodeTest.after, "after hook"),
    });
  });

  if (failures.length > 0) {
    throw new Error(`${failures.length} integration check(s) failed: ${failures.join(", ")}`);
  }
};
