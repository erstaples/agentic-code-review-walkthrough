"use strict";

const cp = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { STATES } = require("./states.js");

const OUTCOMES = ["ready-to-approve", "changes-requested", "deferred", "informational-only"];
const CITATION = /([\w.\/-]+\.[\w]+):(\d+)(?:-(\d+))?(?:\s*\[(base|head)@([0-9a-f]{4,40})\])?/;

const HELP = `Talk to it like the real agent. Anything that isn't a command is a question.

  next, n, ⏎          acknowledge this stop and move on (or play the next beat)
  back, go <n|id>     revisit a stop; again replays the current one
  skip                mark this stop skipped and move on
  concern <text>      record a concern on this stop
  src/a.js:3-7 ...    paste a kanko citation (Copy Citation) to point at code
  focus <path>:<a>[-<b>] [base|head|working] [note]   point anywhere
  agenda, status      the plan with review states; bridge and dossier health
  states              UI state gallery: companion, seam, stale, deferred, …
  tour                leave the gallery and return to the current stop
  pace beat|stop      pause after every focus, or play a stop's beats in one turn
  speed <n>|instant   narration speed in characters per second
  text on|off         pretend the bridge is gone (text tour with citations)
  tools on|off, verbose on|off   show tool calls / full JSON
  finish              close out: roll-up, outcome, receipt
  pause               pause the review session and exit (resume next run)
  quit                exit without pausing`;

class SimAgent {
  constructor({ tour, ws, client, io, textMode = false, pace = "stop", beatDelayMs = 900 }) {
    Object.assign(this, { tour, ws, client, io, textMode, pace, beatDelayMs });
    this.actor = { kind: "agent", id: "kanko-sim", displayName: "kanko simulator" };
    this.reviewer = { kind: "reviewer", id: os.userInfo().username || "reviewer" };
    this.selection = tour.mode === "working-tree"
      ? { kind: "working-tree" }
      : { kind: "committed", base: ws.base.sha, head: ws.head.sha };
    this.stopMode = tour.mode === "working-tree" ? "file" : "diff";
    this.current = 0;
    this.beat = 0;
    this.concernsThisStop = 0;
    this.gallery = null;
    this.bridgeUp = false;
  }

  get stops() { return this.tour.stops; }
  get stop() { return this.stops[this.current]; }

  // ------------------------------------------------------------------ tools

  async call(name, args, { quiet = false } = {}) {
    if (name.startsWith("tour_") && name !== "tour_status" && (this.textMode || !this.bridgeUp)) return { skipped: true };
    const full = { workspace: this.ws.workspace, ...args };
    if (!quiet) this.io.tool(name, describeCall(name, full));
    const { isError, value } = await this.client.callTool(name, full);
    if (!quiet) this.io.toolResult(name, isError, value, full);
    if (!isError && Number.isInteger(value?.aggregateRevision)) this.rev = value.aggregateRevision;
    if (isError) return { error: value };
    return value;
  }

  async apply(commands, { retryOnDrift = true } = {}) {
    const result = await this.call("dossier_apply", { dossierId: this.dossierId, expectedRevision: this.rev, actor: this.actor, commands });
    if (result.error?.code === "stale_change" && retryOnDrift) {
      await this.handleDrift();
      return this.apply(commands, { retryOnDrift: false });
    }
    if (result.error?.code === "revision_conflict" && retryOnDrift) {
      // Another writer (a second simulator, a real agent) moved the dossier.
      this.rev = (await this.get({ kind: "overview" })).aggregateRevision;
      return this.apply(commands, { retryOnDrift: false });
    }
    return result;
  }

  get(selector) {
    return this.call("dossier_get", { dossierId: this.dossierId, selector }, { quiet: true });
  }

  // ------------------------------------------------------------------ start

