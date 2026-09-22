"use strict";

const cp = require("node:child_process");
const util = require("node:util");
const execFile = util.promisify(cp.execFile);

async function run(cwd, args) {
  try {
    const { stdout } = await execFile("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    return stdout;
  } catch (err) {
    throw Object.assign(new Error(`git ${args.join(" ")} failed: ${String(err.stderr || err.message).trim()}`), { code: "git_failed" });
  }
}

async function revParse(cwd, ref) {
  return (await run(cwd, ["rev-parse", "--verify", `${ref}^{commit}`])).trim();
}

async function changedFiles(cwd, base, head) {
  const stdout = await run(cwd, ["diff", "--name-status", "-z", "--relative", "--find-renames", base, head, "--"]);
  const fields = stdout.split("\0");
  const changes = [];
  for (let i = 0; i < fields.length && fields[i] !== ""; ) {
    const status = fields[i++];
    if (status.startsWith("R") || status.startsWith("C")) {
      changes.push({ status: status[0], sourcePath: fields[i++], targetPath: fields[i++] });
    } else {
      const p = fields[i++];
      changes.push({ status: status[0], sourcePath: p, targetPath: p });
    }
  }
  return changes;
}

// The "./" prefix keeps relPath resolved against cwd rather than the repo
// root, matching changedFiles' --relative output for a nested workspace.
async function blobLines(cwd, ref, relPath) {
  const stdout = await run(cwd, ["show", `${ref}:./${relPath}`]);
  return stdout.split("\n").length;
}

const gitUriQuery = (absPath, ref) => JSON.stringify({ path: absPath, ref });

module.exports = { revParse, changedFiles, gitUriQuery, blobLines };
