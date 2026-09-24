#!/usr/bin/env node
"use strict";

// kanko review simulator: a scripted stand-in for the agent. Talk to it in
// this terminal while it drives kanko in VS Code through the real MCP server
// and dossier service. No model is involved.
//
//   node sim/agent.js                       the bundled retry-backoff tour
//   node sim/agent.js --open                ...and open its repo in VS Code
//   node sim/agent.js --repo . --range main..HEAD   a generated tour of your diff
//   node sim/agent.js --help

const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const { McpClient } = require("../e2e/lib/mcp-client.js");
const { startHeadlessEditor } = require("../e2e/lib/headless-editor.js");
const { c, indent, summarize, renderEditorEvent } = require("../e2e/lib/render.js");
const { listTours, loadTour, autoTour } = require("./lib/tour.js");
const { DEFAULT_ROOT, prepareFixture, useRepository } = require("./lib/workspace.js");
const { SimAgent } = require("./lib/agent.js");

const USAGE = `usage: node sim/agent.js [tour] [options]

Tours: ${listTours().map((t) => t.name).join(", ")} (default: retry-backoff)

  --open               open the tour's workspace in VS Code (runs: code <workspace>)
  --editor <mode>      vscode (default): drive your installed kanko extension
                       headless: no VS Code; highlighted code prints in this terminal
  --text               start as a text tour (no editor calls)
  --repo <path>        generate a tour from a real repository's diff instead
    --range <a>..<b>   committed range to tour (default: main..HEAD)
    --working          tour uncommitted work instead
  --pace beat|stop     pause after every focus, or play a stop's beats in one turn (default)
  --speed <n>|instant  narration speed in characters per second (default 90)
  --wait <seconds>     how long to wait for VS Code before a text tour (default 60)
  --reset              rebuild the fixture repo and discard its dossier
  --dir <path>         simulator state root (default ${DEFAULT_ROOT})
  --list               list bundled tours
  -h, --help           show this help

In the session, type "help" for everything you can say.`;

function parseArgs(argv) {
  const o = { editor: "vscode", pace: "stop", speed: "90", wait: 60, dir: DEFAULT_ROOT };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const v = () => { if (i + 1 >= argv.length) throw new Error(`${a} needs a value`); return argv[++i]; };
    if (a === "--open") o.open = true;
    else if (a === "--editor") o.editor = v();
    else if (a === "--text") o.text = true;
    else if (a === "--repo") o.repo = v();
    else if (a === "--range") o.range = v();
    else if (a === "--working") o.working = true;
    else if (a === "--pace") o.pace = v();
    else if (a === "--speed") o.speed = v();
    else if (a === "--wait") o.wait = Number(v());
    else if (a === "--reset") o.reset = true;
    else if (a === "--dir") o.dir = path.resolve(v());
    else if (a === "--list") o.list = true;
    else if (a === "-h" || a === "--help") o.help = true;
    else if (a.startsWith("-")) throw new Error(`unknown option ${a}`);
    else o.tour = a;
  }
  if (!["vscode", "headless"].includes(o.editor)) throw new Error("--editor must be vscode or headless");
  if (!["beat", "stop"].includes(o.pace)) throw new Error("--pace must be beat or stop");
  return o;
}

// One queue serves both the main prompt and the agent's own questions, so
// piped input and typed input behave the same.
function createInput() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: process.stdin.isTTY });
  const lines = [];
  const waiters = [];
  let closed = false;
  rl.on("line", (line) => (waiters.length ? waiters.shift()(line) : lines.push(line)));
  rl.on("close", () => { closed = true; while (waiters.length) waiters.shift()(null); });
  rl.on("SIGINT", () => rl.close());
  return {
    next(prompt) {
      if (lines.length) { if (!process.stdin.isTTY) process.stdout.write(prompt + lines[0] + "\n"); return Promise.resolve(lines.shift()); }
      if (closed) return Promise.resolve(null);
      rl.setPrompt(prompt);
      rl.prompt();
      return new Promise((resolve) => waiters.push((line) => {
        if (line !== null && !process.stdin.isTTY) process.stdout.write(line + "\n");
        resolve(line);
      }));
    },
    pending: () => lines.length > 0,
    close: () => rl.close(),
  };
}

