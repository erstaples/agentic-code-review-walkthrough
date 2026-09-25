// Generated from TypeScript. Run npm run runtime:build in editor-extension.
import type { BridgeLock } from "./discovery.js";
import { PROTOCOL_VERSION } from "../../shared/protocol.js";
declare function request(
  lock: BridgeLock,
  method: string,
  route: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>>;
export { request, PROTOCOL_VERSION };
