import type { LayoutAction } from "./layout.js";
import type { PresentationMode, TourSnapshot } from "./snapshot.js";

export type HostMessage =
  | { type: "snapshot"; snapshot: TourSnapshot }
  | {
      type: "selectAnchor";
      anchor: number;
      /** Opens the picker; currently unused by the host. */
      move?: boolean;
    }
  | { type: "error"; message: string };

export type NavigationAction =
  "nextBeat" | "previousBeat" | "nextStop" | "previousStop";

/** Include the latest snapshot revision. */
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

export type UnrevisionedMessage =
  | { type: "ready" }
  | { type: "quickPick"; revision?: number }
  | { type: "clear"; revision?: number };

export type SidebarMessage = RevisionedMessage | UnrevisionedMessage;

export const REVISIONED_MESSAGE_TYPES = [
  "navigate",
  "state",
  "focus",
  "layout",
  "sequenceOverride",
] as const satisfies readonly RevisionedMessage["type"][];

/** The bridge adds the revision before sending. */
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
