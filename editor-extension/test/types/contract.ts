// Each list must include every declared value.
import type {
  ErrorCode,
  ProtocolMode,
  ProtocolSide,
  StopType,
} from "../../../contract/contract-types.js";
import {
  ERROR_CODES,
  MODES,
  SIDES,
  STOP_TYPES,
} from "../../../contract/protocol.js";
import { validateTourPlan } from "../../../contract/tour.js";
import type { Equal, Expect } from "./assert.js";

export type Checks = [
  Expect<Equal<(typeof ERROR_CODES)[number], ErrorCode>>,
  Expect<Equal<(typeof SIDES)[number], ProtocolSide>>,
  Expect<Equal<(typeof MODES)[number], ProtocolMode>>,
  Expect<Equal<(typeof STOP_TYPES)[number], StopType>>,
];

// The source reader receives a checked anchor.
validateTourPlan(JSON.parse("{}"), {
  readSource: (anchor) => ({ base: null, head: anchor.path }),
});
// @ts-expect-error A source reader must report both sides.
validateTourPlan({}, { readSource: () => ({ head: "" }) });

import type { TourAnchor, TourPlanInput } from "../../src/shared/tour.js";

export function optionalMetadata(input: unknown) {
  const result = validateTourPlan(input, {
    readSource: () => ({ base: "", head: "" }),
  });
  if (!result.ok) return;
  // @ts-expect-error The plan ID is not checked.
  result.plan.id?.toUpperCase();
  // @ts-expect-error The plan title is not checked.
  result.plan.title?.toUpperCase();
  // @ts-expect-error Coverage IDs are not checked.
  result.plan.stops[0].coveredEntityIds?.map((id: string) => id.toUpperCase());
  // @ts-expect-error The stop type is not checked.
  result.plan.stops[0].type?.toUpperCase();
}

export function normalizeInput(input: TourPlanInput) {
  // @ts-expect-error Input anchors may omit defaults.
  const before: TourAnchor = input.stops[0].anchors[0];
  const result = validateTourPlan(input, {
    readSource: () => ({ base: "", head: "" }),
  });
  if (result.ok) {
    const after: TourAnchor = result.plan.stops[0].anchors[0];
    return after;
  }
  return before;
}
