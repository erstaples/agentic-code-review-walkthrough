const fs = require("node:fs");
const path = require("node:path");
const { runTests } = require("@vscode/test-electron");

function clearStaleLock() {
  const lockPath = path.resolve(__dirname, "../../.vscode-test/user-data/code.lock");
  if (!fs.existsSync(lockPath)) return;
  const pid = Number(fs.readFileSync(lockPath, "utf8").trim());
  let alive = false;
  try {
    process.kill(pid, 0);
    alive = true;
  } catch {
    alive = false;
  }
  if (!alive) fs.unlinkSync(lockPath);
}

// Stale Workspaces/Backups state from a previous run makes the extension host
// relaunch repeatedly, producing duplicated output and spurious failures.
function clearStaleUserDataDirs() {
  const userDataDir = path.resolve(__dirname, "../../.vscode-test/user-data");
  for (const name of ["Workspaces", "Backups"]) {
    fs.rmSync(path.join(userDataDir, name), { recursive: true, force: true });
  }
}

clearStaleLock();
clearStaleUserDataDirs();

runTests({
  extensionDevelopmentPath: path.resolve(__dirname, "../.."),
  extensionTestsPath: path.resolve(__dirname, "./index.js"),
  launchArgs: [path.resolve(__dirname, "../.."), "--disable-extensions", "--disable-gpu"],
}).catch((err) => {
  console.error(err);
  process.exit(1);
});
