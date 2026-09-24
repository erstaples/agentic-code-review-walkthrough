"use strict";
const vscode = acquireVsCodeApi();
let revision = 0;
const byId = (id) => document.getElementById(id);
window.addEventListener("message", ({ data }) => {
  if (data.type === "error") { byId("error").textContent = data.message; return; }
  if (data.type !== "snapshot" || data.snapshot.revision < revision) return;
  const s = data.snapshot; revision = s.revision;
  byId("error").textContent = "";
  byId("empty").hidden = s.loaded; byId("tour").hidden = !s.loaded;
  byId("tour-title").textContent = s.loaded ? s.title : "Your tour, one beat at a time.";
  if (!s.loaded) return;
  byId("position").textContent = `STOP ${s.stopIndex + 1} / ${s.stopCount} · BEAT ${s.beatIndex + 1} / ${s.beatCount}`;
  byId("risk").textContent = `${s.stop.risk} risk`;
  byId("stop-title").textContent = s.stop.title;
  const rev = s.stop.anchors[0].rev;
  byId("revisions").textContent = `${rev.base.slice(0, 7)} → ${rev.head.startsWith("WORKTREE:") ? "working snapshot" : rev.head.slice(0, 7)}`;
  for (const button of document.querySelectorAll("[data-mode]")) button.setAttribute("aria-pressed", String(button.dataset.mode === s.mode));
  byId("mode-help").textContent = { following: "Following the current beat.", exploring: "Explore freely. Your editor stays where you leave it.", paused: "Presentation paused. Resume with Following." }[s.mode];
  // Only extension-generated, escaped Markdown and numbered buttons enter here.
  byId("narration").innerHTML = s.narrationHtml;
  for (const chip of document.querySelectorAll("[data-anchor]")) chip.classList.toggle("active", s.beat.active.includes(Number(chip.dataset.anchor)));
  const notes = s.stop.anchors.length > 7 ? ["Above the 7-file guideline."] : [];
  const states = s.presentation?.anchors || [];
  if (states.some(a => a.status === "stale")) notes.push("A source has changed. Reload the tour before relying on its highlights.");
  const hidden = states.filter(a => s.beat.active.includes(a.n) && a.status === "not-open");
  if (hidden.length) notes.push(`${hidden.length} cited source${hidden.length === 1 ? " is" : "s are"} not open. Select a numbered citation to inspect it.`);
  byId("warnings").textContent = notes.join(" ");
  byId("previous-beat").disabled = s.stopIndex === 0 && s.beatIndex === 0;
  byId("next-beat").disabled = s.stopIndex === s.stopCount - 1 && s.beatIndex === s.beatCount - 1;
  byId("previous-stop").disabled = s.stopIndex === 0;
  byId("next-stop").disabled = s.stopIndex === s.stopCount - 1;
});
document.addEventListener("click", (event) => {
  const button = event.target.closest("button"); if (!button || button.disabled) return;
  if (button.dataset.action) vscode.postMessage({ type: "navigate", action: button.dataset.action, revision });
  else if (button.dataset.mode) vscode.postMessage({ type: "state", mode: button.dataset.mode, revision });
  else if (button.dataset.anchor) vscode.postMessage({ type: "focus", anchor: Number(button.dataset.anchor), revision });
  else if (button.id === "end-tour") vscode.postMessage({ type: "clear", revision });
});
vscode.postMessage({ type: "ready" });
