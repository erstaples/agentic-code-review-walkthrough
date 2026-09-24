"use strict";
const vscode = acquireVsCodeApi(), model = SidebarModel;
const byId = id => document.getElementById(id);
let revision = 0, snapshot, rows = [], stopKey, order = "role", collapsed = {}, pickerAnchor = null;
const send = message => vscode.postMessage({ ...message, revision });
const element = (tag, text, className) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (className) e.className = className; return e; };
const button = (text, label, data = {}) => { const e = element("button", text); e.setAttribute("aria-label", label); Object.assign(e.dataset, data); return e; };
const color = n => `color-${(n - 1) % 6 + 1}`;
// Neutral line icons identify roles; numbered chip colors identify files.
const rolePaths = {
  change: "M3 10.5 10.5 3l2.5 2.5L5.5 13H3z M9 4.5 11.5 7",
  evidence: "M14 8a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M5 8l2 2 4-4",
  caller: "M3 3l10 10 M7 13h6V7",
  callee: "M3 13 13 3 M7 3h6v6",
  config: "M2 4h12 M2 8h12 M2 12h12 M5 2v4 M11 6v4 M7 10v4",
  schema: "M5 2H2v12h3 M11 2h3v12h-3 M6 5h4 M6 8h4 M6 11h4",
  context: "M14 8a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M8 7v5 M8 4v.5",
};
const roleName = role => role[0].toUpperCase() + role.slice(1);
function roleIcon(role, decorative = false) {
  const icon = element("span", undefined, "role-icon"), label = roleName(role);
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16"); svg.setAttribute("aria-hidden", "true");
  const path = document.createElementNS(svg.namespaceURI, "path"); path.setAttribute("d", rolePaths[role]); svg.append(path); icon.append(svg);
  if (decorative) icon.setAttribute("aria-hidden", "true");
  else { icon.tabIndex = 0; icon.setAttribute("role", "img"); icon.setAttribute("aria-label", label); icon.title = label; icon.dataset.tooltip = label; }
  return icon;
}
function rowElement(row, showRoleIcon) {
  const wrapper = element("div", undefined, `anchor-row ${color(row.n)}${row.active ? " current-beat" : ""}${row.pinned ? " pinned" : ""}`);
  wrapper.dataset.row = row.n; wrapper.setAttribute("aria-label", `Anchor ${row.n}: ${row.path}, ${row.role}${row.active ? ", current beat" : ""}`);
  const chip = button(String(row.n), `Anchor ${row.n}: ${row.path}`, { anchor: row.n }); chip.className = `chip ${color(row.n)}`;
  const identity = element("div", undefined, "identity");
  const name = element("div", undefined, "filename"); name.append(element("strong", row.filename));
  const badge = element("span", ({ modified: "M", added: "A", deleted: "D", unchanged: "U" })[row.change], `change ${row.change}`); badge.title = row.change; name.append(badge);
  if (row.active) { const dot = element("span", "●", "active-dot"); dot.title = "Referenced in this beat"; name.append(dot); }
  const details = element("div", `${row.directory} · ${row.context.startLine}–${row.context.endLine} · ${row.label}`, "details"); details.title = `${row.path}:${row.context.startLine}–${row.context.endLine} · ${row.label}`;
  if (row.status === "stale") name.append(element("span", "source changed", "stale"));
  identity.title = `${row.path}:${row.context.startLine}–${row.context.endLine} · ${row.label} · ${row.role}`;
  identity.append(name, details);
  const controls = element("div", undefined, "row-controls");
  if (row.slot) {
    const focus = button("", `${roleName(row.role)}: focus anchor ${row.n}`, { anchor: row.n }); focus.className = "role-focus";
    focus.title = roleName(row.role); focus.dataset.tooltip = roleName(row.role); focus.append(roleIcon(row.role, true));
    const actions = element("div", undefined, "row-actions");
    actions.append(button(row.pinned ? "Unpin" : "Pin", `${row.pinned ? "Unpin" : "Pin"} anchor ${row.n}`, { pin: row.n }), button("Move…", `Move anchor ${row.n}`, { move: row.n }));
    controls.append(focus, actions);
  } else {
    if (showRoleIcon) controls.append(roleIcon(row.role));
    controls.append(button(row.status === "open" ? "Show ▾" : "Open ▾", `Open anchor ${row.n}: ${row.filename}`, { anchor: row.n }));
  }
  for (const control of controls.querySelectorAll("button")) control.disabled = snapshot.mode === "paused";
  chip.disabled = snapshot.mode === "paused"; wrapper.append(chip, identity, controls); return wrapper;
}
function renderList() {
  if (!snapshot?.loaded) return;
  const list = byId("anchor-list"), entries = model.entries(rows, { filter: byId("filter").value, order, collapsed });
  const active = document.activeElement, restoreRow = active?.closest("[data-row]")?.dataset.row;
  const restoreAction = active?.dataset && Object.keys(active.dataset)[0];
  const page = model.windowed(entries, list.scrollTop, list.clientHeight || 340), content = byId("list-content");
  content.replaceChildren();
  const spacer = height => { const e = element("div"); e.style.height = `${height}px`; e.setAttribute("aria-hidden", "true"); return e; };
  content.append(spacer(page.before));
  for (const entry of page.visible) {
    if (entry.type === "row") content.append(rowElement(entry.row, entry.showRoleIcon));
    else {
      const header = button("", `${entry.label}, ${entry.count} anchors`, { section: entry.key });
      header.append(element("span", entry.closed ? "▸" : "▾", "section-chevron"));
      if (entry.key !== "view") header.append(roleIcon(entry.key, true));
      header.append(element("span", `${entry.label}  ${entry.count}`));
      header.className = "role-section"; header.setAttribute("aria-expanded", String(!entry.closed)); content.append(header);
    }
  }
  content.append(spacer(page.after));
  byId("no-results").hidden = entries.length > 0;
  if (restoreRow && restoreAction) content.querySelector(`[data-row="${restoreRow}"] [data-${restoreAction}]`)?.focus({ preventScroll: true });
}
function revealRow(n) {
  const row = rows.find(r => r.n === n); if (!row) return;
  byId("filter").value = ""; collapsed[row.slot ? "view" : row.role] = false;
  const entries = model.entries(rows, { order, collapsed }); let top = 0;
  for (const e of entries) { if (e.row?.n === n) break; top += e.height; }
  byId("anchor-list").scrollTop = Math.max(0, top - 32); renderList();
}
function diagram(option, row) {
  const picture = element("span", undefined, "diagram"); picture.setAttribute("aria-hidden", "true");
  for (const cell of option.preview || []) {
    const e = element("span", cell.anchor ? String(cell.anchor) : "–", `diagram-cell ${color(cell.anchor || row.n)}${cell.anchor === row.n ? " incoming" : ""}`);
    Object.assign(e.style, { left: `${cell.x * 100}%`, top: `${cell.y * 100}%`, width: `${cell.w * 100}%`, height: `${cell.h * 100}%` }); picture.append(e);
  }
  return picture;
}
function renderPicker() {
  const row = rows.find(r => r.n === pickerAnchor), picker = byId("picker"); picker.hidden = !row;
  if (!row) return;
  byId("picker-title").textContent = `${row.slot ? "Move" : "Open"} ${row.n} · ${row.filename}`;
  const choices = byId("placement-options"); choices.replaceChildren();
  for (const option of row.options.filter(o => o.kind !== "auto").sort((a, b) => Number(a.kind === "peek") - Number(b.kind === "peek"))) {
    const slot = snapshot.presentation.layout.slots.find(s => s.anchor === option.of);
    const label = option.kind === "peek" ? "Peek" : `${({ below: "Below", beside: "Beside", replace: "Replace" })[option.kind]} ${option.of}`;
    const tile = button("", `${label}${slot ? ` in ${model.position(slot.slot)}` : ` at anchor ${row.n}`}`, { placement: option.kind, of: option.of ?? "" });
    tile.className = "placement-tile";
    if (option.kind !== "peek") tile.append(diagram(option, row)); else tile.append(element("span", "↗", "peek-icon"));
    tile.append(element("span", label), element("small", option.kind === "peek" ? "Keep this layout" : model.position(slot?.slot)));
    tile.disabled = snapshot.mode === "paused"; choices.append(tile);
  }
  byId("remember-text").textContent = `Remember for ${row.role} anchors`;
  byId("remember-label").hidden = !row.options.some(o => !["auto", "peek"].includes(o.kind));
  const layout = snapshot.presentation.layout, atCap = layout.slots.length >= layout.cap;
  byId("picker-help").textContent = row.pinned ? "Unpin this anchor to move it. Peek keeps pins in place." : `${atCap ? `${layout.cap} groups is the limit. Choose an eligible replacement, or peek.` : "Choose what to compare. Pins and reviewer previews are protected."}${row.remembered ? ` Remembered destination: ${model.position(row.remembered.slot)}.` : ""}`;
}
function openPicker(n) {
  pickerAnchor = n; byId("remember").checked = false; revealRow(n); renderPicker();
  byId("picker").scrollIntoView({ block: "nearest" }); byId("placement-options").querySelector("button")?.focus();
}
function selectAnchor(n, forcePicker = false) {
  const row = rows.find(r => r.n === n); if (!row || snapshot.mode === "paused") return;
  if (forcePicker) return openPicker(n);
  if (row.slot || row.status === "open") { pickerAnchor = null; renderPicker(); send({ type: "focus", anchor: n }); return; }
  const pref = row.remembered, target = snapshot.presentation.layout.slots.find(s => s.slot === pref?.slot);
  if (target && row.options.some(o => o.kind === "replace" && o.of === target.anchor)) {
    pickerAnchor = null; renderPicker(); send({ type: "layout", action: "place", anchor: n, placement: { kind: "replace", of: target.anchor } });
  } else openPicker(n);
}
window.addEventListener("message", ({ data }) => {
  if (data.type === "error") { byId("error").textContent = data.message; return; }
  if (data.type === "selectAnchor") { selectAnchor(data.anchor, data.move); return; }
  if (data.type !== "snapshot" || data.snapshot.revision < revision) return;
  snapshot = data.snapshot; const s = snapshot; revision = s.revision;
  byId("error").textContent = ""; byId("empty").hidden = s.loaded; byId("tour").hidden = !s.loaded;
  byId("tour-title").textContent = s.loaded ? s.title : "Your tour, one beat at a time.";
  if (!s.loaded) { stopKey = null; return; }
  const key = `${s.tourId}:${s.stop.id}`;
  if (key !== stopKey) { stopKey = key; collapsed = {}; pickerAnchor = null; byId("filter").value = ""; byId("anchor-list").scrollTop = 0; }
  rows = model.rows(s);
  byId("position").textContent = `STOP ${s.stopIndex + 1} / ${s.stopCount}`;
  byId("beat-position").textContent = `Beat ${s.beatIndex + 1} of ${s.beatCount}`;
  byId("risk").textContent = `${s.stop.risk} risk`; byId("stop-title").textContent = s.stop.title;
  const rev = s.stop.anchors[0].rev;
  byId("revisions").textContent = `${rev.base.slice(0, 7)} → ${rev.head.startsWith("WORKTREE:") ? "working snapshot" : rev.head.slice(0, 7)}`;
  for (const button of document.querySelectorAll("[data-mode]")) button.setAttribute("aria-pressed", String(button.dataset.mode === s.mode));
  byId("mode-help").textContent = { following: "Following the current beat.", exploring: "Explore freely. Your editor stays where you leave it.", paused: "Presentation paused. Resume with Following." }[s.mode];
  byId("file-count").textContent = `${rows.length} ${rows.length === 1 ? "anchor" : "anchors"} · ${rows.filter(r => r.slot).length} in view`;
  byId("guideline").hidden = rows.length <= 7; byId("list-tools").hidden = rows.length < 5;
  byId("anchor-list").hidden = rows.length === 1; byId("single-file").hidden = rows.length !== 1;
  byId("single-file").textContent = rows.length === 1 ? `${rows[0].path}:${rows[0].context.startLine}–${rows[0].context.endLine} · ${rows[0].role}` : "";
  byId("reset-layout").disabled = s.mode === "paused";
  renderList(); renderPicker();
  // Only extension-generated, escaped Markdown and numbered buttons enter here.
  byId("narration").innerHTML = s.narrationHtml;
  for (const chip of byId("narration").querySelectorAll("[data-anchor]")) { chip.classList.toggle("active", s.beat.active.includes(Number(chip.dataset.anchor))); chip.disabled = s.mode === "paused"; }
  byId("sequence-note").hidden = !s.presentation?.layout?.sequence;
  const notes = [], pinned = rows.filter(r => r.pinned).length;
  if (pinned) notes.push(`${pinned} anchor${pinned === 1 ? " is" : "s are"} pinned.`);
  if (rows.some(r => r.status === "stale")) notes.push("A source has changed. Reload the tour before relying on its highlights.");
  const hidden = rows.filter(r => r.active && !r.slot);
  if (hidden.length) notes.push(`${hidden.length} cited source${hidden.length === 1 ? " is" : "s are"} outside the current view. Choose a numbered file to inspect it.`);
  byId("warnings").textContent = notes.join(" ");
  byId("previous-beat").disabled = s.stopIndex === 0 && s.beatIndex === 0;
  byId("next-beat").disabled = s.stopIndex === s.stopCount - 1 && s.beatIndex === s.beatCount - 1;
  byId("previous-stop").disabled = s.stopIndex === 0; byId("next-stop").disabled = s.stopIndex === s.stopCount - 1;
});
document.addEventListener("click", event => {
  const b = event.target.closest("button"); if (!b || b.disabled) return;
  if (b.dataset.action) send({ type: "navigate", action: b.dataset.action });
  else if (b.dataset.mode) send({ type: "state", mode: b.dataset.mode });
  else if (b.dataset.anchor) selectAnchor(Number(b.dataset.anchor));
  else if (b.dataset.move) selectAnchor(Number(b.dataset.move), true);
  else if (b.dataset.pin) { const row = rows.find(r => r.n === Number(b.dataset.pin)); send({ type: "layout", action: "pin", anchor: row.n, pinned: !row.pinned }); }
  else if (b.dataset.section) { collapsed[b.dataset.section] = b.getAttribute("aria-expanded") === "true"; renderList(); }
  else if (b.dataset.placement) {
    const placement = { kind: b.dataset.placement }; if (b.dataset.of) placement.of = Number(b.dataset.of);
    send({ type: "layout", action: "place", anchor: pickerAnchor, placement, remember: byId("remember").checked });
  }
  else if (b.id === "close-picker") { const n = pickerAnchor; pickerAnchor = null; renderPicker(); document.querySelector(`[data-row="${n}"] [data-anchor]`)?.focus(); }
  else if (b.id.startsWith("order-")) { order = b.id.slice(6); byId("order-role").setAttribute("aria-pressed", String(order === "role")); byId("order-order").setAttribute("aria-pressed", String(order === "order")); byId("anchor-list").scrollTop = 0; renderList(); }
  else if (b.id === "quick-pick") send({ type: "quickPick" });
  else if (b.id === "reset-layout") send({ type: "layout", action: "reset" });
  else if (b.id === "sequence-override") send({ type: "sequenceOverride" });
  else if (b.id === "end-tour") send({ type: "clear" });
});
byId("filter").addEventListener("input", () => { byId("anchor-list").scrollTop = 0; renderList(); });
byId("anchor-list").addEventListener("scroll", renderList);
new ResizeObserver(renderList).observe(byId("anchor-list"));
document.addEventListener("keydown", event => {
  if (event.altKey && /^\d$/.test(event.code.replace("Digit", ""))) {
    event.preventDefault(); const n = Number(event.code.slice(5)); if (!n && !event.shiftKey) send({ type: "quickPick" }); else selectAnchor(n + (event.shiftKey ? 10 : 0)); return;
  }
  if (event.key === "Escape" && pickerAnchor) { event.preventDefault(); byId("close-picker").click(); return; }
  if (!event.target.closest("#anchor-list") || !["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  const available = model.entries(rows, { filter: byId("filter").value, order, collapsed }).filter(e => e.row).map(e => e.row.n);
  const n = Number(event.target.closest("[data-row]")?.dataset.row), index = available.indexOf(n);
  const next = event.key === "Home" ? 0 : event.key === "End" ? available.length - 1 : Math.max(0, Math.min(available.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)));
  if (!available.length) return; event.preventDefault();
  // Do not clear a user's filter when navigating its matching rows.
  const entries = model.entries(rows, { filter: byId("filter").value, order, collapsed }); let top = 0;
  for (const e of entries) { if (e.row?.n === available[next]) break; top += e.height; }
  byId("anchor-list").scrollTop = Math.max(0, top - 32); renderList(); document.querySelector(`[data-row="${available[next]}"] [data-anchor]`)?.focus();
});
vscode.postMessage({ type: "ready" });
