"use strict";
const { rows, position } = require("../src/shared/sidebar-model.js");
// Native quick picks provide fuzzy matching and accessible selection. Freeze the revision so a changed tour cannot reinterpret the selection.
function createAnchorQuickPick(vscode, controller, view) {
  let active, acceptShortcut;
  async function choose() {
    const snapshot = controller.snapshot();
    if (!snapshot.loaded || snapshot.mode === "paused") return;
    active?.dispose();
    const pick = vscode.window.createQuickPick(); active = pick;
    pick.title = "Files in this stop"; pick.placeholder = "Enter: placement · Alt+Enter: peek · Shift+Enter: replace focused group";
    pick.matchOnDescription = pick.matchOnDetail = true;
    pick.items = rows(snapshot).map(row => ({ label: `${row.n}  ${row.filename}`, description: row.role,
      detail: `${row.path}:${row.context.startLine}–${row.context.endLine} · ${row.label} · ${row.slot || "not in view"}`, anchor: row.n }));
    const focused = snapshot.presentation.layout.slots.find(s => s.column === vscode.window.activeTextEditor?.viewColumn);
    const subscriptions = [];
    subscriptions.push(pick.onDidHide(() => { acceptShortcut = undefined; vscode.commands.executeCommand("setContext", "kanko.anchorQuickPick", false); subscriptions.forEach(s => s.dispose()); pick.dispose(); if (active === pick) active = undefined; }));
    const accept = async kind => {
      const item = pick.selectedItems[0] || pick.activeItems[0]; if (!item) return;
      pick.hide();
      try {
        if (kind) {
          const placement = kind === "peek" ? { kind: "peek" } : { kind: "replace", of: focused?.anchor };
          await controller.layout({ action: "place", anchor: item.anchor, placement, expectedRevision: snapshot.revision });
        } else {
          if (snapshot.revision !== controller.snapshot().revision) throw new Error("The tour changed. Open the file picker again.");
          await placement(item.anchor, snapshot);
        }
      } catch (error) { vscode.window.showWarningMessage(error.message); }
    };
    acceptShortcut = accept;
    subscriptions.push(pick.onDidAccept(() => accept()));
    await vscode.commands.executeCommand("setContext", "kanko.anchorQuickPick", true);
    pick.show();
  }
  async function placement(anchor, snapshot) {
    const row = rows(snapshot).find(r => r.n === anchor); if (!row) return;
    const options = row.options.filter(o => o.kind !== "auto");
    const items = options.map(option => ({ label: option.kind === "peek" ? "Peek" : `${({ below: "Below", beside: "Beside", replace: "Replace" })[option.kind]} ${option.of}`,
      detail: option.of ? position(snapshot.presentation.layout.slots.find(s => s.anchor === option.of)?.slot) : "Keep this layout", option }));
    if (row.slot || row.status === "open") items.unshift({ label: "Focus this anchor", focus: true });
    const picked = await vscode.window.showQuickPick(items, { title: `${anchor} · ${row.filename}`, placeHolder: "Choose placement" });
    if (!picked) return;
    if (picked.focus) await controller.focus({ anchor, expectedRevision: snapshot.revision });
    else await controller.layout({ action: "place", anchor, placement: picked.option, expectedRevision: snapshot.revision });
  }
  async function numbered(anchor) {
    const snapshot = controller.snapshot(); if (!snapshot.loaded || snapshot.mode === "paused") return;
    const row = rows(snapshot).find(r => r.n === anchor); if (!row) return;
    if (row.slot || row.status === "open") return controller.focus({ anchor, expectedRevision: snapshot.revision });
    await view.showAnchor(anchor);
  }
  return { choose, numbered, accept: kind => acceptShortcut?.(kind), dispose() { active?.dispose(); } };
}
module.exports = { createAnchorQuickPick };
