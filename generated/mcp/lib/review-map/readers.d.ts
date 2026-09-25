// Generated from TypeScript. Run npm run runtime:build in editor-extension.
import type {
  Actor,
  Command,
  EntityInput,
  MapMeta,
  Selection,
} from "./types.js";
export declare function validateEventPayload(value: unknown): void;
export declare function readActor(value: unknown): Actor;
export declare function readSelection(value: unknown): Selection;
export declare function readEntityInput(value: unknown): EntityInput;
export declare function readCommand(value: unknown): Command;
export declare function readMeta(value: unknown): MapMeta;
export declare function readMapRequest<
  K extends keyof import("./types.js").MapRequests,
>(method: K, value: unknown): import("./types.js").MapRequests[K];