  async start() {
    const { tour, ws, io } = this;
    io.banner(tour, ws);
    await io.say(`Touring ${ws.base.name}..${ws.head.name}${tour.mode === "working-tree" ? " (uncommitted work, including untracked files)" : ""}. Pinned ${short(ws.base.sha)}..${short(ws.head.sha)}.`);

    const opened = await this.call("dossier_open", { selection: this.selection, actor: this.actor, title: tour.title });
    if (opened.error) throw new Error(`dossier_open failed: ${opened.error.message}`);
    let next = opened.requiredNextAction;
    if (next === "refresh") {
      this.dossierId = opened.relatedDossierId;
      this.rev = opened.relatedAggregateRevision;
      await io.say("There's an earlier dossier for this work, but the code has changed since. Refreshing it instead of carrying old review state forward.");
      await this.refresh();
      next = (await this.get({ kind: "overview" })).requiredNextAction;
    } else {
      this.dossierId = opened.dossierId;
    }

    await this.preflight();

    if (next === "prepare") {
      await this.prepare();
      await this.startSession();
    } else if (next === "resume") {
      await this.resume();
    } else {
      const recap = await this.get({ kind: "recap" });
      await io.say(`A previous review of this exact change finished (${recap.session?.outcome}). Starting a new review session over the same dossier.`);
      await this.startSession();
    }
    await this.presentStop(this.current);
  }

  async preflight() {
    const status = await this.call("tour_status", {}, { quiet: true });
    this.bridgeUp = !status.error;
    if (this.bridgeUp) {
      this.io.tool("tour_status", "");
      this.io.toolResult("tour_status", false, status);
    } else if (!this.textMode) {
      this.io.notice(`No kanko bridge for ${this.ws.workspace}: ${status.error.message}\nRunning as a text tour. Open that folder in VS Code and type "status" to reconnect.`);
    }
  }

  async prepare() {
    const { tour, io } = this;
    await io.say("Reading the full changed files and recording what I'll claim, so the review has something to check against.");
    const provenance = [{ kind: "model-inferred", source: { type: "code-inspection", path: tour.stops[0].files[0].path }, inferenceExplanation: "Scripted by the kanko simulator." }];
    const commands = [{ type: "SetThesis", thesis: { summary: tour.thesis, provenance } }];
    const kinds = { claims: "AddClaim", decisions: "AddDecision", risks: "AddRisk", evidence: "AddEvidence", requirements: "AddRequirement" };
    const field = { claims: "claim", decisions: "decision", risks: "risk", evidence: "evidence", requirements: "requirement" };
    for (const [collection, items] of Object.entries(tour.entities)) {
      for (const { key, ...rest } of items) commands.push({ type: kinds[collection], [field[collection]]: { ...rest, provenance } });
    }
    await this.apply(commands);

    const ids = {};
    for (const collection of Object.keys(tour.entities)) {
      const { entities } = await this.get({ kind: "entities", type: collection });
      for (const item of tour.entities[collection]) {
        const text = item.statement || item.chosen || item.concern || item.observation;
        const match = entities.find((e) => (e.statement || e.chosen || e.concern || e.observation) === text);
        if (match) ids[item.key] = match.id;
      }
    }
    const stops = tour.stops.map((s) => ({ id: s.id, title: s.title, type: s.type, coveredEntityIds: s.covers.map((k) => ids[k]).filter(Boolean) }));
    await this.apply([{ type: "CreateTourPlan", title: tour.title, stops }, { type: "MarkPrepared" }]);
    await this.briefing();
  }

  async briefing() {
    const overview = await this.get({ kind: "overview" });
    const plan = (await this.get({ kind: "tour" })).plan;
    const lines = plan.stops.map((s) => `  ${String(s.index).padStart(2)}. ${s.title.padEnd(42)} ${s.type}${s.type === "risk" ? " ⚠" : ""}`);
    const evidence = Object.entries(overview.evidenceFreshness).map(([k, v]) => `${v} ${k}`).join(", ") || "none";
    await this.io.say(`${this.tour.thesis}\n\n${lines.join("\n")}\n\nClaims: ${fmtCounts(overview.claimDispositions)} · risks: ${fmtCounts(overview.riskDispositions) || "none"} · evidence: ${evidence}.${this.tour.generated ? "\nThis tour was generated from the diff, so every rationale is reconstructed." : ""}`);
  }