function createIo(input, { speed, headless }) {
  const io = {
    showTools: true,
    verbose: false,
    cps: speed === "instant" ? 0 : Number(speed) || 90,
    setSpeed(v) { io.cps = v === "instant" ? 0 : Number(v) || io.cps; },
    async type(text) {
      // Stream like a model would; skip the effect for piped runs or when
      // the reviewer has already typed ahead.
      if (!io.cps || !process.stdout.isTTY || input.pending()) { process.stdout.write(text); return; }
      const delay = 1000 / io.cps;
      for (const ch of text) { process.stdout.write(ch); if (ch !== " ") await new Promise((r) => setTimeout(r, delay)); }
    },
    async say(text) {
      const [first, ...rest] = String(text).split("\n");
      await io.type(`\n${c.blue("agent ›")} ${first}${rest.length ? "\n" + indent(rest.join("\n"), "        ") : ""}\n`);
    },
    tool(name, detail) {
      if (io.showTools) console.log(c.dim(`  ⏺ ${name}${detail ? `  ${detail}` : ""}`));
    },
    toolResult(name, isError, value, args) {
      if (isError) { console.log(c.yellow(`    ⎿ ${value?.code}: ${value?.message}`)); return; }
      if (io.verbose) { console.log(c.dim(indent(JSON.stringify({ args, result: value }, null, 2), "    ⎿ "))); return; }
      if (!io.showTools || name === "dossier_get") return;
      const text = name.startsWith("tour_") && !headless ? (name === "tour_status" ? `${value.ideName} · kanko ${value.extensionVersion}` : "ok") : summarize(name, value).split("\n")[0];
      console.log(c.dim(`    ⎿ ${text}`));
    },
    editorEvent(event) { console.log(renderEditorEvent(event)); },
    banner(tour, ws) {
      console.log(`\n${c.bold(c.magenta("kanko simulator"))} ${c.dim("· scripted agent, no model")}`);
      console.log(`${c.bold(tour.title)} ${c.dim(`— ${tour.description || ""}`)}`);
      console.log(c.dim(`workspace ${ws.workspace}${ws.rebuilt ? " (fresh)" : ""}`));
      console.log(c.dim(`type "help" for commands, "states" for the UI state gallery`));
    },
    stopHeader(i, n, stop, cites) {
      console.log(`\n${c.bold(c.magenta(`━━ Stop ${i}/${n} — ${stop.title}`))} ${c.dim(`· ${stop.type}`)}`);
      console.log(c.cyan(`   ${cites}`));
    },
    galleryHeader(state) { console.log(`\n${c.bold(c.yellow(`━━ UI state: ${state.title}`))}`); },
    look(look, tryText) {
      console.log(`${c.yellow("   look ›")} ${look}`);
      if (tryText) console.log(`${c.yellow("   try  ›")} ${tryText}`);
      console.log(c.dim(`   states <n> for another · tour to go back to the review`));
    },
    notice(text) { console.log(c.yellow(indent(text, "  ! "))); },
    hint(text) { console.log(c.dim(`\n  (${text})`)); },
    block(text) { console.log("\n" + text); },
    receipt(md) { console.log("\n" + c.dim(indent(md.trim(), "  │ "))); },
    pause(ms) { return input.pending() ? Promise.resolve() : new Promise((r) => setTimeout(r, ms)); },
    ask(prompt) { return input.next(c.green(prompt)); },
  };
  return io;
}

function hasCode() {
  try { cp.execFileSync(process.platform === "win32" ? "where" : "which", ["code"], { stdio: "ignore" }); return true; } catch { return false; }
}

