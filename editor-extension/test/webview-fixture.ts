import type { Uri, Webview, WebviewView } from "vscode";
import type { ViewApi } from "../src/host/native.js";
import type { TourController } from "../src/host/tour-controller.js";
import { uri } from "./factories.js";

export function webviewFixture() {
  const messages: unknown[] = [];
  let listener: (message: unknown) => unknown = () => {};
  const event = () => ({ dispose() {} });
  const webview: Webview = {
    html: "",
    options: {},
    cspSource: "vscode-resource:",
    asWebviewUri: (value) => value,
    postMessage: async (value) => {
      messages.push(value);
      return true;
    },
    onDidReceiveMessage: (next) => {
      listener = next;
      return event();
    },
  };
  const view: WebviewView = {
    webview,
    viewType: "test",
    visible: true,
    show() {},
    onDidDispose: event,
    onDidChangeVisibility: event,
  };
  const api = {
    Uri: {
      joinPath: (base: Uri, ...parts: string[]) =>
        uri([base.toString(), ...parts].join("/")),
    },
    commands: { executeCommand: async () => {} },
  } as unknown as ViewApi;
  const calls: unknown[] = [];
  const handle = async (body?: unknown) => {
    calls.push(body);
    return { loaded: false as const, revision: 0 };
  };
  const controller: Pick<
    TourController,
    "layout" | "navigate" | "focus" | "setState" | "clear"
  > = {
    layout: handle,
    navigate: handle,
    focus: handle,
    setState: handle,
    clear: handle,
  };
  return {
    api,
    controller,
    calls,
    view,
    webview,
    messages,
    receive: (message: unknown) => listener(message),
  };
}
