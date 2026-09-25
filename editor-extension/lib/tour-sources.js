"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");

const { validPath } = require("./tour-contract.js");

/** @typedef {import("./contract-types.js").ReviewChange} ReviewChange */
/** @typedef {import("./contract-types.js").ManifestFile} ManifestFile */
/** @typedef {import("./contract-types.js").TourSourceCatalog} TourSourceCatalog */

/** @param {unknown} ok @param {string} code @param {string} message @returns {asserts ok} */
function invariant(ok, code, message) { if (!ok) throw Object.assign(new Error(message), { code }); }
/** @param {Buffer} bytes */
const digest = (bytes) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
/**
 * @overload
 * @param {string} workspace @param {string[]} args @returns {string}
 */
/**
 * @overload
 * @param {string} workspace @param {string[]} args @param {{ encoding: null }} options @returns {Buffer}
 */
/** @param {string} workspace @param {string[]} args @param {{ encoding?: null }} [options] @returns {string | Buffer} */
function git(workspace, args, options = {}) {
  try { return execFileSync("git", ["-C", workspace, ...args], { encoding: options.encoding === null ? null : "utf8", maxBuffer: 32 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }); }
  catch (error) {
    const failure = /** @type {Error & { stderr?: Buffer }} */ (error); // execFileSync's documented failure shape
    throw Object.assign(new Error(failure.stderr?.toString().trim() || failure.message), { code: "git_failed" });
  }
}
/** @param {string} workspace @param {string} base @param {string} head */
function renamedFiles(workspace, base, head) {
  const fields = git(workspace, ["diff", "--name-status", "-z", "--find-renames", base, head, "--"]).split("\0");
  const files = [];
  for (let i = 0; i < fields.length && fields[i];) {
    const kind = fields[i++][0], oldPath = fields[i++];
    files.push({ kind, oldPath, path: kind === "R" || kind === "C" ? fields[i++] : oldPath });
  }
  return files;
}

/** @param {string} workspace @param {string} commit */
function tree(workspace, commit) {
  /** @type {Map<string, string>} */
  const entries = new Map();
  for (const entry of git(workspace, ["ls-tree", "-r", "-z", commit]).split("\0").filter(Boolean)) {
    const match = entry.match(/^(\d+) (\w+) ([0-9a-f]+)\t([\s\S]+)$/);
    if (match && match[2] === "blob") entries.set(match[4], match[3]);
  }
  return entries;
}

// Snapshot catalogs once, and read immutable blobs by id. Working bytes are
// checked against the selected manifest so staged-only tours never read edits.
/** @param {string} workspace @param {ReviewChange} change @returns {TourSourceCatalog} */
function tourSources(workspace, change) {
  const manifest = change.manifest;
  const base = manifest.effectiveBase || manifest.baselineCommit;
  const head = manifest.headCommit || manifest.currentHead;
  /** @param {unknown} ref @returns {ref is string} */
  const pinned = (ref) => typeof ref === "string" && /^[0-9a-f]{40,64}$/.test(ref);
  invariant(pinned(base) && pinned(head), "invalid_revision", "source revisions must be pinned commit ids");
  invariant(Array.isArray(manifest.files) && manifest.files.every((f) => validPath(f.path) && (!f.renamedFrom || validPath(f.renamedFrom)) && (!f.oldPath || validPath(f.oldPath))), "invalid_path", "manifest paths must stay inside the repository");
  const baseTree = tree(workspace, base);
  const headTree = tree(workspace, head);
  const working = manifest.kind === "working-tree";
  const revisions = { base, head: working ? `WORKTREE:${change.manifestDigest}` : head };
  const changes = working ? renamedFiles(workspace, base, head) : manifest.files;
  const renames = new Map(changes.filter((f) => f.kind === "R").map((f) => [f.path, f.oldPath]));
  const selected = new Map(working ? manifest.files.map((f) => [f.path, f]) : []);
  for (const f of selected.values()) {
    if (f.renamedFrom && (f.index === "R" || f.worktree === "R")) {
      renames.set(f.path, renames.get(f.renamedFrom) || f.renamedFrom);
      headTree.delete(f.renamedFrom);
    }
  }
  /** @type {Map<string, Buffer>} */
  const cache = new Map();
  /** @param {string | undefined} blob @returns {Buffer | null} */
  const readBlob = (blob) => {
    if (!blob) return null;
    invariant(/^[0-9a-f]{40,64}$/.test(blob), "invalid_revision", "source blobs must use pinned ids");
    let bytes = cache.get(blob);
    if (!bytes) { bytes = git(workspace, ["cat-file", "blob", blob], { encoding: null }); cache.set(blob, bytes); }
    return bytes;
  };
  /** @param {Buffer | null} bytes */
  const asText = (bytes) => {
    if (bytes === null) return null;
    invariant(!bytes.includes(0), "binary_anchor", "line anchors require a text file");
    const text = bytes.toString("utf8");
    invariant(Buffer.from(text).equals(bytes), "invalid_encoding", "line anchors require UTF-8 source text");
    return text;
  };
  /** @param {ManifestFile} file */
  const readWorking = (file) => {
    if (file.untracked || file.unstaged) {
      if (!file.working) return null; // selected deletion
      const absolute = path.resolve(workspace, file.path);
      const parent = fs.realpathSync(path.dirname(absolute));
      invariant(parent === workspace || parent.startsWith(`${workspace}${path.sep}`), "path_outside_workspace", "anchor parent resolves outside the workspace");
      const stat = fs.lstatSync(absolute);
      invariant(stat.isFile() || stat.isSymbolicLink(), "invalid_source", "anchor source is not a file");
      const bytes = stat.isSymbolicLink() ? Buffer.from(fs.readlinkSync(absolute)) : fs.readFileSync(absolute);
      invariant(digest(bytes) === file.working.digest, "stale_change", "working source changed; refresh the review map");
      return bytes;
    }
    if (file.staged) {
      invariant(!file.indexEntry || file.indexEntry.stage === 0, "unmerged_source", "resolve index conflicts before authoring anchors");
      return readBlob(file.indexEntry?.blob);
    }
    return readBlob(headTree.get(file.path));
  };
  return {
    revisions,
    repositoryPaths: [...new Set([...baseTree.keys(), ...headTree.keys(), ...selected.keys()])],
    readSource(anchor) {
      invariant(validPath(anchor.path), "invalid_path", "anchor path must stay inside the repository");
      invariant(anchor.rev.base === revisions.base && anchor.rev.head === revisions.head, "revision_mismatch", "anchor revisions do not match this review map");
      const basePath = renames.get(anchor.path) || anchor.path;
      const entry = selected.get(anchor.path);
      return {
        base: asText(readBlob(baseTree.get(basePath))),
        head: asText(entry ? readWorking(entry) : readBlob(headTree.get(anchor.path))),
      };
    },
  };
}

module.exports = { tourSources };