  async startSession() {
    await this.apply([{ type: "StartReviewSession", reviewer: this.reviewer }]);
    const tour = await this.get({ kind: "tour" });
    this.sessionId = tour.sessions.find((s) => s.state === "in_progress").id;
    this.current = 0;
  }

  async resume() {
    const recap = await this.get({ kind: "recap" });
    this.sessionId = recap.session.id;
    const done = recap.completedStops.length;
    await this.io.say(`Resuming your review from the dossier, not from chat history: ${done} of ${done + recap.remainingStops.length} stops done, ${recap.openItems.questions.length} open question(s), ${recap.openItems.concerns.length} concern(s). Change is ${recap.freshness}.`);
    if (recap.session.state === "paused") await this.apply([{ type: "ResumeReviewSession", sessionId: this.sessionId }]);
    const firstRemaining = recap.remainingStops[0];
    const index = firstRemaining ? this.stops.findIndex((s) => s.id === firstRemaining.id) : this.stops.length - 1;
    this.current = Math.max(0, index);
  }

  // ------------------------------------------------------------------ drift

  async handleDrift() {
    await this.io.say("The code changed under us, so I'm not recording review state against stale bytes. Checking the dossier.");
    await this.call("dossier_check", { dossierId: this.dossierId });
    await this.refresh();
  }

  async refresh() {
    const result = await this.call("dossier_refresh", { dossierId: this.dossierId, expectedRevision: this.rev, selection: this.selection, actor: this.actor });
    if (result.error || !result.changed) return;
    const d = result.structuralDelta;
    const delta = [["modified", d.modified], ["added", d.added], ["removed", d.removed]].filter(([, v]) => v.length).map(([k, v]) => `${k} ${v.join(", ")}`).join("; ");
    const invalid = result.invalidationPlan.invalidatedStops.map((id) => this.stops.find((s) => s.id === id)?.title || id);
    await this.io.say(`Refreshed: ${delta || "no structural change"}. ${invalid.length ? `Invalidated ${invalid.join(", ")}, because they were reviewed against the old bytes.` : "No reviewed stops needed invalidating."}${result.invalidationPlan.staleEvidence.length ? ` ${result.invalidationPlan.staleEvidence.length} evidence item(s) are now stale.` : ""}`);
  }

  // ------------------------------------------------------------------ stops

  bridgeFiles(stop) {
    return stop.files.map((f) => ({ path: f.path, ranges: f.ranges }));
  }

  citations(stop) {
    return stop.files.map((f) => {
      const spans = f.ranges.map((r) => `${r.startLine === r.endLine ? r.startLine : `${r.startLine}-${r.endLine}`}${r.side === "base" ? " (base)" : ""}`);
      return `${f.path}:${spans.join(", ")}`;
    }).join(" · ");
  }

  async presentStop(index, { record = true } = {}) {
    this.current = index;
    this.beat = 0;
    this.concernsThisStop = 0;
    const stop = this.stop;
    if (record) await this.apply([{ type: "StartStop", sessionId: this.sessionId, stopId: stop.id }]);
    this.io.stopHeader(index + 1, this.stops.length, stop, this.citations(stop));
    const opened = await this.call("tour_stop", {
      stopId: stop.id, index: index + 1, total: this.stops.length, label: stop.title, type: stop.type,
      mode: this.stopMode, base: this.ws.base, head: this.ws.head, files: this.bridgeFiles(stop),
    });
    if (opened.error) await this.io.say(`The editor refused this stop (${opened.error.code}); continuing with citations only.`);
    else if (opened.deferred?.length) this.io.notice(`Not highlighted yet (the diff editor materializes on scroll): ${opened.deferred.map((d) => `${d.path} (${d.side})`).join(", ")}`);
    if (stop.intro) await this.io.say(stop.intro);
    await this.playBeats();
    this.io.hint(this.beat < stop.beats.length ? "next beat: next · or ask about it" : "next · back · ask a question · concern <text> · states · finish");
  }

