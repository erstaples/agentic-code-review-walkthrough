import type { Uri, WebviewView } from "vscode";
import type { ViewApi } from "./native.js";
import type { TourController } from "./tour-controller.js";
import type { TourSnapshot } from "../shared/snapshot.js";
import { isRecord, errorMessage } from "./requests.js";

import * as crypto from "node:crypto";
import {
  REVISIONED_MESSAGE_TYPES,
  type HostMessage,
} from "../shared/messages.js";
function createTourView(
  vscode: ViewApi,
  extensionUri: Uri,
  controller: () => Pick<
    TourController,
    "navigate" | "setState" | "focus" | "layout" | "clear"
  >,
) {
  let view: WebviewView | undefined,
    pendingAnchor: number | undefined,
    ready = false;
  let latest: TourSnapshot = { loaded: false, revision: 0 };
  const publish = (snapshot: TourSnapshot) => {
    latest = snapshot;
    return view?.webview.postMessage({
      type: "snapshot",
      snapshot,
    } satisfies HostMessage);
  };
  return {
    publish,
    async showAnchor(anchor: number) {
      await vscode.commands.executeCommand("kanko.tour.focus");
      view?.show?.(false);
      pendingAnchor = anchor;
      if (ready) {
        await view?.webview.postMessage({
          type: "selectAnchor",
          anchor,
        } satisfies HostMessage);
        pendingAnchor = undefined;
      }
    },
    resolveWebviewView(resolved: WebviewView) {
      view = resolved;
      ready = false;
      const media = vscode.Uri.joinPath(extensionUri, "media");
      const dist = vscode.Uri.joinPath(extensionUri, "dist");
      view.webview.options = {
        enableScripts: true,
        localResourceRoots: [media, dist],
      };
      const script = view.webview.asWebviewUri(
        vscode.Uri.joinPath(dist, "webview.js"),
      );
      const css = view.webview.asWebviewUri(
        vscode.Uri.joinPath(media, "tour.css"),
      );
      const nonce = crypto.randomBytes(24).toString("base64url");
      view.webview.html = `<!doctype html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${view.webview.cspSource}; script-src 'nonce-${nonce}';"><link rel="stylesheet" href="${css}"></head><body>
        <div id="root"></div><script nonce="${nonce}" src="${script}"></script></body></html>`;
      const sub = view.webview.onDidReceiveMessage(async (message: unknown) => {
        if (!isRecord(message)) return;
        try {
          const api = controller();
          if (message.type === "ready") {
            ready = true;
            await publish(latest);
            if (pendingAnchor !== undefined) {
              await resolved.webview.postMessage({
                type: "selectAnchor",
                anchor: pendingAnchor,
              } satisfies HostMessage);
              pendingAnchor = undefined;
            }
            return;
          }
          if (
            REVISIONED_MESSAGE_TYPES.some((type) => type === message.type) &&
            !Number.isInteger(message.revision)
          )
            throw new Error(
              "Use the latest tour snapshot before changing the presentation.",
            );
          if (message.type === "navigate")
            await api.navigate({
              action: message.action,
              expectedRevision: message.revision,
            });
          else if (message.type === "state")
            await api.setState({
              mode: message.mode,
              expectedRevision: message.revision,
            });
          else if (message.type === "focus")
            await api.focus({
              anchor: message.anchor,
              expectedRevision: message.revision,
            });
          else if (message.type === "layout")
            await api.layout({
              action: message.action,
              anchor: message.anchor,
              placement: message.placement,
              pinned: message.pinned,
              remember: message.remember,
              expectedRevision: message.revision,
            });
          else if (message.type === "quickPick")
            await vscode.commands.executeCommand("kanko.tour.quickPick");
          else if (message.type === "sequenceOverride")
            await api.layout({
              action: "overrideSequence",
              expectedRevision: message.revision,
            });
          else if (message.type === "clear") await api.clear();
        } catch (error) {
          view?.webview.postMessage({
            type: "error",
            message: errorMessage(error),
          } satisfies HostMessage);
        }
      });
      resolved.onDidDispose(() => {
        sub.dispose();
        if (view === resolved) view = undefined;
      });
      publish(latest);
    },
  };
}
export { createTourView };
