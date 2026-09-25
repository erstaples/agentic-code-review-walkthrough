// Generated from TypeScript. Run npm run runtime:build in editor-extension.
import type { StoredEvent, Aggregate } from "./types.js";
import type { buildReceipt } from "./receipt.js";
declare function validateEvent(event: unknown): asserts event is StoredEvent;
declare function validateSnapshot(state: Aggregate): boolean;
declare function validateReceipt(
  receipt: ReturnType<typeof buildReceipt>,
): boolean;
export { validateEvent, validateSnapshot, validateReceipt };
