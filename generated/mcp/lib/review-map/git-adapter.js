// Generated from TypeScript. Run npm run runtime:build in editor-extension.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.git = git;
exports.resolveChange = resolveChange;
exports.resolveWorkspace = resolveWorkspace;
exports.repositoryIdentity = repositoryIdentity;
exports.resolveCodeReference = resolveCodeReference;
exports.parseRawDiff = parseRawDiff;
exports.parseStatus = parseStatus;
const fs = require("node:fs");
const path = require("node:path");
const node_child_process_1 = require("node:child_process");
const input_js_1 = require("../input.js");
const canonical_js_1 = require("./canonical.js");
const errors_js_1 = require("./errors.js");
function git(workspace, args, options = {}) {
  try {
    return (0, node_child_process_1.execFileSync)(
      "git",
      ["-C", workspace, ...args],
      {
        encoding: options.encoding === null ? null : "utf8",
        maxBuffer: 32 * 1024 * 1024,
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
  } catch (error) {
    const failure = (0, input_js_1.errorFields)(error);
    const message = failure.stderr?.toString().trim() || failure.message;
    throw new errors_js_1.ReviewMapError("git_failed", message);
  }
}
function resolveWorkspace(input) {
  (0, errors_js_1.invariant)(
    typeof input === "string" && path.isAbsolute(input),
    "invalid_workspace",
    "workspace must be an absolute path",
  );
  const root = git(input, ["rev-parse", "--show-toplevel"]).trim();
  (0, errors_js_1.invariant)(
    path.resolve(root) === path.resolve(input),
    "workspace_mismatch",
    `workspace must be the repository root: ${root}`,
  );
  return fs.realpathSync(root);
}
function validateRef(ref, label) {
  (0, errors_js_1.invariant)(
    typeof ref === "string" && ref.length > 0 && !ref.startsWith("-"),
    "invalid_ref",
    `${label} must be a non-option Git ref`,
  );
  return ref;
}
function resolveCommit(workspace, ref, label) {
  return git(workspace, [
    "rev-parse",
    "--verify",
    `${validateRef(ref, label)}^{commit}`,
  ]).trim();
}
function parseRawDiff(output) {
  const parts = output.split("\0");
  const files = [];
  for (let i = 0; i < parts.length;) {
    const header = parts[i++];
    if (!header) continue;
    const match = header.match(
      /^:(\d+) (\d+) ([0-9a-f]+) ([0-9a-f]+) ([A-Z])(\d*)$/,
    );
    (0, errors_js_1.invariant)(
      match,
      "git_output_invalid",
      `unexpected git diff record: ${header}`,
    );
    const oldPath = parts[i++];
    let newPath = oldPath;
    if (match[5] === "R" || match[5] === "C") newPath = parts[i++];
    files.push({
      oldPath: oldPath || null,
      path: newPath,
      kind: match[5],
      similarity: match[6] ? Number(match[6]) : null,
      oldMode: match[1],
      newMode: match[2],
      oldBlob: match[3],
      newBlob: match[4],
    });
  }
  return files.sort((a, b) =>
    `${a.path}\0${a.oldPath}`.localeCompare(`${b.path}\0${b.oldPath}`),
  );
}
function commonIdentity(workspace) {
  const commonDirRaw = git(workspace, ["rev-parse", "--git-common-dir"]).trim();
  const commonDir = fs.realpathSync(path.resolve(workspace, commonDirRaw));
  return {
    workspace,
    commonDir,
    repositoryKey: (0, canonical_js_1.digest)(
      `${commonDir}\0${workspace}`,
    ).slice(7),
  };
}
function committedIdentity(workspace, selection) {
  const base = resolveCommit(workspace, selection.base, "base");
  const head = resolveCommit(workspace, selection.head, "head");
  const diffMode = selection.diffMode === "three-dot" ? "three-dot" : "two-dot";
  const effectiveBase =
    diffMode === "three-dot"
      ? git(workspace, ["merge-base", base, head]).trim()
      : base;
  const files = parseRawDiff(
    git(workspace, [
      "diff",
      "--raw",
      "-z",
      "--no-abbrev",
      "--find-renames",
      effectiveBase,
      head,
    ]),
  );
  const manifest = {
    kind: "committed",
    baseCommit: base,
    headCommit: head,
    effectiveBase,
    diffMode,
    files,
  };
  return {
    ...commonIdentity(workspace),
    kind: "committed",
    labels: { base: selection.base, head: selection.head },
    manifest,
    manifestDigest: (0, canonical_js_1.digest)(manifest),
  };
}
function safeFileDigest(workspace, relativePath) {
  const absolute = path.resolve(workspace, relativePath);
  (0, errors_js_1.invariant)(
    absolute.startsWith(`${workspace}${path.sep}`),
    "path_outside_workspace",
    `path escapes workspace: ${relativePath}`,
  );
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink())
    return {
      type: "symlink",
      digest: (0, canonical_js_1.digest)(fs.readlinkSync(absolute)),
      mode: stat.mode,
    };
  if (!stat.isFile()) return { type: "other", digest: null, mode: stat.mode };
  return {
    type: "file",
    digest: (0, canonical_js_1.digest)(fs.readFileSync(absolute)),
    mode: stat.mode,
  };
}
function parseStatus(output) {
  const parts = output.split("\0");
  const records = [];
  for (let i = 0; i < parts.length;) {
    const record = parts[i++];
    if (!record) continue;
    const index = record[0];
    const worktree = record[1];
    const pathName = record.slice(3);
    const renamedFrom =
      index === "R" || index === "C" || worktree === "R" || worktree === "C"
        ? parts[i++]
        : null;
    records.push({ path: pathName, renamedFrom, index, worktree });
  }
  return records;
}
function indexEntry(workspace, relativePath) {
  const result = git(workspace, [
    "ls-files",
    "--stage",
    "--",
    relativePath,
  ]).trim();
  if (!result) return null;
  const match = result.match(/^(\d+) ([0-9a-f]+) (\d+)\t/);
  return match
    ? { mode: match[1], blob: match[2], stage: Number(match[3]) }
    : null;
}
function workingTreeIdentity(workspace, selection) {
  const baseline = resolveCommit(
    workspace,
    selection.baseline || "HEAD",
    "baseline",
  );
  const currentHead = resolveCommit(workspace, "HEAD", "HEAD");
  const includeStaged = selection.includeStaged !== false;
  const includeUnstaged = selection.includeUnstaged !== false;
  const includeUntracked = selection.includeUntracked !== false;
  const records = parseStatus(
    git(workspace, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
  );
  const files = [];
  for (const record of records) {
    const untracked = record.index === "?" && record.worktree === "?";
    const staged = !untracked && record.index !== " " && record.index !== "!";
    const unstaged =
      !untracked && record.worktree !== " " && record.worktree !== "!";
    if (!(
      (untracked && includeUntracked) ||
      (staged && includeStaged) ||
      (unstaged && includeUnstaged)
    ))
      continue;
    let working = null;
    if (untracked || (unstaged && includeUnstaged)) {
      try {
        working = safeFileDigest(workspace, record.path);
      } catch (error) {
        if ((0, input_js_1.errorFields)(error).code !== "ENOENT") throw error;
      }
    }
    files.push({
      path: record.path,
      renamedFrom:
        (staged && includeStaged) || (unstaged && includeUnstaged) || untracked
          ? record.renamedFrom
          : null,
      index: staged && includeStaged ? record.index : " ",
      worktree: untracked
        ? "?"
        : unstaged && includeUnstaged
          ? record.worktree
          : " ",
      staged: staged && includeStaged,
      unstaged: unstaged && includeUnstaged,
      untracked,
      indexEntry:
        (staged && includeStaged) || (unstaged && includeUnstaged)
          ? indexEntry(workspace, record.path)
          : null,
      working,
    });
  }
  files.sort((a, b) => a.path.localeCompare(b.path));
  const manifest = {
    kind: "working-tree",
    baselineCommit: baseline,
    currentHead,
    includeStaged,
    includeUnstaged,
    includeUntracked,
    files,
  };
  return {
    ...commonIdentity(workspace),
    kind: "working-tree",
    labels: { baseline: selection.baseline || "HEAD", head: "WORKTREE" },
    manifest,
    manifestDigest: (0, canonical_js_1.digest)(manifest),
  };
}
function resolveChange(workspaceInput, selection = {}) {
  const workspace = resolveWorkspace(workspaceInput);
  if (selection.kind === "committed")
    return committedIdentity(workspace, selection);
  if (selection.kind === "working-tree")
    return workingTreeIdentity(workspace, selection);
  throw new errors_js_1.ReviewMapError(
    "invalid_selection",
    "selection.kind must be committed or working-tree",
  );
}
function repositoryIdentity(workspaceInput) {
  return commonIdentity(resolveWorkspace(workspaceInput));
}
function resolveCodeReference(workspaceInput, changeRevision, reference) {
  const workspace = resolveWorkspace(workspaceInput);
  (0, errors_js_1.invariant)(
    reference &&
      typeof reference.path === "string" &&
      reference.path &&
      !path.isAbsolute(reference.path) &&
      !reference.path.split(/[\\/]/).includes(".."),
    "invalid_code_reference",
    "code reference path must stay inside the repository",
  );
  (0, errors_js_1.invariant)(
    typeof reference.side === "string" &&
      ["base", "head", "working"].includes(reference.side),
    "invalid_code_reference",
    "code reference side must be base, head, or working",
  );
  let bytes;
  let revision;
  if (reference.side === "working") {
    (0, errors_js_1.invariant)(
      changeRevision.kind === "working-tree",
      "invalid_code_reference",
      "working-side references require a working-tree review map",
    );
    const absolute = path.resolve(workspace, reference.path);
    (0, errors_js_1.invariant)(
      absolute.startsWith(`${workspace}${path.sep}`),
      "path_outside_workspace",
      `path escapes workspace: ${reference.path}`,
    );
    const stat = fs.lstatSync(absolute);
    bytes = stat.isSymbolicLink()
      ? Buffer.from(fs.readlinkSync(absolute))
      : fs.readFileSync(absolute);
    revision = "WORKTREE";
  } else {
    const manifest = changeRevision.manifest;
    const commit =
      reference.side === "base"
        ? manifest.effectiveBase || manifest.baselineCommit
        : manifest.headCommit;
    (0, errors_js_1.invariant)(
      commit,
      "invalid_code_reference",
      `${reference.side}-side references are unavailable for this change`,
    );
    bytes = git(workspace, ["show", `${commit}:${reference.path}`], {
      encoding: null,
    });
    revision = commit;
  }
  if (reference.startLine !== undefined || reference.endLine !== undefined) {
    const lineCount =
      bytes.length === 0
        ? 0
        : bytes.toString("utf8").split("\n").length -
          (bytes.at(-1) === 10 ? 1 : 0);
    (0, errors_js_1.invariant)(
      typeof reference.startLine === "number" &&
        Number.isInteger(reference.startLine) &&
        typeof reference.endLine === "number" &&
        Number.isInteger(reference.endLine) &&
        reference.startLine >= 1 &&
        reference.endLine >= reference.startLine &&
        reference.endLine <= lineCount,
      "invalid_code_reference",
      `code reference range is outside ${reference.path} (${lineCount} lines)`,
    );
  }
  return {
    ...reference,
    revision,
    contentDigest: (0, canonical_js_1.digest)(bytes),
    changeRevisionId: changeRevision.id,
  };
}
