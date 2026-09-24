"use strict";

const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { McpClient } = require("./mcp-client.js");
const { startHeadlessEditor } = require("./headless-editor.js");
const { buildFixtureRepo, writeTree } = require("./fixture-repo.js");

const EDITOR_MODES = ["headless", "vscode", "none"];
const TEMPLATE = /\{\{\s*([^}]+?)\s*\}\}/g;
const WHOLE_TEMPLATE = /^\{\{\s*([^}]+?)\s*\}\}$/;

class ScenarioError extends Error {}

// ---------------------------------------------------------------------------
// Path expressions: a.b[0].c, list[key=value], list[key~substring]
// ---------------------------------------------------------------------------

function tokenize(expr) {
  const tokens = [];
  let i = 0;
  while (i < expr.length) {
    if (expr[i] === ".") { i++; continue; }
    if (expr[i] === "[") {
      const end = expr.indexOf("]", i);
      if (end === -1) throw new ScenarioError(`unterminated [ in ${expr}`);
      tokens.push({ filter: expr.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }
    let j = i;
    while (j < expr.length && expr[j] !== "." && expr[j] !== "[") j++;
    tokens.push({ key: expr.slice(i, j) });
    i = j;
  }
  return tokens;
}

function lookup(root, expr) {
  let value = root;
  for (const token of tokenize(expr)) {
    if (value === undefined || value === null) break;
    if (token.key !== undefined) { value = value[token.key]; continue; }
    const f = token.filter;
    if (/^-?\d+$/.test(f)) { value = Array.isArray(value) ? value.at(Number(f)) : undefined; continue; }
    const m = /^([\w.]+)\s*(=|~)\s*(.*)$/.exec(f);
    if (!m) throw new ScenarioError(`bad filter [${f}] in ${expr}`);
    const [, key, op, want] = m;
    const items = Array.isArray(value) ? value : Object.values(value);
    value = items.find((item) => {
      const got = lookup(item, key);
      return op === "=" ? String(got) === want : typeof got === "string" && got.includes(want);
    });
  }
  return value;
}

function resolve(ctx, expr) {
  const value = lookup(ctx, expr);
  if (value === undefined) throw new ScenarioError(`template {{ ${expr} }} resolved to nothing`);
  return value;
}

function render(template, ctx) {
  if (typeof template === "string") {
    const whole = WHOLE_TEMPLATE.exec(template);
    if (whole) return structuredClone(resolve(ctx, whole[1]));
    return template.replace(TEMPLATE, (_, expr) => {
      const value = resolve(ctx, expr);
      return typeof value === "string" ? value : JSON.stringify(value);
    });
  }
  if (Array.isArray(template)) return template.map((item) => render(item, ctx));
  if (template && typeof template === "object") {
    return Object.fromEntries(Object.entries(template).map(([k, v]) => [k, render(v, ctx)]));
  }
  return template;
}

// ---------------------------------------------------------------------------
// Tool-argument validation against the server's advertised inputSchema. A
// model generates arguments from these schemas, so a scenario that drifts
// from them is testing a call no model would make.
// ---------------------------------------------------------------------------

function typeOf(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  if (Number.isInteger(value)) return "integer";
  return typeof value;
}

function validateSchema(schema, value, at = "$") {
  if (!schema || typeof schema !== "object") return [];
  if (schema.oneOf) {
    const matches = schema.oneOf.filter((option) => validateSchema(option, value, at).length === 0);
    if (matches.length === 1) return [];
    if (matches.length === 0) {
      // Report against the option whose const discriminator matches, when one does.
      const hinted = schema.oneOf.find((option) => option.properties && Object.entries(option.properties)
        .some(([k, p]) => p.const !== undefined && value && value[k] === p.const));
      return hinted ? validateSchema(hinted, value, at) : [`${at}: matches none of the allowed shapes`];
    }
    return [`${at}: matches ${matches.length} shapes, expected exactly one`];
  }
  const errors = [];
  if (schema.const !== undefined && value !== schema.const) errors.push(`${at}: must be ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${at}: ${JSON.stringify(value)} is not one of ${schema.enum.join(", ")}`);
  if (schema.type) {
    const actual = typeOf(value);
    const ok = schema.type === actual || (schema.type === "number" && actual === "integer");
    if (!ok) return [...errors, `${at}: expected ${schema.type}, got ${actual}`];
  }
  if (typeof value === "number") {
    if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${at}: below minimum ${schema.minimum}`);
  }
  if (typeof value === "string" && schema.pattern && !new RegExp(schema.pattern).test(value)) {
    errors.push(`${at}: ${JSON.stringify(value)} does not match ${schema.pattern}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${at}: needs at least ${schema.minItems} item(s)`);
    if (schema.items) value.forEach((item, i) => errors.push(...validateSchema(schema.items, item, `${at}[${i}]`)));
  }
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const key of schema.required || []) if (!(key in value)) errors.push(`${at}.${key}: required`);
    for (const [key, sub] of Object.entries(schema.properties || {})) {
      if (key in value) errors.push(...validateSchema(sub, value[key], `${at}.${key}`));
    }
    for (const rule of schema.allOf || []) {
      if (rule.if && validateSchema(rule.if, value, at).length === 0 && rule.then) errors.push(...validateSchema(rule.then, value, at));
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Expectations: partial deep match with a few operators.
// ---------------------------------------------------------------------------

function matchValue(expected, actual, at = "$") {
  if (expected && typeof expected === "object" && !Array.isArray(expected)) {
    const ops = Object.keys(expected).filter((k) => k.startsWith("$"));
    if (ops.length) {
      const errors = [];
      for (const op of ops) {
        const want = expected[op];
        if (op === "$exists" && (actual !== undefined) !== want) errors.push(`${at}: expected ${want ? "present" : "absent"}`);
        else if (op === "$len" && (actual?.length ?? Object.keys(actual || {}).length) !== want) errors.push(`${at}: expected length ${want}, got ${actual?.length ?? Object.keys(actual || {}).length}`);
        else if (op === "$contains" && !(typeof actual === "string" ? actual.includes(want) : Array.isArray(actual) && actual.includes(want))) errors.push(`${at}: expected to contain ${JSON.stringify(want)}`);
        else if (op === "$regex" && !(typeof actual === "string" && new RegExp(want).test(actual))) errors.push(`${at}: ${JSON.stringify(actual)} does not match /${want}/`);
        else if (op === "$gte" && !(actual >= want)) errors.push(`${at}: expected >= ${want}, got ${actual}`);
        else if (!["$exists", "$len", "$contains", "$regex", "$gte"].includes(op)) errors.push(`${at}: unknown operator ${op}`);
      }
      return errors;
    }
    if (!actual || typeof actual !== "object") return [`${at}: expected an object, got ${JSON.stringify(actual)}`];
    return Object.entries(expected).flatMap(([k, v]) => matchValue(v, actual[k], `${at}.${k}`));
  }
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return [`${at}: expected an array, got ${JSON.stringify(actual)}`];
    return expected.flatMap((v, i) => matchValue(v, actual[i], `${at}[${i}]`));
  }
  return Object.is(expected, actual) ? [] : [`${at}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`];
}

// ---------------------------------------------------------------------------
// Scenario loading and running
// ---------------------------------------------------------------------------

const SCENARIO_DIR = path.resolve(__dirname, "../scenarios");

function listScenarios(dir = SCENARIO_DIR) {
  return fs.readdirSync(dir).filter((n) => n.endsWith(".json")).sort().map((n) => path.join(dir, n));
}

function loadScenario(nameOrPath) {
  const candidates = [nameOrPath, path.join(SCENARIO_DIR, nameOrPath), path.join(SCENARIO_DIR, `${nameOrPath}.json`)];
  const file = candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
  if (!file) throw new ScenarioError(`scenario not found: ${nameOrPath} (looked in ${SCENARIO_DIR})`);
  const scenario = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!Array.isArray(scenario.steps) || scenario.steps.length === 0) throw new ScenarioError(`${file} has no steps`);
  return { ...scenario, file, name: scenario.name || path.basename(file, ".json") };
}

function stepKind(step) {
  if (step.call) return "call";
  if (step.edit) return "edit";
  return "narrate";
}

function isBridgeTool(name) {
  return typeof name === "string" && name.startsWith("tour_");
}

async function waitForVsCodeLock(lockDir, workspace, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const names = fs.existsSync(lockDir) ? fs.readdirSync(lockDir).filter((n) => n.endsWith(".lock")) : [];
    for (const name of names) {
      try {
        const lock = JSON.parse(fs.readFileSync(path.join(lockDir, name), "utf8"));
        if ((lock.workspaceFolders || []).some((f) => path.resolve(f) === workspace)) return lock;
      } catch { /* a lock mid-write */ }
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new ScenarioError(`no VS Code window with the kanko extension opened ${workspace} within ${timeoutMs / 1000}s`);
}

// Runs one scenario. `hooks` drive interactivity and rendering:
//   beforeStep({ step, index, total, kind, args, ctx }) -> "quit" | "skip" | undefined
//   afterStep({ step, index, outcome, ctx })
//   onEditorEvent(event)
//   onSetup({ repo, root, editor })
async function runScenario(scenario, options = {}) {
  const editorMode = options.editor || "headless";
  if (!EDITOR_MODES.includes(editorMode)) throw new ScenarioError(`unknown editor mode: ${editorMode}`);
  const hooks = options.hooks || {};
  const root = fs.mkdtempSync(path.join(options.tmpDir || os.tmpdir(), "codewalk-e2e-"));
  const repo = buildFixtureRepo(root, scenario.repo || {});
  const stateDir = path.join(root, "state");
  const lockDir = editorMode === "vscode" ? path.join(os.homedir(), ".claude", "tour") : path.join(root, "locks");
  fs.mkdirSync(lockDir, { recursive: true });

  let editor = null;
  if (editorMode === "headless") {
    editor = await startHeadlessEditor({ workspace: repo.workspace, lockDir, onEvent: (e) => hooks.onEditorEvent?.(e) });
  } else if (editorMode === "vscode") {
    cp.spawn("code", ["--new-window", repo.workspace], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
    await waitForVsCodeLock(lockDir, repo.workspace, options.vscodeTimeoutMs || 60000);
  }

  const env = { TOUR_CHANGES_STATE_DIR: stateDir };
  if (editorMode !== "vscode") env.TOUR_CHANGES_LOCK_DIR = lockDir;
  const client = new McpClient({ cwd: repo.workspace, env });

  const ctx = { repo: { workspace: repo.workspace, base: repo.base, head: repo.head, baseName: repo.baseName, headName: repo.headName }, steps: {}, last: null };
  const outcomes = [];
  let failure = null;
  let quit = false;

  hooks.onSetup?.({ repo: ctx.repo, root, stateDir, editor: editorMode });

  try {
    const init = await client.initialize();
    ctx.server = init.serverInfo;
    Object.assign(ctx, render(scenario.vars || {}, ctx));

    for (let index = 0; index < scenario.steps.length; index++) {
      const step = scenario.steps[index];
      const kind = stepKind(step);
      const outcome = { index, id: step.id, kind, call: step.call, status: "passed", errors: [] };
      outcomes.push(outcome);

      if (kind === "call" && editorMode === "none" && isBridgeTool(step.call) && step.call !== "tour_status") {
        outcome.status = "skipped";
        outcome.reason = "text tour: no editor bridge";
        await hooks.afterStep?.({ step, index, outcome, ctx });
        continue;
      }

      let args;
      try {
        args = kind === "call" ? render(step.args || {}, ctx) : undefined;
      } catch (err) {
        outcome.status = "failed";
        outcome.errors.push(err.message);
        failure = outcome;
        await hooks.afterStep?.({ step, index, outcome, ctx });
        break;
      }

      const decision = await hooks.beforeStep?.({ step, index, total: scenario.steps.length, kind, args, ctx });
      if (decision === "quit") { outcome.status = "quit"; quit = true; break; }

      if (kind === "edit") {
        writeTree(repo.workspace, render(step.edit, ctx));
      } else if (kind === "call") {
        outcome.args = args;
        const tool = client.tools.get(step.call);
        if (!tool) {
          outcome.errors.push(`the server does not advertise a tool named ${step.call}`);
        } else if (step.validateArgs !== false) {
          outcome.errors.push(...validateSchema(tool.inputSchema, args).map((e) => `invalid arguments: ${e}`));
        }
        if (outcome.errors.length === 0) {
          const started = Date.now();
          const { isError, value } = await client.callTool(step.call, args);
          outcome.durationMs = Date.now() - started;
          outcome.isError = isError;
          outcome.result = value;

          let expectError = step.expectError;
          let expected = step.match;
          if (editorMode === "none" && step.call === "tour_status") { expectError = "no_bridge"; expected = undefined; }

          if (expectError) {
            if (!isError) outcome.errors.push(`expected error ${expectError}, but the call succeeded`);
            else if (value?.code !== expectError) outcome.errors.push(`expected error ${expectError}, got ${value?.code}: ${value?.message}`);
          } else if (isError) {
            outcome.errors.push(`unexpected error ${value?.code}: ${value?.message}`);
          }
          if (outcome.errors.length === 0 && expected) {
            try { outcome.errors.push(...matchValue(render(expected, ctx), value)); } catch (err) { outcome.errors.push(err.message); }
          }

          if (!isError) {
            if (Number.isInteger(value?.aggregateRevision)) ctx.rev = value.aggregateRevision;
            if (typeof value?.dossierId === "string") ctx.dossierId = value.dossierId;
          }
          ctx.last = value;
          if (step.id) ctx.steps[step.id] = value;
          for (const [name, expr] of Object.entries(step.capture || {})) {
            try { ctx[name] = structuredClone(resolve(value, expr)); } catch (err) { outcome.errors.push(`capture ${name}: ${err.message}`); }
          }
        }
      }

      if (outcome.errors.length) { outcome.status = "failed"; failure = outcome; }
      await hooks.afterStep?.({ step, index, outcome, ctx });
      if (failure) break;
    }
  } finally {
    await client.close();
    if (editor) await editor.close();
    if (!options.keep) fs.rmSync(root, { recursive: true, force: true });
  }

  return {
    name: scenario.name,
    editor: editorMode,
    passed: !failure && !quit,
    quit,
    failure,
    outcomes,
    editorEvents: editor ? editor.events : [],
    root: options.keep ? root : null,
    stateDir: options.keep ? stateDir : null,
    workspace: options.keep ? repo.workspace : null,
    ctx,
  };
}

module.exports = {
  EDITOR_MODES, SCENARIO_DIR, ScenarioError,
  listScenarios, loadScenario, runScenario, render, lookup, validateSchema, matchValue, stepKind,
};
