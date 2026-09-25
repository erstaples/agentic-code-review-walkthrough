// Compile-time checks, run by `npm run typecheck`. Each @ts-expect-error must
// be an error; an unused one fails the check. Nothing here executes.
import type {
  HostMessage,
  RevisionedMessage,
  SidebarMessage,
  SidebarRequest,
} from "../../src/shared/messages.js";
import { REVISIONED_MESSAGE_TYPES } from "../../src/shared/messages.js";
import type { PlacementChoice } from "../../src/shared/layout.js";
import type { Equal, Expect } from "./assert.js";

export const valid: SidebarMessage[] = [
  { type: "ready" },
  { type: "navigate", action: "nextBeat", revision: 3 },
  { type: "state", mode: "paused", revision: 3 },
  { type: "focus", anchor: 2, revision: 3 },
  {
    type: "layout",
    action: "place",
    anchor: 2,
    placement: { kind: "replace", of: 1 },
    remember: true,
    revision: 3,
  },
  {
    type: "layout",
    action: "place",
    anchor: 2,
    placement: { kind: "peek" },
    revision: 3,
  },
  { type: "layout", action: "pin", anchor: 2, pinned: false, revision: 3 },
  { type: "layout", action: "reset", revision: 3 },
  { type: "sequenceOverride", revision: 3 },
  { type: "quickPick", revision: 3 },
  { type: "clear" },
];

export const invalid: SidebarMessage[] = [
  // @ts-expect-error Presentation changes must quote a revision.
  { type: "navigate", action: "nextBeat" },
  // @ts-expect-error Only the four stepwise actions come from the sidebar.
  { type: "navigate", action: "goto", revision: 1 },
  // @ts-expect-error A mode change needs a known mode.
  { type: "state", mode: "stopped", revision: 1 },
  // @ts-expect-error Placement needs a placement choice.
  { type: "layout", action: "place", anchor: 1, revision: 1 },
  // @ts-expect-error Pinning states the requested pin state.
  { type: "layout", action: "pin", anchor: 1, revision: 1 },
  // @ts-expect-error Sequence override is its own message, not a layout action.
  { type: "layout", action: "overrideSequence", revision: 1 },
  // @ts-expect-error Focus names an anchor.
  { type: "focus", revision: 1 },
  // @ts-expect-error Unknown message type.
  { type: "reload" },
];

export const placements: PlacementChoice[] = [
  // @ts-expect-error Replace and split placements target an anchor's group.
  { kind: "replace" },
  // @ts-expect-error Peek does not target a group.
  { kind: "peek", of: 1 },
  // @ts-expect-error Unknown placement kind.
  { kind: "above", of: 1 },
];

// The bridge adds the revision; requests must not choose their own.
export const request: SidebarRequest = { type: "navigate", action: "nextStop" };
// @ts-expect-error A request without its required fields is incomplete.
export const incompleteRequest: SidebarRequest = { type: "focus" };

// The host's revision guard covers every revisioned message type.
export type RevisionGuardIsComplete = Expect<
  Equal<(typeof REVISIONED_MESSAGE_TYPES)[number], RevisionedMessage["type"]>
>;

export function describe(message: HostMessage): string {
  switch (message.type) {
    case "snapshot":
      return message.snapshot.loaded ? message.snapshot.stop.title : "empty";
    case "selectAnchor":
      return `anchor ${message.anchor}`;
    case "error":
      return message.message;
    default: {
      const unhandled: never = message;
      return unhandled;
    }
  }
}
