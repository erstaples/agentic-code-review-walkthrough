"use strict";

const vscode = require("vscode");
const fs = require("node:fs");
const path = require("node:path");

exports.activate = (context) => {
  const output = process.env.RELAY_SPIKE_OUTPUT;
  const events = [];
  const record = (type, value) => {
    const event = { type, value };
    events.push(event);
    if (output) fs.appendFileSync(path.join(output, "events.jsonl"), JSON.stringify(event) + "\n");
  };
  let picker;
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("relaySpike.panel", {
      resolveWebviewView(view) {
        record("panel-resolved", true);
        view.webview.html = `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"></head><body><h2>Relay API verification</h2><p>This is a disposable test window.</p><p>① service.ts — real-file head</p><p>② service.ts — revision head</p><p>99 anchors fit a two-character badge.</p><p>Use Alt+0 to inspect the quick pick.</p></body></html>`;
      },
    }),
    vscode.window.registerFileDecorationProvider({
      provideFileDecoration(uri) {
        if (!["file", "relay-rev"].includes(uri.scheme) || !uri.path.endsWith("service.ts")) return;
        if (uri.scheme === "relay-rev" && JSON.parse(uri.query).ref !== process.env.RELAY_SPIKE_HEAD) return;
        record("badge-request", { scheme: uri.scheme, side: "head" });
        return { badge: uri.scheme === "file" ? "1" : "99", color: new vscode.ThemeColor("charts.purple"), tooltip: "Relay spike anchor" };
      },
    }),
    vscode.commands.registerCommand("relaySpike.quickPick", async () => {
      picker?.dispose();
      picker = vscode.window.createQuickPick();
      picker.title = "Relay spike anchors";
      picker.items = [{ label: "① service.ts", detail: "top" }, { label: "② service.ts", detail: "bottom left" }, { label: "99 evidence.go", detail: "not open" }];
      picker.onDidAccept(() => { record("quick-pick", "enter"); picker.hide(); });
      picker.onDidHide(() => vscode.commands.executeCommand("setContext", "relaySpike.quickPickOpen", false));
      await vscode.commands.executeCommand("setContext", "relaySpike.quickPickOpen", true);
      picker.show();
    }),
    ...["peek", "replace"].map((action) => vscode.commands.registerCommand(`relaySpike.${action}`, () => {
      record("quick-pick", action);
      picker?.hide();
    })),
    { dispose: () => picker?.dispose() },
  );
  return { events, record };
};