// Polls tour_status until the kanko extension in some VS Code window owns
// the workspace, or the reviewer presses Enter to continue as a text tour.
async function waitForBridge(client, workspace, input, seconds) {
  const probe = async () => !(await client.callTool("tour_status", { workspace })).isError;
  if (await probe()) return true;
  console.log(c.yellow(`\nWaiting for VS Code with kanko to open:\n  ${workspace}`));
  console.log(c.dim(`Open it with: code "${workspace}"  (or rerun with --open). Press Enter to continue as a text tour.`));
  let skipped = false;
  const skip = input.next("").then(() => { skipped = true; });
  const deadline = Date.now() + seconds * 1000;
  while (!skipped && Date.now() < deadline) {
    await Promise.race([new Promise((r) => setTimeout(r, 1000)), skip]);
    if (!skipped && await probe()) { console.log(c.green("Connected to VS Code. Press Enter to begin.")); await skip; return true; }
  }
  // The Enter listener is still queued; resolve it here so it can't swallow
  // the reviewer's first command.
  if (!skipped) { console.log(c.yellow(`No VS Code after ${seconds}s. Press Enter to continue as a text tour.`)); await skip; }
  return false;
}

async function main() {
  let o;
  try { o = parseArgs(process.argv.slice(2)); } catch (err) { console.error(`${err.message}\n\n${USAGE}`); process.exit(2); }
  if (o.help) return console.log(USAGE);
  if (o.list) {
    for (const t of listTours()) console.log(`${c.bold(t.name.padEnd(16))} ${c.dim(`${t.stops.length} stops · ${t.mode}`)}  ${t.description || ""}`);
    return;
  }

  let tour, ws;
  if (o.repo) {
    const [base, head] = (o.range || "main..HEAD").split("..");
    const stub = { mode: o.working ? "working-tree" : "committed", range: { base: base || "HEAD", head: head || "HEAD" } };
    if (o.working && !o.range) stub.range.base = "HEAD";
    ws = useRepository(o.repo, stub, { root: o.dir });
    tour = await autoTour(ws.workspace, ws.base, ws.head);
    if (tour.truncated) console.log(c.yellow("Large diff: only the first 25 files are in the generated tour."));
  } else {
    tour = loadTour(o.tour || "retry-backoff");
    ws = prepareFixture(tour, { root: o.dir, reset: o.reset });
  }
  fs.mkdirSync(ws.stateDir, { recursive: true });

  const input = createInput();
  const io = createIo(input, { speed: o.speed, headless: o.editor === "headless" });

  let editor = null;
  const env = { TOUR_CHANGES_STATE_DIR: ws.stateDir };
  if (o.editor === "headless") {
    const lockDir = path.join(path.dirname(ws.stateDir), "locks");
    editor = await startHeadlessEditor({ workspace: ws.workspace, lockDir, onEvent: (e) => io.editorEvent(e) });
    env.TOUR_CHANGES_LOCK_DIR = lockDir;
  }
  const client = new McpClient({ cwd: ws.workspace, env });
  await client.initialize();

  if (o.editor === "vscode" && !o.text) {
    if (o.open) {
      if (hasCode()) cp.spawn("code", [ws.workspace], { stdio: "ignore", detached: true }).on("error", () => {}).unref();
      else console.log(c.yellow("The `code` command isn't on your PATH; open the workspace from VS Code instead."));
    }
    await waitForBridge(client, ws.workspace, input, o.wait);
  }

  const agent = new SimAgent({ tour, ws, client, io, textMode: Boolean(o.text), pace: o.pace });
  try {
    await agent.start();
    for (;;) {
      const line = await input.next(`\n${c.green("you ›")} `);
      if (line === null) break;
      try {
        if (await agent.handle(line) === "exit") break;
      } catch (err) {
        io.notice(`simulator error: ${err.message}`);
      }
    }
  } finally {
    await agent.leaveGallery({ silent: true }).catch(() => {});
    input.close();
    await client.close();
    if (editor) await editor.close();
  }
}

main().catch((err) => {
  console.error(c.red(err.stack || err.message));
  process.exit(1);
});
