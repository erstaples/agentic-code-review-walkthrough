"use strict";

const cp = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { buildFixtureRepo } = require("../../e2e/lib/fixture-repo.js");

const DEFAULT_ROOT = path.join(os.homedir(), ".cache", "kanko-sim");

function git(cwd, args) {
  return cp.execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

// A tour's fixture repo lives at a stable path so VS Code can keep it open
// between runs and a paused review can resume against the same dossier. The
// repo is rebuilt only when the tour's repo block changes, or on --reset.
function prepareFixture(tour, { root = DEFAULT_ROOT, reset = false } = {}) {
  const dir = path.join(root, tour.name);
  const repoDir = path.join(dir, "repo");
  const stateDir = path.join(dir, "state");
  const marker = path.join(dir, "fixture.sha256");
  const digest = crypto.createHash("sha256").update(JSON.stringify(tour.repo)).digest("hex");
  const current = fs.existsSync(marker) && fs.readFileSync(marker, "utf8").trim() === digest && fs.existsSync(path.join(repoDir, ".git"));

  let rebuilt = false;
  if (reset || !current) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    buildFixtureRepo(dir, tour.repo);
    // Workspace settings written by the state gallery stay out of the change.
    fs.appendFileSync(path.join(repoDir, ".git", "info", "exclude"), "\n.vscode/\n");
    fs.writeFileSync(marker, digest + "\n");
    rebuilt = true;
  }

  const workspace = fs.realpathSync(repoDir);
  const baseName = tour.repo.baseBranch || "main";
  const headName = tour.repo.head ? tour.repo.headBranch || "feature" : baseName;
  return {
    workspace,
    stateDir,
    rebuilt,
    fixture: true,
    base: { sha: git(workspace, ["rev-parse", `${baseName}^{commit}`]), name: baseName },
    head: tour.mode === "working-tree"
      ? { sha: "WORKTREE", name: "working tree" }
      : { sha: git(workspace, ["rev-parse", `${headName}^{commit}`]), name: headName },
  };
}

// Points the simulator at an existing repository instead of a fixture. Its
// dossier state still lives under the simulator root, never in the repo.
function useRepository(repoPath, tour, { root = DEFAULT_ROOT } = {}) {
  const workspace = fs.realpathSync(git(path.resolve(repoPath), ["rev-parse", "--show-toplevel"]));
  const key = crypto.createHash("sha256").update(workspace).digest("hex").slice(0, 12);
  const resolve = (ref) => git(workspace, ["rev-parse", "--verify", `${ref}^{commit}`]);
  return {
    workspace,
    stateDir: path.join(root, `repo-${key}`, "state"),
    rebuilt: false,
    fixture: false,
    base: { sha: resolve(tour.range.base), name: tour.range.base },
    head: tour.mode === "working-tree" ? { sha: "WORKTREE", name: "working tree" } : { sha: resolve(tour.range.head), name: tour.range.head },
  };
}

module.exports = { DEFAULT_ROOT, prepareFixture, useRepository };
