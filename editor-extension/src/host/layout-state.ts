import { createHash } from "node:crypto";
import { ROLES } from "../../lib/tour-contract.js";
import type {
  LayoutMemory,
  RolePreferences,
  SavedStopLayout,
  StoredLayoutState,
} from "../shared/layout.js";
import type { TourStop } from "../shared/tour.js";
import { SHAPES } from "./layout-model.js";

export interface LayoutStateKey {
  workspace: string;
  tourId: string;
  /** The review change's manifest digest. */
  identity: string;
}

export interface LayoutMemento {
  get(key: string): unknown;
  update(key: string, value: unknown): PromiseLike<void>;
}

/** Check each saved layout before restoring it. */
export interface StoredLayouts {
  preferences: RolePreferences;
  layouts: Record<string, unknown>;
}

export interface LayoutState {
  read(state: LayoutStateKey): StoredLayouts;
  write(state: LayoutStateKey, value: LayoutMemory): Promise<void>;
}

const roles = new Set<string>(ROLES);
const slots = new Set<string>(
  Object.values(SHAPES).flatMap((shape) => shape.slots),
);
const MAX_LAYOUT_DEPTH = 4;
const MAX_CHILD_GROUPS = 4;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Sort object keys before hashing. */
function digest(value: unknown): string {
  const stable = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(stable);
    if (isRecord(item)) {
      const keys = Object.keys(item).sort();
      return Object.fromEntries(keys.map((key) => [key, stable(item[key])]));
    }
    return item;
  };
  return createHash("sha256")
    .update(JSON.stringify(stable(value)))
    .digest("hex");
}

export function stopIdentity(
  state: Pick<LayoutStateKey, "identity">,
  stop: Pick<TourStop, "anchors" | "beats">,
): string {
  return digest({
    identity: state.identity,
    anchors: stop.anchors,
    beats: stop.beats,
  });
}

/** Returns the group count, or 0 for invalid or oversized layouts. */
export function validLayout(value: unknown, cap: number): number {
  if (
    !isRecord(value) ||
    !Array.isArray(value.groups) ||
    (value.orientation !== 0 && value.orientation !== 1)
  )
    return 0;
  let leaves = 0;
  function validNode(node: unknown, depth = 0): boolean {
    if (!isRecord(node) || depth > MAX_LAYOUT_DEPTH) return false;
    const { size, groups, orientation } = node;
    if (
      size !== undefined &&
      (typeof size !== "number" || !Number.isFinite(size) || size <= 0)
    ) {
      return false;
    }
    if (orientation !== undefined && orientation !== 0 && orientation !== 1)
      return false;
    if (groups === undefined) {
      leaves++;
      return true;
    }
    return (
      Array.isArray(groups) &&
      groups.length > 0 &&
      groups.length <= MAX_CHILD_GROUPS &&
      (orientation === undefined || orientation === 0 || orientation === 1) &&
      groups.every((group) => validNode(group, depth + 1))
    );
  }
  return validNode(value) && leaves > 0 && leaves <= cap ? leaves : 0;
}

/** Checks the saved layout, stop identity, and anchor assignments. */
export function compatible(
  saved: unknown,
  state: Pick<LayoutStateKey, "identity">,
  stop: Pick<TourStop, "anchors" | "beats">,
  cap: number,
): saved is SavedStopLayout {
  if (!isRecord(saved)) return false;
  const count = validLayout(saved.layout, cap);
  if (!count || saved.identity !== stopIdentity(state, stop)) return false;
  const savedSlots = saved.slots;
  if (!Array.isArray(savedSlots) || savedSlots.length !== count) return false;
  const flags = ["customized", "sequence", "override"] as const;
  if (!flags.every((flag) => typeof saved[flag] === "boolean")) return false;

  const numbers = new Set<unknown>(stop.anchors.map((anchor) => anchor.n));
  const used = new Set<unknown>();
  return savedSlots.every((slot: unknown) => {
    if (
      !isRecord(slot) ||
      typeof slot.pinned !== "boolean" ||
      !Number.isFinite(slot.lastActive)
    ) {
      return false;
    }
    if (slot.anchor === null) return !slot.pinned;
    if (!numbers.has(slot.anchor) || used.has(slot.anchor)) return false;
    used.add(slot.anchor);
    return true;
  });
}

function validPreferences(value: unknown): RolePreferences {
  const entries = isRecord(value) ? Object.entries(value) : [];
  return Object.fromEntries(
    entries.filter(
      ([role, preference]) =>
        roles.has(role) &&
        isRecord(preference) &&
        preference.kind === "replace" &&
        typeof preference.slot === "string" &&
        slots.has(preference.slot),
    ),
  );
}

// Save arrangements in the VS Code profile, using anchor numbers for tabs.
export function createLayoutState(memento?: LayoutMemento): LayoutState {
  const storageKey = (state: LayoutStateKey) =>
    `kanko.layout.${digest([state.workspace, state.tourId])}`;
  return {
    read(state) {
      const stored = memento?.get(storageKey(state));
      const value =
        isRecord(stored) && stored.version === 1 ? stored : undefined;
      const layouts =
        value && value.identity === state.identity && isRecord(value.layouts)
          ? structuredClone(value.layouts)
          : {};
      return { preferences: validPreferences(value?.preferences), layouts };
    },
    async write(state, value) {
      const stored: StoredLayoutState = {
        version: 1,
        identity: state.identity,
        ...structuredClone(value),
      };
      await memento?.update(storageKey(state), stored);
    },
  };
}