  async playBeats() {
    const beats = this.stop.beats;
    while (this.beat < beats.length) {
      await this.playBeat(beats[this.beat++]);
      if (this.pace === "beat") break;
      if (this.beat < beats.length) await this.io.pause(this.beatDelayMs);
    }
  }

  async playBeat(beat) {
    if (beat.focus) {
      const { path: p, side, startLine, endLine, note } = beat.focus;
      const result = await this.call("tour_focus", { path: p, side, startLine, endLine, ...(note ? { note } : {}) });
      if (result.error) await this.io.say(`(The editor rejected that focus: ${result.error.message})`);
      if (this.textMode || !this.bridgeUp) {
        await this.io.say(`${p}:${startLine === endLine ? startLine : `${startLine}-${endLine}`}${side === "base" ? " (base)" : ""} — ${beat.say}`);
        return;
      }
    }
    await this.io.say(beat.say);
  }

  async acknowledge(state) {
    const stop = this.stop;
    const reviewState = state || (this.concernsThisStop ? "reviewed-with-concern" : "reviewed");
    const commands = [{ type: "SetStopReviewState", sessionId: this.sessionId, stopId: stop.id, reviewState }];
    if (reviewState === "reviewed") {
      const plan = (await this.get({ kind: "tour" })).plan;
      const covered = plan.stops.find((s) => s.id === stop.id)?.coveredEntityIds || [];
      for (const id of covered.filter((x) => x.startsWith("clm_"))) commands.push({ type: "SetClaimDisposition", claimId: id, disposition: "supported", rationale: "Reviewer acknowledged the stop." });
    }
    await this.apply(commands);
  }

  async advance() {
    if (this.beat < this.stop.beats.length) {
      await this.playBeats();
      if (this.beat < this.stop.beats.length) this.io.hint("next beat: next");
      else this.io.hint("next · back · ask a question · concern <text> · finish");
      return;
    }
    await this.acknowledge();
    if (this.current + 1 < this.stops.length) return this.presentStop(this.current + 1);
    return this.revisitOrFinish();
  }

  // Drift can invalidate stops the reviewer already passed. Send them back
  // through those before offering a closeout, as a real agent would.
  async revisitOrFinish() {
    const recap = await this.get({ kind: "recap", sessionId: this.sessionId });
    const pending = recap.remainingStops.filter((s) => s.reviewState === "invalidated" || s.reviewState === "not-visited");
    if (pending.length === 0) return this.finish();
    const index = this.stops.findIndex((s) => s.id === pending[0].id);
    await this.io.say(`Before closing out: ${pending.map((s) => `"${s.title}" (${s.reviewState})`).join(", ")} still ${pending.length === 1 ? "needs" : "need"} review. Going back to stop ${index + 1}. Say "finish" to close out anyway.`);
    return this.presentStop(index);
  }

  async go(target) {
    const t = target.trim().toLowerCase();
    let index = /^\d+$/.test(t) ? Number(t) - 1 : this.stops.findIndex((s) => s.id === t);
    if (index < 0) index = this.stops.findIndex((s) => s.title.toLowerCase().includes(t));
    if (index < 0 || index >= this.stops.length) return this.io.say(`There's no stop "${target}". Type "agenda" to see them.`);
    await this.presentStop(index);
  }

  // ------------------------------------------------------------------ talk

