import * as assert from "node:assert/strict";
import type { ReviewMapService } from "../generated/mcp/lib/review-map/service.js";
import { errorFields } from "../generated/mcp/lib/input.js";

export function record(value: unknown): Record<string, unknown> {
  assert.ok(
    value !== null && typeof value === "object" && !Array.isArray(value),
  );
  return value as Record<string, unknown>;
}
export function records(value: unknown): Record<string, unknown>[] {
  assert.ok(Array.isArray(value));
  return value.map(record);
}
export function string(value: unknown): string {
  assert.equal(typeof value, "string");
  return value as string;
}
export function openedMap(value: ReturnType<ReviewMapService["open"]>) {
  assert.ok("mapId" in value, "expected an opened review map");
  return value;
}
export function findings(error: unknown) {
  return records(record(errorFields(error).details).findings);
}

export function present<T>(value: T | null | undefined): T {
  assert.ok(value !== null && value !== undefined);
  return value;
}
