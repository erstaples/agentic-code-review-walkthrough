import type {
  HostMessage,
  SidebarMessage,
  SidebarRequest,
} from "../shared/messages.js";
import type { TourSnapshot } from "../shared/snapshot.js";

export interface SidebarState {
  snapshot: TourSnapshot;
  error: string;
  selection: Extract<HostMessage, { type: "selectAnchor" }> | null;
}

export function createBridge(
  api: { postMessage(message: SidebarMessage): void },
  target: Window,
) {
  let state: SidebarState = {
    snapshot: { loaded: false, revision: 0 },
    error: "",
    selection: null,
  };
  const listeners = new Set<() => void>();
  const receive = ({ data }: MessageEvent<HostMessage>) => {
    if (data.type === "snapshot") {
      if (data.snapshot.revision < state.snapshot.revision) return;
      state = { snapshot: data.snapshot, error: "", selection: null };
    } else if (data.type === "error") state = { ...state, error: data.message };
    else if (data.type === "selectAnchor")
      state = { ...state, selection: data };
    else return;
    for (const listener of listeners) listener();
  };
  return {
    getState: () => state,
    subscribe(listener: () => void) {
      if (!listeners.size) target.addEventListener("message", receive);
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        if (!listeners.size) target.removeEventListener("message", receive);
      };
    },
    send(message: SidebarRequest) {
      api.postMessage({ ...message, revision: state.snapshot.revision });
    },
    ready() {
      api.postMessage({ type: "ready" });
    },
  };
}
export type SidebarBridge = ReturnType<typeof createBridge>;

declare function acquireVsCodeApi(): {
  postMessage(message: SidebarMessage): void;
};

export function connectBridge() {
  return createBridge(acquireVsCodeApi(), window);
}
