#!/usr/bin/env node
"use strict";

// Offline end-to-end review harness. Replays a scripted agent's tool calls
// against the real MCP server, with a headless editor (or a real VS Code
// window) on the other side of the bridge. No model is involved.
//
//   node e2e/run.js                        run every scenario
//   node e2e/run.js committed-review --step
//   node e2e/run.js --help

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const { EDITOR_MODES, listScenarios, loadScenario, runScenario } = require("./lib/scenario.js");
const { c, indent, summarize, renderEditorEvent } = require("./lib/render.js");

const HELP = `usage: node e2e/run.js [scenario...] [options]

Scenarios are names from e2e/scenarios/ or paths to scenario JSON files.
With no scenario, every scenario runs.

options:
  --step             pause before every step (enter: run, c: continue, a: args, r: last result, q: quit)
  --break <target>   run without pausing until the target, then step; a target is a
                     1-based step number, a step id, a tool name, or a tour stop id
  --editor <mode>    headless (default), vscode (drive a real VS Code window), none (text tour)
  --verbose, -v      print full arguments and results
  --keep             keep the fixture repo and dossier state, and print their paths
  --transcript <f>   write a Markdown transcript of the review
  --list             list scenarios and exit
  --help, -h         show this help`;

function parseArgs(argv) {
  const opts = { scenarios: [], editor: "headless", step: false, verbose: false, keep: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${a} needs a value`);
      return argv[++i];
    };
    if (a === "--step") opts.step = true;
    else if (a === "--break") opts.breakAt = value();
    else if (a === "--editor") opts.editor = value();
    else if (a.startsWith("--editor=")) opts.editor = a.slice(9);
    else if (a === "--verbose" || a === "-v") opts.verbose = true;
    else if (a === "--keep") opts.keep = true;
    else if (a === "--transcript") opts.transcript = value();
    else if (a === "--list") opts.list = true;
    else if (a === "--help" || a === "-h") opts.help = true;
    else if (a.startsWith("-")) throw new Error(`unknown option ${a}`);
    else opts.scenarios.push(a);
  }
  if (!EDITOR_MODES.includes(opts.editor)) throw new Error(`--editor must be one of ${EDITOR_MODES.join(", ")}`);
  return opts;
}

function createPrompter() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const lines = [];
  const waiters = [];
  rl.on("line", (line) => (waiters.length ? waiters.shift()(line) : lines.push(line)));
  rl.on("close", () => { while (waiters.length) waiters.shift()("q"); });
  return {
    ask(question) {
      process.stdout.write(question);
      return new Promise((resolve) => (lines.length ? resolve(lines.shift()) : waiters.push(resolve)));
    },
    close: () => rl.close(),
  };
}

async function runOne(scenario, opts, prompter) {
  const transcript = [`# ${scenario.name}`, "", scenario.description || "", ""];
  let stepping = opts.step && !opts.breakAt;
  let pendingEvents = [];
  let lastResult;

  // A break target is a 1-based step number, a step id, a tool name (first
  // call to it), or a tour stop id (the tour_stop call that opens it).
  const matchesBreak = (step, index, args) => opts.breakAt !== undefined && (
    String(index + 1) === String(opts.breakAt) || step.id === opts.breakAt || step.call === opts.breakAt ||
    (step.call === "tour_stop" && args?.stopId === opts.breakAt));

  console.log(`\n${c.bold(`▶ ${scenario.name}`)}${scenario.description ? c.dim(` — ${scenario.description}`) : ""}`);

  const hooks = {
    onSetup({ repo, root, stateDir, editor }) {
      console.log(c.dim(`  editor ${editor} · base ${repo.base.slice(0, 7)} (${repo.baseName}) · head ${repo.head.slice(0, 7)} (${repo.headName})`));
      if (opts.keep) console.log(c.dim(`  workspace ${repo.workspace}\n  state     ${stateDir}\n  root      ${root}`));
    },
    onEditorEvent(event) { pendingEvents.push(event); },
    async beforeStep({ step, index, total, kind, args }) {
      if (matchesBreak(step, index, args)) stepping = true;
      const label = kind === "call" ? c.bold(step.call) : kind === "edit" ? c.bold(c.yellow("edit workspace")) : c.dim("narration");
      if (kind === "call" || stepping || step.say || step.reviewer) console.log(`\n${c.dim(`[${index + 1}/${total}]`)} ${label}${step.id ? c.dim(` #${step.id}`) : ""}`);
      if (step.reviewer) console.log(`  ${c.green("reviewer ›")} ${step.reviewer}`);
      if (step.say) console.log(`  ${c.blue("agent ›")} ${step.say}`);
      if (kind === "edit") console.log(indent(Object.keys(step.edit).join("\n"), `  ${c.yellow("✎")} `));
      if (opts.verbose && args) console.log(c.dim(indent(JSON.stringify(args, null, 2))));
      if (step.reviewer) transcript.push(`> **Reviewer:** ${step.reviewer}`, "");
      if (step.say) transcript.push(`**Agent:** ${step.say}`, "");
      if (kind === "edit") transcript.push(`_Workspace edited: ${Object.keys(step.edit).join(", ")}_`, "");
      while (stepping && prompter) {
        const answer = (await prompter.ask(c.dim("  ⏎ run · c continue · a args · r last result · q quit › "))).trim().toLowerCase();
        if (answer === "q") return "quit";
        if (answer === "c") { stepping = false; break; }
        if (answer === "a") { console.log(indent(JSON.stringify(args ?? step.edit ?? null, null, 2))); continue; }
        if (answer === "r") { console.log(indent(JSON.stringify(lastResult ?? null, null, 2))); continue; }
        break;
      }
      return undefined;
    },
    afterStep({ step, outcome }) {
      if (outcome.kind === "call") {
        lastResult = outcome.result;
        if (outcome.status === "skipped") {
          console.log(c.dim(`  ○ skipped ${step.call} (${outcome.reason})`));
          transcript.push(`_${step.call} skipped: ${outcome.reason}_`, "");
        } else if (outcome.result !== undefined) {
          const mark = outcome.status === "passed" ? c.green("✓") : c.red("✗");
          const text = outcome.isError ? c.yellow(`error ${outcome.result.code}: ${outcome.result.message}`) : summarize(step.call, outcome.result);
          console.log(`  ${mark} ${c.dim(`${outcome.durationMs}ms`)} ${indent(text, "    ").trimStart()}`);
          if (opts.verbose) console.log(c.dim(indent(JSON.stringify(outcome.result, null, 2))));
          transcript.push("```json", JSON.stringify({ tool: step.call, arguments: outcome.args }, null, 2), "```", "", outcome.isError ? `→ error \`${outcome.result.code}\`: ${outcome.result.message}` : `→ ${summarize(step.call, outcome.result).replace(/\n/g, "  \n")}`, "");
        }
      }
      for (const event of pendingEvents) {
        console.log(renderEditorEvent(event));
        if (event.kind === "stop" || event.kind === "focus") {
          for (const h of event.kind === "stop" ? event.highlights : [event]) {
            transcript.push(`\`${h.path}:${h.startLine}-${h.endLine}\` (${h.side})${h.note ? ` — ${h.note}` : ""}`, "", "```", ...h.lines.map((l) => `${String(l.line).padStart(4)}  ${l.text}`), "```", "");
          }
        }
      }
      pendingEvents = [];
      for (const error of outcome.errors) console.log(`  ${c.red("✗")} ${error}`);
    },
  };

  const result = await runScenario(scenario, { editor: opts.editor, keep: opts.keep || opts.editor === "vscode", hooks });
  const counts = result.outcomes.reduce((acc, o) => ({ ...acc, [o.status]: (acc[o.status] || 0) + 1 }), {});
  const verdict = result.passed ? c.green("PASS") : result.quit ? c.yellow("QUIT") : c.red("FAIL");
  console.log(`\n${verdict} ${scenario.name} · ${Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(", ")}${result.failure ? ` · failed at step ${result.failure.index + 1}${result.failure.id ? ` #${result.failure.id}` : ""}` : ""}`);
  if (result.root) console.log(c.dim(`  kept ${result.root}`));
  transcript.push("---", "", `**Result:** ${result.passed ? "pass" : result.quit ? "quit" : `fail at step ${result.failure.index + 1}: ${result.failure.errors.join("; ")}`}`, "");
  return { result, transcript: transcript.join("\n") };
}

async function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (err) { console.error(`${err.message}\n\n${HELP}`); process.exit(2); }
  if (opts.help) { console.log(HELP); return; }
  if (opts.list) {
    for (const file of listScenarios()) {
      const s = loadScenario(file);
      console.log(`${c.bold(s.name.padEnd(22))} ${c.dim(`${s.steps.length} steps`)}  ${s.description || ""}`);
    }
    return;
  }

  const scenarios = (opts.scenarios.length ? opts.scenarios : listScenarios()).map(loadScenario);
  const interactive = opts.step || opts.breakAt !== undefined;
  if (interactive && !process.stdin.isTTY) console.log(c.dim("stdin is not a terminal; step prompts will read piped input."));
  const prompter = interactive ? createPrompter() : null;
  const transcripts = [];
  let failed = 0;
  try {
    for (const scenario of scenarios) {
      const { result, transcript } = await runOne(scenario, opts, prompter);
      transcripts.push(transcript);
      if (!result.passed) failed++;
      if (result.quit) break;
    }
  } finally {
    prompter?.close();
  }
  if (opts.transcript) {
    fs.mkdirSync(path.dirname(path.resolve(opts.transcript)), { recursive: true });
    fs.writeFileSync(opts.transcript, transcripts.join("\n\n"));
    console.log(c.dim(`transcript written to ${opts.transcript}`));
  }
  process.exitCode = failed ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
