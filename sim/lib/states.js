"use strict";

const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { changedFiles, diffHunks } = require("../../editor-extension/lib/git.js");

// Each state puts VS Code into one presentation state through the same bridge
// calls a real agent makes. Settings go into the fixture repo's workspace
// .vscode/settings.json (git-excluded), which VS Code applies live.

async function diffFiles(agent) {
  const { workspace, base, head } = agent.ws;
  if (head.sha === "WORKTREE") return [];
  const changes = await changedFiles(workspace, base.sha, head.sha);
  for (const c of changes) c.hunks = await diffHunks(workspace, base.sha, head.sha, [...new Set([c.sourcePath, c.targetPath])]);
  return changes;
}

function blobLines(agent, sha, relPath) {
  const text = cp.execFileSync("git", ["show", `${sha}:./${relPath}`], { cwd: agent.ws.workspace, encoding: "utf8" });
  return text.split("\n").length - (text.endsWith("\n") ? 1 : 0);
}

function need(found, what) {
  if (!found) throw new Error(`this change has no ${what}`);
  return found;
}

async function showStop(agent, files, label) {
  await agent.call("tour_clear", {});
  return agent.call("tour_stop", {
    stopId: `gallery-${agent.gallery.key}`, index: 1, total: 1, label, type: "context",
    mode: agent.stopMode, base: agent.ws.base, head: agent.ws.head, files,
  });
}

function firstFocus(agent) {
  const beat = agent.stop.beats.find((b) => b.focus && b.focus.side !== "base");
  if (beat) return beat.focus;
  const file = agent.stop.files[0];
  const r = file.ranges.find((x) => x.side !== "base") || file.ranges[0];
  return { path: file.path, side: r.side, startLine: r.startLine, endLine: Math.min(r.endLine, r.startLine + 2), note: "focus" };
}

async function removedCode(agent, label) {
  const changes = await diffFiles(agent);
  // The hunk that removes the most lines makes the companion and seam easiest to see.
  const candidates = changes.filter((x) => x.status === "M").flatMap((x) => x.hunks.filter((h) => h.baseLen > 0).map((h) => ({ c: x, h })));
  const { c, h } = need(candidates.sort((a, b) => (b.h.baseLen - b.h.headLen) - (a.h.baseLen - a.h.headLen))[0], "modified file with removed lines");
  const ranges = [{ side: "base", startLine: h.baseStart, endLine: h.baseStart + h.baseLen - 1 }];
  if (h.headLen > 0) ranges.push({ side: "head", startLine: h.headStart, endLine: h.headStart + h.headLen - 1 });
  await showStop(agent, [{ path: c.targetPath, ranges }], label);
  await agent.call("tour_focus", { path: c.targetPath, side: "base", startLine: ranges[0].startLine, endLine: ranges[0].endLine, note: "removed here" });
}

