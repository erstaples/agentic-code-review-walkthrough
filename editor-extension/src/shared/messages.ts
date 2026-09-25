import type { LayoutAction } from "./layout.js";
import type { PresentationMode, TourSnapshot } from "./snapshot.js";

// ---- Host to sidebar ----

export type HostMessage =
  | { type: "snapshot"; snapshot: TourSnapshot }
  | {
      type: "selectAnchor";
      anchor: number;
      /** Opens the placement picker. The sidebar honors it; the host does not send it yet. */
      move?: boolean;
    }
  | { type: "error"; message: string };

// ---- Sidebar to host ----

export type NavigationAction =
  "nextBeat" | "previousBeat" | "nextStop" | "previousStop";

/**
 * Actions that change the presentation quote the snapshot revision they were
 * chosen from. The host rejects missing and stale revisions.
 */
export type Revisioned<T> = T & { revision: number };

export type NavigateMessage = Revisioned<{
  type: "navigate";
  action: NavigationAction;
}>;
export type StateMessage = Revisioned<{
  type: "state";
  mode: PresentationMode;
}>;
export type FocusMessage = Revisioned<{ type: "focus"; anchor: number }>;
export type LayoutMessage = Revisioned<
  { type: "layout" } & Exclude<LayoutAction, { action: "overrideSequence" }>
>;
export type SequenceOverrideMessage = Revisioned<{ type: "sequenceOverride" }>;

export type RevisionedMessage =
  | NavigateMessage
  | StateMessage
  | FocusMessage
  | LayoutMessage
  | SequenceOverrideMessage;

/** Requests that do not depend on what the sidebar last saw. */
export type UnrevisionedMessage =
  | { type: "ready" }
  | { type: "quickPick"; revision?: number }
  | { type: "clear"; revision?: number };

export type SidebarMessage = RevisionedMessage | UnrevisionedMessage;

/** Message types the host refuses without a current revision. */
export const REVISIONED_MESSAGE_TYPES = [
  "navigate",
  "state",
  "focus",
  "layout",
  "sequenceOverride",
] as const satisfies readonly RevisionedMessage["type"][];

/** An outgoing message before the bridge adds the current revision. */
export type SidebarRequest =
  | Omit<NavigateMessage, "revision">
  | Omit<StateMessage, "revision">
  | Omit<FocusMessage, "revision">
  | DistributiveOmit<LayoutMessage, "revision">
  | Omit<SequenceOverrideMessage, "revision">
  | { type: "quickPick" }
  | { type: "clear" };

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown
  ? Omit<T, K>
  : never;
