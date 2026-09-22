const { test, before, after } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");
const { revParse, changedFiles, gitUriQuery } = require("../lib/git.js");

let repo;
let baseSha;
let headSha;

const git = (...args) => cp.execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();

before(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), "tourgit-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@example.com");
  git("config", "user.name", "T");
  fs.writeFileSync(path.join(repo, "keep.txt"), "one\ntwo\n");
  fs.writeFileSync(path.join(repo, "gone.txt"), "bye\n");
  git("add", "-A");
  git("commit", "-qm", "base");
  baseSha = git("rev-parse", "HEAD");
  fs.writeFileSync(path.join(repo, "keep.txt"), "one\ntwo\nthree\n");
  fs.unlinkSync(path.join(repo, "gone.txt"));
  fs.writeFileSync(path.join(repo, "new.txt"), "hello\n");
  git("add", "-A");
  git("commit", "-qm", "head");
  headSha = git("rev-parse", "HEAD");
});

after(() => fs.rmSync(repo, { recursive: true, force: true }));

test("revParse resolves a name to a full sha", async () => {
  assert.strictEqual(await revParse(repo, "HEAD"), headSha);
  assert.match(await revParse(repo, "main"), /^[0-9a-f]{40}$/);
});

test("revParse on an unknown ref fails with git_failed", async () => {
  await assert.rejects(() => revParse(repo, "no-such-ref"), (err) => err.code === "git_failed");
});

test("changedFiles classifies added, deleted, and modified", async () => {
  const changes = await changedFiles(repo, baseSha, headSha);
  const byPath = Object.fromEntries(changes.map((c) => [c.targetPath || c.sourcePath, c.status]));
  assert.strictEqual(byPath["keep.txt"], "M");
  assert.strictEqual(byPath["new.txt"], "A");
  assert.strictEqual(byPath["gone.txt"], "D");
});

test("changedFiles reports renames with both paths", async () => {
  git("mv", "keep.txt", "renamed.txt");
  git("commit", "-qm", "rename");
  const changes = await changedFiles(repo, headSha, git("rev-parse", "HEAD"));
  const rename = changes.find((c) => c.status === "R");
  assert.strictEqual(rename.sourcePath, "keep.txt");
  assert.strictEqual(rename.targetPath, "renamed.txt");
});

test("gitUriQuery encodes the path and ref the git scheme expects", () => {
  assert.deepStrictEqual(JSON.parse(gitUriQuery("/repo/a.go", "abc123")), { path: "/repo/a.go", ref: "abc123" });
});

test("changedFiles with nested workspace returns workspace-relative paths", async () => {
  // Create a subdirectory in the repo to simulate a nested VS Code workspace
  const sub = path.join(repo, "sub");
  fs.mkdirSync(sub);

  // Add a file in the subdirectory at the base commit
  fs.writeFileSync(path.join(sub, "file.txt"), "content\n");
  git("add", "-A");
  git("commit", "-qm", "add sub file");
  const baseShaWithSub = git("rev-parse", "HEAD");

  // Modify the file in the subdirectory
  fs.writeFileSync(path.join(sub, "file.txt"), "modified content\n");
  git("add", "-A");
  git("commit", "-qm", "modify sub file");
  const headShaWithSub = git("rev-parse", "HEAD");

  // Call changedFiles with cwd pointing to the subdirectory (nested workspace)
  const changes = await changedFiles(sub, baseShaWithSub, headShaWithSub);

  // Assert that paths are workspace-relative (from sub/), not repo-relative (sub/file.txt)
  assert.strictEqual(changes.length, 1, "should have one changed file");
  assert.strictEqual(changes[0].targetPath, "file.txt", "path should be workspace-relative");
  assert.strictEqual(changes[0].status, "M", "file should be marked as modified");
});
