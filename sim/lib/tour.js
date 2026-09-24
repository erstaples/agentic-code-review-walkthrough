"use strict";

const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { changedFiles, diffHunks } = require("../../editor-extension/lib/git.js");

const TOUR_DIR = path.resolve(__dirname, "../tours");

function listTours() {
  return fs.readdirSync(TOUR_DIR).filter((n) => n.endsWith(".json")).sort().map((n) => loadTour(path.join(TOUR_DIR, n)));
}

function loadTour(nameOrPath) {
  const candidates = [nameOrPath, path.join(TOUR_DIR, nameOrPath), path.join(TOUR_DIR, `${nameOrPath}.json`)];
  const file = candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile());
  if (!file) throw new Error(`tour not found: ${nameOrPath}. Run with --list to see the bundled tours.`);
  const tour = JSON.parse(fs.readFileSync(file, "utf8"));
  tour.name ||= path.basename(file, ".json");
  tour.mode ||= "committed";
  tour.entities ||= {};
  tour.qa ||= [];
  for (const stop of tour.stops) { stop.beats ||= []; stop.qa ||= []; stop.covers ||= []; }
  return tour;
}

const STATUS = { A: "added", D: "deleted", M: "modified", R: "renamed", C: "copied", T: "retyped" };
const MAX_FILES = 25;
const MAX_BEATS = 4;

function lineCount(text) {
  return text.length === 0 ? 0 : text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

// Builds a tour from a real diff: one stop per changed file, one focus beat
// per hunk. Narration is mechanical: the point is to see kanko render
// real code, not to explain it.
async function autoTour(workspace, base, head) {
  const worktree = head.sha === "WORKTREE";
  let changes;
  if (worktree) {
    const out = cp.execFileSync("git", ["diff", "--name-status", "-z", "--find-renames", base.sha, "--"], { cwd: workspace, encoding: "utf8" });
    const fields = out.split("\0");
    changes = [];
    for (let i = 0; i < fields.length && fields[i]; ) {
      const status = fields[i++];
      if (status[0] === "R" || status[0] === "C") changes.push({ status: status[0], sourcePath: fields[i++], targetPath: fields[i++] });
      else { const p = fields[i++]; changes.push({ status: status[0], sourcePath: p, targetPath: p }); }
    }
    const untracked = cp.execFileSync("git", ["ls-files", "--others", "--exclude-standard", "-z"], { cwd: workspace, encoding: "utf8" }).split("\0").filter(Boolean);
    changes.push(...untracked.map((p) => ({ status: "A", sourcePath: p, targetPath: p, untracked: true })));
  } else {
    changes = await changedFiles(workspace, base.sha, head.sha);
  }
  if (changes.length === 0) throw new Error(`no changes between ${base.name} and ${head.name}`);

  const stops = [];
  const claims = [];
  for (const change of changes.slice(0, MAX_FILES)) {
    const p = change.targetPath;
    const key = `file-${stops.length + 1}`;
    const headSide = worktree ? "working" : "head";
    let ranges = [];
    if (change.status === "D") {
      if (worktree) continue; // file mode cannot point at a file that is gone
      const text = cp.execFileSync("git", ["show", `${base.sha}:./${change.sourcePath}`], { cwd: workspace, encoding: "utf8" });
      ranges = [{ side: "base", startLine: 1, endLine: Math.max(1, lineCount(text)) }];
    } else if (change.status === "A" || change.untracked) {
      const text = worktree ? fs.readFileSync(path.join(workspace, p), "utf8")
        : cp.execFileSync("git", ["show", `${head.sha}:./${p}`], { cwd: workspace, encoding: "utf8" });
      ranges = [{ side: headSide, startLine: 1, endLine: Math.max(1, lineCount(text)) }];
    } else {
      const hunks = await diffHunks(workspace, base.sha, head.sha, [...new Set([change.sourcePath, p])]);
      for (const h of hunks) {
        if (h.headLen > 0) ranges.push({ side: headSide, startLine: h.headStart, endLine: h.headStart + h.headLen - 1 });
        else if (!worktree && h.baseLen > 0) ranges.push({ side: "base", startLine: h.baseStart, endLine: h.baseStart + h.baseLen - 1 });
      }
      if (ranges.length === 0) continue; // mode-only or binary change
    }
    const label = STATUS[change.status] || change.status;
    claims.push({ key, statement: `${p} is ${label} as intended.` });
    stops.push({
      id: key,
      title: change.status === "R" ? `${change.sourcePath} → ${p}` : `${p} (${label})`,
      type: "implementation",
      covers: [key],
      files: [{ path: p, ranges }],
      intro: `${p} was ${label}${change.status === "R" ? ` from ${change.sourcePath}` : ""}: ${ranges.length} range${ranges.length === 1 ? "" : "s"}.`,
      beats: ranges.slice(0, MAX_BEATS).map((r, i) => ({
        say: `Range ${i + 1}: lines ${r.startLine}-${r.endLine} on the ${r.side} side.`,
        focus: { path: p, side: r.side, startLine: r.startLine, endLine: r.endLine, note: r.side === "base" ? "removed" : `range ${i + 1}` },
      })),
      qa: [],
    });
  }
  if (stops.length === 0) throw new Error("no changes the simulator can tour (only deletions or mode changes)");
  return {
    name: "auto",
    title: `${base.name}..${head.name}`,
    description: "Generated from the diff: one stop per file, one beat per hunk.",
    mode: worktree ? "working-tree" : "committed",
    range: { base: base.name, head: head.name },
    thesis: `Changes between ${base.name} and ${head.name} (generated tour; no rationale is known).`,
    entities: { claims },
    stops,
    qa: [],
    generated: true,
    truncated: changes.length > MAX_FILES,
    closing: "That's every file in the generated tour.",
  };
}

module.exports = { TOUR_DIR, listTours, loadTour, autoTour };
