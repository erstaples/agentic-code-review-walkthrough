// Generated from TypeScript. Run npm run runtime:build in editor-extension.
export interface BridgeLock {
  pid: number;
  port: number;
  authToken: string;
  protocolVersion: number;
  workspaceFolders: string[];
  [key: string]: unknown;
}
interface LockFiles {
  readdirSync(path: string): string[];
  readFileSync(path: string, encoding: "utf8"): string;
  unlinkSync(path: string): void;
}
interface DiscoveryOptions {
  dir: string;
  cwd: string;
  fs?: LockFiles;
  isAlive?: (pid: number) => boolean;
  protocolVersion: number;
}
declare function defaultIsAlive(pid: number): boolean;
declare function resolveLock({
  dir,
  cwd,
  fs,
  isAlive,
  protocolVersion,
}: DiscoveryOptions): BridgeLock;
export { resolveLock, defaultIsAlive };