  async answer(question) {
    const q = question.toLowerCase();
    const score = (entry) => entry.keywords.filter((k) => q.includes(k.toLowerCase())).length;
    const ranked = [...this.stop.qa.map((e) => ({ e, s: score(e) + 0.5 })), ...this.tour.qa.map((e) => ({ e, s: score(e) }))]
      .filter((x) => x.s >= 1).sort((a, b) => b.s - a.s);
    const best = ranked[0]?.e;
    if (!best) {
      await this.io.say(`I don't have a scripted answer for that. A real agent would read the code to answer it. I've recorded it as an open question, so it will show up at closeout.`);
      await this.apply([{ type: "RecordQuestion", question: { question, relatedEntityIds: [], provenance: this.reviewerSaid() } }]);
      return;
    }
    if (best.focus) {
      const { path: p, side, startLine, endLine, note } = best.focus;
      await this.call("tour_focus", { path: p, side, startLine, endLine, ...(note ? { note } : {}) });
    }
    await this.io.say(best.answer);
    if (best.record) {
      await this.apply([{ type: "RecordQuestion", question: { question, provenance: this.reviewerSaid() } }]);
      const open = await this.get({ kind: "open-items" });
      const recorded = open.questions.find((x) => x.question === question);
      if (recorded) await this.apply([{ type: "RecordAnswer", questionId: recorded.id, answer: best.answer, disposition: "answered", provenance: [{ kind: "repository-observed", source: { type: "code-inspection", path: best.focus?.path || this.stop.files[0].path } }] }]);
    }
  }

  reviewerSaid() {
    return [{ kind: "reviewer-stated", source: { type: "review-session", id: this.sessionId } }];
  }

  async concern(text) {
    await this.apply([{ type: "RecordConcern", concern: { concern: text, provenance: this.reviewerSaid() } }]);
    this.concernsThisStop++;
    await this.io.say(`Recorded as a concern on "${this.stop.title}". The stop will be marked reviewed-with-concern when you move on.`);
  }

