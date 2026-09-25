// Compile-time checks for loaded-state narrowing and validated data.
import type { TourSnapshot } from "../../src/shared/snapshot.js";
import type { ValidationResult } from "../../src/shared/tour.js";
import { compatible } from "../../src/host/layout-state.js";
import { rows } from "../../src/shared/sidebar-model.js";

export function stopTitle(snapshot: TourSnapshot): string | null {
  // @ts-expect-error An unloaded snapshot has no stop.
  snapshot.stop.title;
  if (!snapshot.loaded) return null;
  rows(snapshot);
  return snapshot.stop.title;
}

export function planStops(result: ValidationResult): number {
  // @ts-expect-error A plan exists only after successful validation.
  result.plan.stops.length;
  return result.ok ? result.plan.stops.length : result.findings.length;
}

export function restorable(saved: unknown, stop: { anchors: []; beats: [] }) {
  // @ts-expect-error Stored layouts are untrusted until checked.
  saved.layout;
  if (!compatible(saved, { identity: "digest" }, stop, 3)) return null;
  return saved.slots.map((slot) => slot.anchor);
}
