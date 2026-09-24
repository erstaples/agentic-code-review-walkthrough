"use strict";

const path = require("node:path");
const nodeTest = require("node:test");

const SUITE = path.resolve(__dirname, "suite.test.js");

function lastFunctionIndex(args) {
  for (let i = args.length - 1; i >= 0; i--) {
    if (typeof args[i] === "function") return i;
  }
  return -1;
}

// node:test's run({ isolation: "none" }) finalises its root test only from a
// process "beforeExit" event, which an extension host never reaches. Registering
// the suite here gives a promise that settles on the suite's own completion.
//
// node:test reports failures to its own reporter, and neither suite() nor test()
// rejects when a subtest fails, so every outcome this harness cares about has to
// be recorded as it happens.
exports.run = async function run() {
  const failures = [];
  let registered = 0;
  let registrationFailed = false;

  const record = (label, err) => {
    failures.push(label);
    console.error("FAIL:", label, err);
  };

  const escaped = (err) => record("asynchronous failure outside a test", err);
  process.on("uncaughtException", escaped);
  process.on("unhandledRejection", escaped);

  const context = (t, label) =>
    new Proxy(t, {
      get(target, prop) {
        if (prop === "test") return instrument((...a) => target.test(...a), `${label} > `);
        const value = Reflect.get(target, prop, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });

  const instrument = (register, prefix) => (...args) => {
    const i = lastFunctionIndex(args);
    if (i === -1) return register(...args);
    const label = prefix + (typeof args[0] === "string" ? args[0] : "<anonymous>");
    const fn = args[i];
    args[i] = async (t) => {
      try {
        await fn(t === undefined ? t : context(t, label));
      } catch (err) {
        record(label, err);
        throw err;
      }
      console.log("ok:", label);
    };
    registered++;
    return register(...args);
  };

  const hook = (register, label) => (fn) =>
    register(async (t) => {
      try {
        await fn(t);
      } catch (err) {
        record(label, err);
        throw err;
      }
    });

  try {
    await nodeTest.suite("kanko", () => {
      try {
        const register = require(SUITE);
        if (typeof register !== "function") {
          throw new TypeError(`${SUITE} must export a registration function`);
        }
        register({
          test: instrument(nodeTest.test, ""),
          before: hook(nodeTest.before, "before hook"),
          after: hook(nodeTest.after, "after hook"),
        });
      } catch (err) {
        registrationFailed = true;
        record("suite registration", err);
        throw err;
      }
    });

    if (!registrationFailed && registered === 0) {
      record("suite registration", new Error("the suite registered no tests"));
    }
  } finally {
    process.removeListener("uncaughtException", escaped);
    process.removeListener("unhandledRejection", escaped);
  }

  if (failures.length > 0) {
    throw new Error(`${failures.length} integration check(s) failed: ${failures.join(", ")}`);
  }
};