  readLines(relPath, side, startLine, endLine) {
    try {
      const text = side === "working" || this.ws.head.sha === "WORKTREE" && side !== "base"
        ? fs.readFileSync(path.join(this.ws.workspace, relPath), "utf8")
        : cp.execFileSync("git", ["show", `${side === "base" ? this.ws.base.sha : this.ws.head.sha}:./${relPath}`], { cwd: this.ws.workspace, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      return text.split("\n").slice(startLine - 1, endLine);
    } catch { return null; }
  }

  async citation(input, m) {
    const [, p, a, b, side] = m;
    const startLine = Number(a);
    const endLine = Number(b || a);
    const resolved = side || (this.ws.head.sha === "WORKTREE" ? "working" : this.readLines(p, "head", startLine, endLine) ? "head" : "base");
    const lines = this.readLines(p, resolved, startLine, endLine);
    if (!lines) return this.io.say(`I can't find ${p}:${startLine} on the ${resolved} side of this change.`);
    await this.call("tour_focus", { path: p, side: resolved, startLine, endLine, note: "you asked about this" });
    const rest = input.replace(m[0], "").trim();
    await this.io.say(`You're pointing at ${p}:${startLine === endLine ? startLine : `${startLine}-${endLine}`} (${resolved}):\n${lines.map((l) => `    ${l}`).join("\n")}`);
    // Prefer whatever the tour already says about these exact lines: a Q&A
    // anchored there, then the narration of a beat that focused them.
    const overlaps = (f) => f && f.path === p && (!side || f.side === resolved) && f.startLine <= endLine && f.endLine >= startLine;
    const everyStop = [this.stop, ...this.stops.filter((s) => s !== this.stop)];
    const qa = everyStop.flatMap((s) => s.qa).concat(this.tour.qa).find((e) => overlaps(e.focus));
    const beat = everyStop.flatMap((s) => s.beats).find((b) => overlaps(b.focus));
    if (qa) await this.io.say(qa.answer);
    else if (beat) await this.io.say(beat.say);
    else if (rest.length > 2) await this.answer(rest);
  }

  async adhocFocus(spec) {
    const m = /^(\S+?):(\d+)(?:-(\d+))?(?:\s+(base|head|working))?(?:\s+(.+))?$/.exec(spec.trim());
    if (!m) return this.io.say("Usage: focus <path>:<start>[-<end>] [base|head|working] [note]");
    const [, p, a, b, side, note] = m;
    const resolved = side || (this.ws.head.sha === "WORKTREE" ? "working" : "head");
    const result = await this.call("tour_focus", { path: p, side: resolved, startLine: Number(a), endLine: Number(b || a), ...(note ? { note } : {}) });
    if (result.error) await this.io.say(`The editor refused: ${result.error.code}. ${result.error.message}`);
  }

  // ------------------------------------------------------------------ views

  async agenda() {
    const plan = (await this.get({ kind: "tour" })).plan;
    const mark = { "not-visited": "·", presented: "▸", reviewed: "✓", "reviewed-with-concern": "!", skipped: "↷", blocked: "✗", invalidated: "↺" };
    this.io.block(plan.stops.map((s, i) => `${i === this.current ? "→" : " "} ${mark[s.reviewState] || "?"} ${s.index}. ${s.title}  (${s.reviewState})`).join("\n"));
  }

  async status() {
    const wasUp = this.bridgeUp;
    await this.preflight();
    const overview = await this.get({ kind: "overview" });
    const bridge = this.bridgeUp ? (this.textMode ? "connected, but text mode is on" : "connected") : "not connected (text tour)";
    const status = this.bridgeUp ? await this.call("tour_status", {}, { quiet: true }) : null;
    this.io.block([
      `bridge     ${bridge}${status?.ideName ? ` · ${status.ideName} ${status.extensionVersion}` : ""}`,
      ...(status?.deferred?.length ? [`deferred   ${status.deferred.map((d) => `${d.path} (${d.side})`).join(", ")}`] : []),
      `dossier    ${this.dossierId} · rev ${overview.aggregateRevision} · ${overview.phase} · change ${overview.freshness}`,
      `stops      ${fmtCounts(overview.stopStates)}`,
      `claims     ${fmtCounts(overview.claimDispositions)}`,
      `workspace  ${this.ws.workspace}`,
      `state dir  ${this.ws.stateDir}`,
    ].join("\n"));
    if (!wasUp && this.bridgeUp && !this.textMode) {
      await this.io.say("VS Code is connected now. Showing this stop in the editor.");
      await this.presentStop(this.current, { record: false });
    }
  }

  // ------------------------------------------------------------------ gallery

  async states(arg) {
    const available = STATES.filter((s) => !s.requires || s.requires === this.tour.mode);
    if (!arg) {
      this.io.block([
        "UI state gallery: each one puts VS Code into a specific kanko state.",
        ...available.map((s, i) => `  ${String(i + 1).padStart(2)}. ${s.key.padEnd(14)} ${s.title}`),
        "",
        "Type: states <n|name>. Type \"tour\" to return to the review.",
      ].join("\n"));
      return;
    }
    const state = available.find((s, i) => String(i + 1) === arg || s.key === arg);
    if (!state) return this.io.say(`No state "${arg}". Type "states" for the list.`);
    if (!this.bridgeUp && !state.textOnly) return this.io.say("The gallery needs the VS Code bridge (or --editor headless). Type \"status\" after opening the workspace.");
    await this.leaveGallery({ silent: true });
    this.gallery = { key: state.key, cleanup: [] };
    this.io.galleryHeader(state);
    try {
      await state.run(this);
    } catch (err) {
      await this.io.say(`Couldn't set up that state: ${err.message}`);
    }
    if (state.look) this.io.look(state.look, state.try);
  }

  writeSettings(settings) {
    if (!this.ws.fixture) {
      this.io.notice("Settings are only written for the simulator's own fixture repos, never your repository. Set this in VS Code yourself:\n" + JSON.stringify(settings, null, 2));
      return false;
    }
    const dir = path.join(this.ws.workspace, ".vscode");
    const file = path.join(dir, "settings.json");
    if (!settings || Object.keys(settings).length === 0) {
      fs.rmSync(file, { force: true });
      return true;
    }
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(settings, null, 2) + "\n");
    this.io.tool("settings", `.vscode/settings.json ${Object.entries(settings).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(" ")}`);
    return true;
  }

  async leaveGallery({ silent = false } = {}) {
    if (!this.gallery) return false;
    for (const undo of this.gallery.cleanup.reverse()) await undo();
    this.gallery = null;
    if (this.ws.fixture) this.writeSettings(null);
    if (!silent) {
      await this.call("tour_clear", {});
      await this.io.say("Back to the tour.");
      await this.presentStop(this.current, { record: false });
    }
    return true;
  }

  // ------------------------------------------------------------------ closeout

  async finish() {
    const { io } = this;
    await this.leaveGallery({ silent: true });
    const recap = await this.get({ kind: "recap", sessionId: this.sessionId });
    const lines = [
      `Reviewed ${recap.completedStops.length} of ${recap.completedStops.length + recap.remainingStops.length} stops${recap.remainingStops.length ? ` (not reviewed: ${recap.remainingStops.map((s) => s.title).join(", ")})` : ""}.`,
      ...recap.openItems.concerns.map((c) => `  ! concern: ${c.concern}`),
      ...recap.openItems.questions.map((q) => `  ? open question: ${q.question}`),
      ...recap.openItems.risks.map((r) => `  ⚠ open risk: ${r.concern || r.statement}`),
    ];
    await io.say(`${this.tour.closing || ""}\n\n${lines.join("\n")}`);
    io.block(OUTCOMES.map((o, i) => `  ${i + 1}. ${o}`).join("\n"));
    let outcome = null;
    while (!outcome) {
      const reply = await io.ask("How do you want to close this review? (1-4, or \"cancel\") ");
      if (reply === null || /^(cancel|back|quit|exit|no?)$/i.test(reply.trim())) { await io.say("Not closing. Carry on."); return undefined; }
      outcome = OUTCOMES[Number(reply.trim()) - 1] || OUTCOMES.find((o) => o.startsWith(reply.trim().toLowerCase()));
    }
    await this.apply([{ type: "CompleteReviewSession", sessionId: this.sessionId, outcome }]);
    const preview = await this.call("dossier_receipt", { dossierId: this.dossierId, sessionId: this.sessionId, mode: "preview", actor: this.actor }, { quiet: true });
    if (!preview.error) io.receipt(preview.markdown);
    const save = await io.ask("Save this receipt locally? (y/N) ");
    if (save && /^y/i.test(save.trim())) {
      const emitted = await this.call("dossier_receipt", { dossierId: this.dossierId, sessionId: this.sessionId, mode: "emit", expectedRevision: this.rev, actor: this.actor });
      if (!emitted.error) await io.say(`Saved. Nothing was published.\n  ${emitted.markdownPath}\n  ${emitted.jsonPath}`);
    }
    await this.call("tour_clear", {});
    await io.say("Tour complete. Run the same command again to start a fresh review session, or add --reset to start over.");
    return "exit";
  }

  async pause() {
    await this.leaveGallery({ silent: true });
    await this.apply([{ type: "PauseReviewSession", sessionId: this.sessionId }]);
    await this.call("tour_clear", {});
    await this.io.say("Paused. The dossier remembers where you are; run the same command to resume.");
    return "exit";
  }

  // ------------------------------------------------------------------ input

  async handle(raw) {
    const input = raw.trim();
    const cmd = input.replace(/^[:/]/, "").toLowerCase();
    const arg = (re) => { const m = re.exec(input.replace(/^[:/]/, "")); return m && m[1]; };
    let m;

    if (["", "n", "next", "continue", "ok", "okay", "lgtm", "looks good", "makes sense", "go on", "got it"].includes(cmd)) {
      if (this.gallery) return this.leaveGallery();
      return this.advance();
    }
    if (["b", "back", "prev", "previous"].includes(cmd)) {
      if (this.current === 0) return this.io.say("This is the first stop.");
      return this.presentStop(this.current - 1);
    }
    if ((m = arg(/^(?:go(?:\s+to)?|jump(?:\s+to)?|stop)\s+(.+)$/i))) return this.go(m);
    if (["again", "replay", "repeat"].includes(cmd)) return this.presentStop(this.current, { record: false });
    if (cmd === "skip") {
      await this.acknowledge("skipped");
      if (this.current + 1 >= this.stops.length) return this.revisitOrFinish();
      return this.presentStop(this.current + 1);
    }
    if ((m = arg(/^(?:concern|flag)[:\s]+(.+)$/i))) return this.concern(m);
    if (["agenda", "stops", "plan"].includes(cmd)) return this.agenda();
    if (cmd === "status") return this.status();
    if ((m = arg(/^focus\s+(.+)$/i))) return this.adhocFocus(m);
    if (["states", "state", "gallery"].includes(cmd)) return this.states();
    if ((m = arg(/^(?:states?|gallery)\s+(\S+)$/i))) return this.states(m.toLowerCase());
    if (cmd === "tour") {
      if (!(await this.leaveGallery())) await this.presentStop(this.current, { record: false });
      return undefined;
    }
    if ((m = arg(/^pace\s+(beat|stop)$/i))) { this.pace = m.toLowerCase(); return this.io.notice(`pace: ${this.pace}`); }
    if ((m = arg(/^speed\s+(\S+)$/i))) { this.io.setSpeed(m); return this.io.notice(`speed: ${m}`); }
    if ((m = arg(/^tools\s+(on|off)$/i))) { this.io.showTools = m.toLowerCase() === "on"; return undefined; }
    if ((m = arg(/^verbose\s+(on|off)$/i))) { this.io.verbose = m.toLowerCase() === "on"; return undefined; }
    if ((m = arg(/^text\s+(on|off)$/i))) {
      this.textMode = m.toLowerCase() === "on";
      if (this.textMode) await this.call("tour_clear", {}, { quiet: true }).catch(() => {});
      await this.io.say(this.textMode ? "Text mode on: I'll behave as if the editor bridge were unavailable." : "Text mode off.");
      return this.presentStop(this.current, { record: false });
    }
    if (["finish", "done", "wrap up", "close out", "closeout"].includes(cmd)) return this.finish();
    if (cmd === "pause") return this.pause();
    if (["help", "?", "commands"].includes(cmd)) return this.io.block(HELP);
    if (["quit", "exit", "q"].includes(cmd)) {
      await this.leaveGallery({ silent: true });
      return "exit";
    }
    if ((m = CITATION.exec(input))) return this.citation(input, m);
    return this.answer(input);
  }
}

function short(sha) { return sha === "WORKTREE" ? "WORKTREE" : sha.slice(0, 7); }
function fmtCounts(obj) { return Object.entries(obj || {}).map(([k, v]) => `${v} ${k}`).join(", "); }

function describeCall(name, args) {
  if (name === "tour_stop") return `${args.mode} · ${args.files.map((f) => `${f.path} ${f.ranges.map((r) => `${r.side} ${r.startLine}-${r.endLine}`).join(", ")}`).join(" · ")}`;
  if (name === "tour_focus") return `${args.path} ${args.side} ${args.startLine}-${args.endLine}${args.note ? ` "${args.note}"` : ""}`;
  if (name === "dossier_apply") return args.commands.map((c) => c.type).join(", ");
  if (name === "dossier_get") return args.selector.kind;
  if (name === "dossier_open" || name === "dossier_refresh") return args.selection.kind;
  if (name === "dossier_receipt") return args.mode;
  return "";
}

module.exports = { SimAgent, HELP, OUTCOMES };
