import type { SidebarMessage, SidebarRequest } from "../shared/messages.js";

declare function acquireVsCodeApi(): {
  postMessage(message: SidebarMessage): void;
};
const vscode = acquireVsCodeApi();
let revision = 0;
export function setRevision(value: number) {
  revision = value;
}
export function send(message: SidebarRequest) {
  vscode.postMessage({ ...message, revision });
}
export function ready() {
  vscode.postMessage({ type: "ready" });
}
