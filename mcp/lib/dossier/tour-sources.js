"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { git, parseRawDiff } = require("./git-adapter.js");
const { digest } = require("./canonical.js");
const { invariant } = require("./errors.js");
const { validPath } = require("../../../contract/tour.js");

function tree(workspace, commit) {
  const entries = new Map();
  for (const entry of git(workspace, ["ls-tree", "-r", "-z", commit]).split("\0").filter(Boolean)) {
    const match = entry.match(/^(\d+) (\w+) ([0-9a-f]+)\t([\s\S]+)$/);
    if (match && match[2] === "blob") entries.set(match[4], match[3]);
  }
  return entries;
}

// Snapshot catalogs once, and read immutable blobs by id. Working bytes are
// checked against the selected manifest so staged-only tours never read edits.
function tourSources(workspace, change) {
  const manifest = change.manifest;
  const base = manifest.effectiveBase || manifest.baselineCommit;
  const head = manifest.headCommit || manifest.currentHead;
  const baseTree = tree(workspace, base);
  const headTree = tree(workspace, head);
  const working = manifest.kind === "working-tree";
  const revisions = { base, head: working ? `WORKTREE:${change.manifestDigest}` : head };
  const changes = working ? parseRawDiff(git(workspace, ["diff", "--raw", "-z", "--no-abbrev", "--find-renames", base, head])) : manifest.files;
  const renames = new Map(changes.filter((f) => f.kind === "R").map((f) => [f.path, f.oldPath]));
  const selected = new Map(working ? manifest.files.map((f) => [f.path, f]) : []);
  for (const f of selected.values()) {
    if (f.renamedFrom && (f.index === "R" || f.worktree === "R")) {
      renames.set(f.path, renames.get(f.renamedFrom) || f.renamedFrom);
      headTree.delete(f.renamedFrom);
    }
  }
  const cache = new Map();
  const readBlob = (blob) => {
    if (!blob) return null;
    if (!cache.has(blob)) cache.set(blob, git(workspace, ["cat-file", "blob", blob], { encoding: null }));
    return cache.get(blob);
  };
  const asText = (bytes) => {
    if (bytes === null) return null;
    invariant(!bytes.includes(0), "binary_anchor", "line anchors require a text file");
    const text = bytes.toString("utf8");
    invariant(Buffer.from(text).equals(bytes), "invalid_encoding", "line anchors require UTF-8 source text");
    return text;
  };
  const readWorking = (file) => {
    if (file.untracked || file.unstaged) {
      if (!file.working) return null; // selected deletion
      const absolute = path.resolve(workspace, file.path);
      const parent = fs.realpathSync(path.dirname(absolute));
      invariant(parent === workspace || parent.startsWith(`${workspace}${path.sep}`), "path_outside_workspace", "anchor parent resolves outside the workspace");
      const stat = fs.lstatSync(absolute);
      invariant(stat.isFile() || stat.isSymbolicLink(), "invalid_source", "anchor source is not a file");
      const bytes = stat.isSymbolicLink() ? Buffer.from(fs.readlinkSync(absolute)) : fs.readFileSync(absolute);
      invariant(digest(bytes) === file.working.digest, "stale_change", "working source changed; refresh the dossier");
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
      invariant(anchor.rev.base === revisions.base && anchor.rev.head === revisions.head, "revision_mismatch", "anchor revisions do not match this dossier");
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
