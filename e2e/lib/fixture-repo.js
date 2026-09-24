"use strict";

const cp = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

function writeTree(dir, files) {
  for (const [rel, content] of Object.entries(files || {})) {
    const abs = path.join(dir, rel);
    if (content === null) { fs.rmSync(abs, { force: true }); continue; }
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, Array.isArray(content) ? content.join("\n") + "\n" : content);
  }
}

// Builds a throwaway repository from a scenario's repo block:
//   base:     files committed on `main`
//   head:     files committed on the feature branch (null deletes a file)
//   worktree: uncommitted edits applied on top of head
// Content may be a string or an array of lines, which keeps line numbers in
// scenario ranges easy to audit.
function buildFixtureRepo(root, spec) {
  const dir = path.join(root, "repo");
  fs.mkdirSync(dir, { recursive: true });
  const git = (...args) => cp.execFileSync("git", args, { cwd: dir, encoding: "utf8" }).trim();
  git("init", "-q", "-b", spec.baseBranch || "main");
  git("config", "user.email", "e2e@example.com");
  git("config", "user.name", "codewalk e2e");
  git("config", "commit.gpgsign", "false");

  writeTree(dir, spec.base);
  git("add", "-A");
  git("commit", "-qm", spec.baseMessage || "base");
  const base = git("rev-parse", "HEAD");

  let head = base;
  if (spec.head) {
    git("checkout", "-qb", spec.headBranch || "feature");
    writeTree(dir, spec.head);
    git("add", "-A");
    git("commit", "-qm", spec.headMessage || "change");
    head = git("rev-parse", "HEAD");
  }

  writeTree(dir, spec.worktree);

  return {
    workspace: fs.realpathSync(dir),
    base,
    head,
    baseName: spec.baseBranch || "main",
    headName: spec.head ? spec.headBranch || "feature" : spec.baseBranch || "main",
    git,
  };
}

module.exports = { buildFixtureRepo, writeTree };
