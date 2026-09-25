// The annotated contract constants list every member of their declared unions.
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

// External JSON is accepted as unknown; the reader receives a typed anchor.
validateTourPlan(JSON.parse("{}"), {
  readSource: (anchor) => ({ base: null, head: anchor.path }),
});
// @ts-expect-error A source reader must report both sides.
validateTourPlan({}, { readSource: () => ({ head: "" }) });
