// Generated from TypeScript. Run npm run runtime:build in editor-extension.
import type { BridgeLock } from "./discovery.js";
import { PROTOCOL_VERSION } from "../../shared/protocol.js";
declare function request(
  lock: Pick<BridgeLock, "port" | "authToken">,
  method: string,
  route: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>>;
export { request, PROTOCOL_VERSION };
