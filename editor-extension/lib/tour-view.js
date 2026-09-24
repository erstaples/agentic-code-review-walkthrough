"use strict";

const crypto = require("node:crypto");
function createTourView(vscode, extensionUri, controller) {
  let view, latest = { loaded: false, revision: 0 };
  const publish = (snapshot) => { latest = snapshot; return view?.webview.postMessage({ type: "snapshot", snapshot }); };
  return {
    publish,
    resolveWebviewView(resolved) {
      view = resolved;
      const media = vscode.Uri.joinPath(extensionUri, "media");
      view.webview.options = { enableScripts: true, localResourceRoots: [media] };
      const script = view.webview.asWebviewUri(vscode.Uri.joinPath(media, "tour.js"));
      const css = view.webview.asWebviewUri(vscode.Uri.joinPath(media, "tour.css"));
      const nonce = crypto.randomBytes(24).toString("base64url");
      view.webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${view.webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${css}"></head><body>
        <main><div class="eyebrow">CODE WALKTHROUGH</div><h1 id="tour-title">Your tour, one beat at a time.</h1>
        <p id="empty">Load a tour from your agent to begin.</p><section id="tour" hidden>
        <div class="progress"><span id="position"></span><span id="risk" class="risk"></span></div>
        <h2 id="stop-title"></h2><div id="revisions" class="revisions"></div>
        <nav class="modes" aria-label="Presentation mode"><button data-mode="following">Following</button><button data-mode="exploring">Exploring</button><button data-mode="paused">Paused</button></nav>
        <p id="mode-help" class="muted"></p><div id="narration" class="narration" aria-live="polite"></div>
        <p id="warnings" class="muted"></p><div class="navigation"><button id="previous-beat" data-action="previousBeat">← Previous beat</button><button id="next-beat" data-action="nextBeat">Next beat →</button></div>
        <div class="navigation stops"><button id="previous-stop" data-action="previousStop">Previous stop</button><button id="next-stop" data-action="nextStop">Next stop</button></div>
        <button id="end-tour" class="end">End tour</button></section><p id="error" role="alert"></p></main><script nonce="${nonce}" src="${script}"></script></body></html>`;
      const sub = view.webview.onDidReceiveMessage(async (message) => {
        if (!message || typeof message !== "object") return;
        try {
          const api = controller();
          if (message.type === "ready") { publish(latest); return; }
          if (message.type === "navigate") await api.navigate({ action: message.action, expectedRevision: message.revision });
          else if (message.type === "state") await api.setState({ mode: message.mode, expectedRevision: message.revision });
          else if (message.type === "focus") await api.focus({ anchor: message.anchor, expectedRevision: message.revision });
          else if (message.type === "clear") await api.clear();
        } catch (error) { view?.webview.postMessage({ type: "error", message: error.message }); }
      });
      resolved.onDidDispose(() => { sub.dispose(); if (view === resolved) view = null; });
      publish(latest);
    },
  };
}
module.exports = { createTourView };
