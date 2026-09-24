"use strict";

const crypto = require("node:crypto");
function createTourView(vscode, extensionUri, controller) {
  let view, latest = { loaded: false, revision: 0 };
  const publish = (snapshot) => { latest = snapshot; return view?.webview.postMessage({ type: "snapshot", snapshot }); };
  return {
    publish,
    async showAnchor(anchor) {
      await vscode.commands.executeCommand("kanko.tour.focus");
      view?.show?.(false);
      await view?.webview.postMessage({ type: "selectAnchor", anchor });
    },
    resolveWebviewView(resolved) {
      view = resolved;
      const media = vscode.Uri.joinPath(extensionUri, "media");
      view.webview.options = { enableScripts: true, localResourceRoots: [media] };
      const script = view.webview.asWebviewUri(vscode.Uri.joinPath(media, "tour.js"));
      const model = view.webview.asWebviewUri(vscode.Uri.joinPath(media, "sidebar-model.js"));
      const css = view.webview.asWebviewUri(vscode.Uri.joinPath(media, "tour.css"));
      const nonce = crypto.randomBytes(24).toString("base64url");
      view.webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${view.webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${css}"></head><body>
        <main><div class="eyebrow">CODE WALKTHROUGH</div><h1 id="tour-title">Your tour, one beat at a time.</h1>
        <p id="empty">Load a tour from your agent to begin.</p><section id="tour" hidden>
        <div class="progress"><span id="position"></span><span id="risk" class="risk"></span></div>
        <h2 id="stop-title"></h2><div id="revisions" class="revisions"></div>
        <nav class="modes" aria-label="Presentation mode"><button data-mode="following">Following</button><button data-mode="exploring">Exploring</button><button data-mode="paused">Paused</button></nav>
        <p id="mode-help" class="muted"></p>
        <section id="inventory" aria-label="Files in this stop">
          <div class="inventory-heading"><span id="file-count"></span><button id="quick-pick" title="Find any anchor (Alt+0)">Find file…</button></div>
          <p id="guideline" class="muted" hidden>Above the 7-file guideline</p>
          <div id="list-tools"><input id="filter" type="search" placeholder="Filter files…" aria-label="Filter files by number, path, label or role"><button id="order-role" aria-pressed="true">Role</button><button id="order-order" aria-pressed="false">Order</button></div>
          <p id="single-file"></p><div id="anchor-list" tabindex="0" role="region" aria-label="Stop anchor list. Use arrow keys to navigate rows."><div id="list-content"></div></div>
          <p id="no-results" class="muted" hidden>No matching files.</p>
          <section id="picker" aria-label="Placement picker" hidden><div class="picker-heading"><strong id="picker-title"></strong><button id="close-picker" aria-label="Close placement picker">×</button></div><div id="placement-options"></div><label id="remember-label"><input id="remember" type="checkbox"> <span id="remember-text"></span></label><p id="picker-help" class="muted"></p></section>
        </section>
        <div class="beat-heading"><span id="beat-position"></span><button id="reset-layout">Reset layout</button></div><div id="narration" class="narration" aria-live="polite"></div>
        <p id="sequence-note" class="muted" hidden>Sequence mode keeps small editors readable. <button id="sequence-override">Show multiple groups</button></p>
        <p id="warnings" class="muted"></p><div class="navigation"><button id="previous-beat" data-action="previousBeat">← Previous beat</button><button id="next-beat" data-action="nextBeat">Next beat →</button></div>
        <div class="navigation stops"><button id="previous-stop" data-action="previousStop">Previous stop</button><button id="next-stop" data-action="nextStop">Next stop</button></div>
        <button id="end-tour" class="end">End tour</button></section><p id="error" role="alert"></p></main><script nonce="${nonce}" src="${model}"></script><script nonce="${nonce}" src="${script}"></script></body></html>`;
      const sub = view.webview.onDidReceiveMessage(async (message) => {
        if (!message || typeof message !== "object") return;
        try {
          const api = controller();
          if (message.type === "ready") { publish(latest); return; }
          if (message.type === "navigate") await api.navigate({ action: message.action, expectedRevision: message.revision });
          else if (message.type === "state") await api.setState({ mode: message.mode, expectedRevision: message.revision });
          else if (message.type === "focus") await api.focus({ anchor: message.anchor, expectedRevision: message.revision });
          else if (message.type === "layout") await api.layout({ action: message.action, anchor: message.anchor, placement: message.placement, pinned: message.pinned, remember: message.remember, expectedRevision: message.revision });
          else if (message.type === "quickPick") await vscode.commands.executeCommand("kanko.tour.quickPick");
          else if (message.type === "sequenceOverride") await api.layout({ action: "overrideSequence", expectedRevision: message.revision });
          else if (message.type === "clear") await api.clear();
        } catch (error) { view?.webview.postMessage({ type: "error", message: error.message }); }
      });
      resolved.onDidDispose(() => { sub.dispose(); if (view === resolved) view = null; });
      publish(latest);
    },
  };
}
module.exports = { createTourView };
