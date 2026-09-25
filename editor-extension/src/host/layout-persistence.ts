import type { AnchorRole, TourStop } from "../shared/tour.js";
import type { RolePreference, SavedStopLayout } from "../shared/layout.js";
import type { TourState } from "./state.js";
import { compatible, stopIdentity, type LayoutState } from "./layout-state.js";

export function createLayoutPersistence(storage: LayoutState) {
  let layouts: Record<string, unknown> = {};
  let preferences = new Map<string, RolePreference>();
  function load(state: TourState) {
    const saved = storage.read(state);
    layouts = saved.layouts;
    preferences = new Map(Object.entries(saved.preferences));
  }
  function readCompatibleStop(
    state: TourState,
    stop: TourStop,
    maxGroups: number,
  ) {
    const saved = layouts[stop.id];
    if (compatible(saved, state, stop, maxGroups)) return saved;
    delete layouts[stop.id];
    return undefined;
  }
  async function save(
    state: TourState,
    layout: Omit<SavedStopLayout, "identity">,
  ) {
    const stop = state.plan.stops[state.stopIndex];
    layouts[stop.id] = { identity: stopIdentity(state, stop), ...layout };
    await storage.write(state, {
      layouts,
      preferences: Object.fromEntries(preferences),
    });
  }
  return {
    load,
    readCompatibleStop,
    save,
    preference: (role: AnchorRole) => preferences.get(role),
    remember: (role: AnchorRole, preference: RolePreference) =>
      preferences.set(role, preference),
    preferences: () => Object.fromEntries(preferences),
    clear() {
      layouts = {};
      preferences.clear();
    },
  };
}
