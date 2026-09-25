interface LockInfo {
  port: number;
  protocolVersion: number;
  authToken: string;
  pid: number;
  ideName: string;
  extensionVersion: string;
  workspaceFolders: string[];
}

import * as fs from "node:fs";
import * as path from "node:path";

function writeLock(dir: string, info: LockInfo) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${info.port}.lock`);
  fs.writeFileSync(file, JSON.stringify(info), { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return file;
}

function removeLock(file: string | undefined) {
  try {
    if (file) fs.unlinkSync(file);
  } catch {
    // Already gone, or never written. Deactivation must not throw.
  }
}

export { writeLock, removeLock };