const STATES = [
  {
    key: "rails",
    title: "Stop rails in the file view (no focus yet)",
    run: (agent) => showStop(agent, agent.bridgeFiles(agent.stop), agent.stop.title),
    look: "Violet rails beside each stop range, with marks in the overview ruler. There's no focus box or label yet, and nothing is dimmed.",
    try: "Click \"Show Diff\" in the status bar to switch this stop to the multi-file diff. Rails stay, and the diff's own backgrounds are untouched.",
  },
  {
    key: "focus",
    title: "Following: focus box, inline label, dimmed context",
    async run(agent) {
      await showStop(agent, agent.bridgeFiles(agent.stop), agent.stop.title);
      const f = firstFocus(agent);
      await agent.call("tour_focus", { ...f, note: f.note || "focused" });
    },
    look: "A focus outline on the span, an inline label at its end, and context text dimmed to relay.presentation.dimOpacity (default 0.45).",
    try: "Select any code: kanko switches to Exploring, so labels and dimming vanish while rails and boxes stay. Then run \"kanko: Follow Presenter\" to return to Following, or \"kanko: Pause Presentation\" to keep boxes without dimming.",
  },
  {
    key: "quiet",
    title: "Labels off, no dimming (showLabels=false, dimOpacity=1)",
    async run(agent) {
      agent.writeSettings({ "relay.presentation.showLabels": false, "relay.presentation.dimOpacity": 1 });
      await showStop(agent, agent.bridgeFiles(agent.stop), agent.stop.title);
      await agent.call("tour_focus", firstFocus(agent));
    },
    look: "The same focus as \"focus\", with no inline label and no dimming.",
  },
  {
    key: "companion",
    title: "Removed code: read-only base companion beside an inline diff",
    requires: "committed",
    async run(agent) {
      agent.writeSettings({ "relay.presentation.removedCode": "companion", "diffEditor.renderSideBySide": false });
      await removedCode(agent, "Removed code (companion)");
    },
    look: "A pinned inline diff, with a read-only base companion opened beside it. The removed lines are painted in the workbench's removed-line color. The companion is a preview tab owned by the tour.",
    try: "Pin or drag the companion tab: it becomes yours, and kanko will never close it. Run \"states focus\" to change beats; an unpinned companion closes (closeCompanion=onBeatChange).",
  },
  {
    key: "seam",
    title: "Removed code: seam marker with a peek link",
    requires: "committed",
    async run(agent) {
      agent.writeSettings({ "relay.presentation.removedCode": "seam", "diffEditor.renderSideBySide": false });
      await removedCode(agent, "Removed code (seam)");
    },
    look: "No companion. A dashed seam in the head file where the lines were removed, labelled \"N lines removed · peek\".",
    try: "Hover the seam and click \"Peek removed code\".",
  },
  {
    key: "side-by-side",
    title: "Removed code in an explicit side-by-side diff (original pane)",
    requires: "committed",
    async run(agent) {
      agent.writeSettings({ "diffEditor.renderSideBySide": true, "diffEditor.useInlineViewWhenSpaceIsLimited": false });
      await removedCode(agent, "Removed code (side by side)");
    },
    look: "Focus lands in the diff's left (original) pane. No companion or seam: kanko only trusts the original pane when side-by-side is explicit.",
  },
  {
    key: "added",
    title: "Added file: no base side, always a file view",
    async run(agent) {
      let target;
      if (agent.ws.head.sha === "WORKTREE") {
        const out = cp.execFileSync("git", ["ls-files", "--others", "--exclude-standard"], { cwd: agent.ws.workspace, encoding: "utf8" }).split("\n").filter(Boolean);
        const p = need(out[0], "added file");
        const lines = fs.readFileSync(path.join(agent.ws.workspace, p), "utf8").split("\n").length - 1;
        target = { path: p, side: "working", lines };
      } else {
        const c = need((await diffFiles(agent)).find((x) => x.status === "A"), "added file");
        target = { path: c.targetPath, side: "head", lines: blobLines(agent, agent.ws.head.sha, c.targetPath) };
      }
      await showStop(agent, [{ path: target.path, ranges: [{ side: target.side, startLine: 1, endLine: Math.max(1, target.lines) }] }], "Added file");
      await agent.call("tour_focus", { path: target.path, side: target.side, startLine: 1, endLine: Math.min(3, Math.max(1, target.lines)), note: "new file" });
    },
    look: "Opens as a plain file. \"Show Diff\" leaves an added file in the file view, because there's no base content to diff against.",
  },
  {
    key: "deleted",
    title: "Deleted file: base side only",
    requires: "committed",
    async run(agent) {
      const c = need((await diffFiles(agent)).find((x) => x.status === "D"), "deleted file");
      const lines = blobLines(agent, agent.ws.base.sha, c.sourcePath);
      await showStop(agent, [{ path: c.targetPath, ranges: [{ side: "base", startLine: 1, endLine: lines }] }], "Deleted file");
      await agent.call("tour_focus", { path: c.targetPath, side: "base", startLine: 1, endLine: Math.min(lines, 3), note: "deleted" });
    },
    look: "A pinned diff against empty head content. The focus sits on the base (removed) side.",
  },
  {
    key: "renamed",
    title: "Renamed file: base read from the old path",
    requires: "committed",
    async run(agent) {
      const c = need((await diffFiles(agent)).find((x) => x.status === "R"), "renamed file");
      const h = c.hunks.find((x) => x.headLen > 0 && x.baseLen > 0) || c.hunks[0];
      const ranges = h ? [{ side: "base", startLine: h.baseStart, endLine: h.baseStart + Math.max(1, h.baseLen) - 1 }, { side: "head", startLine: h.headStart, endLine: h.headStart + Math.max(1, h.headLen) - 1 }]
        : [{ side: "head", startLine: 1, endLine: 1 }];
      await showStop(agent, [{ path: c.targetPath, ranges }], `${c.sourcePath} → ${c.targetPath}`);
      if (ranges.length > 1) {
        await agent.call("tour_focus", { path: c.targetPath, ...ranges[0], note: `was ${c.sourcePath}` });
        await agent.io.pause(1500);
      }
      await agent.call("tour_focus", { path: c.targetPath, ...ranges.at(-1), note: "renamed + edited" });
    },
    look: "The diff title and every path on the wire use the new name. The base side's content comes from the old path.",
  },
  {
    key: "deferred",
    title: "Deferred highlights in a large multi-file diff",
    requires: "committed",
    async run(agent) {
      const changes = await diffFiles(agent);
      const files = changes.map((c) => {
        if (c.status === "D") return { path: c.targetPath, ranges: [{ side: "base", startLine: 1, endLine: 1 }] };
        const h = c.hunks.find((x) => x.headLen > 0);
        return { path: c.targetPath, ranges: [h ? { side: "head", startLine: h.headStart, endLine: h.headStart + h.headLen - 1 } : { side: "head", startLine: 1, endLine: 1 }] };
      });
      await showStop(agent, files, `Every changed file (${files.length})`);
    },
    look: "Every changed file is in one stop.",
    try: "Click \"Show Diff\" in the status bar, then type \"status\" here: the (path, side) pairs not yet decorated are listed as deferred. Scroll the multi-file diff and run \"status\" again to watch them drain.",
  },
  {
    key: "stale",
    title: "Stale anchor: the focused code changes on disk",
    async run(agent) {
      if (!agent.ws.fixture) throw new Error("this state edits a file on disk, so it only runs in the simulator's fixture repos");
      const f = agent.stops.flatMap((s) => s.files).find((x) => fs.existsSync(path.join(agent.ws.workspace, x.path)));
      const file = path.join(agent.ws.workspace, need(f, "file on disk").path);
      const original = fs.readFileSync(file);
      const lines = original.toString("utf8").split("\n");
      const line = Math.min(3, lines.length - 1) || 1;
      await agent.call("tour_clear", {});
      await agent.call("tour_stop", {
        stopId: "gallery-stale", index: 1, total: 1, label: "Stale anchor", type: "context", mode: "file",
        base: agent.ws.base, head: { sha: "WORKTREE", name: "working tree" },
        files: [{ path: f.path, ranges: [{ side: "working", startLine: 1, endLine: Math.min(lines.length - 1, line + 2) || 1 }] }],
      });
      await agent.call("tour_focus", { path: f.path, side: "working", startLine: line, endLine: line, note: "about to change" });
      await agent.io.say(`Watch ${f.path}:${line}. In 3 seconds I'll edit that line on disk, as if the author had kept typing.`);
      await agent.io.pause(3000);
      lines[line - 1] = `${lines[line - 1]} // edited by kanko-sim`;
      fs.writeFileSync(file, lines.join("\n"));
      agent.io.tool("edit", `${f.path}:${line} (restored when you leave this state)`);
      agent.gallery.cleanup.push(() => fs.writeFileSync(file, original));
    },
    look: "About 300 ms after the edit lands, the rail turns dashed and clamped with a \"Stale\" label. The focus box, dimming, and removal paint are dropped. The file is restored when you leave this state.",
    try: "Undo the edit yourself in VS Code to see the anchor re-verify.",
  },
  {
    key: "text",
    title: "Text-tour fallback: no bridge, citations only",
    textOnly: true,
    async run(agent) {
      agent.textMode = true;
      agent.gallery.cleanup.push(() => { agent.textMode = false; });
      await agent.presentStop(agent.current, { record: false });
    },
    look: "No editor calls. Every beat is narrated with a path:line citation. This is what a reviewer without the extension (over SSH, in a container) gets.",
  },
  {
    key: "errors",
    title: "Refused requests: repinning and out-of-range focus",
    requires: "committed",
    async run(agent) {
      await showStop(agent, agent.bridgeFiles(agent.stop), agent.stop.title);
      const f = agent.stop.files[0];
      const wrong = await agent.call("tour_stop", {
        stopId: "gallery-wrong", label: "Repinned", type: "context", mode: "diff",
        base: agent.ws.base, head: { sha: agent.ws.base.sha, name: agent.ws.base.name }, files: agent.bridgeFiles(agent.stop),
      });
      if (wrong.error) await agent.io.say(`A tour stays pinned: ${wrong.error.code}. I'd need tour_clear before touring a different range.`);
      const far = await agent.call("tour_focus", { path: f.path, side: f.ranges[0].side, startLine: 9000, endLine: 9001 });
      if (far.error) await agent.io.say(`And a focus that misses the file: ${far.error.code}.`);
    },
    look: "Nothing in VS Code changed: a rejected request never touches the stop that's showing.",
  },
  {
    key: "clear",
    title: "Tour cleared",
    run: (agent) => agent.call("tour_clear", {}),
    look: "Every rail, box, and label is gone, and companions are closed. Tabs you opened stay open.",
  },
];

module.exports = { STATES };
