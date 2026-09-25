import type { ReviewChange, ManifestFile, TourSourceCatalog } from "./types.js";

import * as fs from "node:fs";
import * as path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";

import { validPath } from "./tour.js";

function invariant(ok: unknown, code: string, message: string): asserts ok {
  if (!ok) throw Object.assign(new Error(message), { code });
}

const digest = (bytes: Buffer) =>
  `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

function git(workspace: string, args: string[]): string;
function git(
  workspace: string,
  args: string[],
  options: { encoding: null },
): Buffer;
function git(
  workspace: string,
  args: string[],
  options: { encoding?: null } = {},
): string | Buffer {
  try {
    return execFileSync("git", ["-C", workspace, ...args], {
      encoding: options.encoding === null ? null : "utf8",
      maxBuffer: 32 * 1024 * 1024,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const failure = error as Error & { stderr?: Buffer }; // execFileSync's documented failure shape
    throw Object.assign(
      new Error(failure.stderr?.toString().trim() || failure.message),
      { code: "git_failed" },
    );
  }
}

function renamedFiles(workspace: string, base: string, head: string) {
  const fields = git(workspace, [
    "diff",
    "--name-status",
    "-z",
    "--find-renames",
    base,
    head,
    "--",
  ]).split("\0");
  const files = [];
  for (let i = 0; i < fields.length && fields[i];) {
    const kind = fields[i++][0],
      oldPath = fields[i++];
    files.push({
      kind,
      oldPath,
      path: kind === "R" || kind === "C" ? fields[i++] : oldPath,
    });
  }
  return files;
}

function tree(workspace: string, commit: string) {
  const entries: Map<string, string> = new Map();
  for (const entry of git(workspace, ["ls-tree", "-r", "-z", commit])
    .split("\0")
    .filter(Boolean)) {
    const match = entry.match(/^(\d+) (\w+) ([0-9a-f]+)\t([\s\S]+)$/);
    if (match && match[2] === "blob") entries.set(match[4], match[3]);
  }
  return entries;
}

// Snapshot catalogs once, and read immutable blobs by id. Working bytes are
// checked against the selected manifest so staged-only tours never read edits.

function tourSources(
  workspace: string,
  change: ReviewChange,
): TourSourceCatalog {
  const manifest = change.manifest;
  const base = manifest.effectiveBase || manifest.baselineCommit;
  const head = manifest.headCommit || manifest.currentHead;

  const pinned = (ref: unknown): ref is string =>
    typeof ref === "string" && /^[0-9a-f]{40,64}$/.test(ref);
  invariant(
    pinned(base) && pinned(head),
    "invalid_revision",
    "source revisions must be pinned commit ids",
  );
  invariant(
    Array.isArray(manifest.files) &&
      manifest.files.every(
        (f) =>
          validPath(f.path) &&
          (!f.renamedFrom || validPath(f.renamedFrom)) &&
          (!f.oldPath || validPath(f.oldPath)),
      ),
    "invalid_path",
    "manifest paths must stay inside the repository",
  );
  const baseTree = tree(workspace, base);
  const headTree = tree(workspace, head);
  const working = manifest.kind === "working-tree";
  const revisions = {
    base,
    head: working ? `WORKTREE:${change.manifestDigest}` : head,
  };
  const changes = working
    ? renamedFiles(workspace, base, head)
    : manifest.files;
  const renames = new Map(
    changes.filter((f) => f.kind === "R").map((f) => [f.path, f.oldPath]),
  );
  const selected = new Map(
    working ? manifest.files.map((f) => [f.path, f]) : [],
  );
  for (const f of selected.values()) {
    if (f.renamedFrom && (f.index === "R" || f.worktree === "R")) {
      renames.set(f.path, renames.get(f.renamedFrom) || f.renamedFrom);
      headTree.delete(f.renamedFrom);
    }
  }

  const cache: Map<string, Buffer> = new Map();

  const readBlob = (blob: string | undefined): Buffer | null => {
    if (!blob) return null;
    invariant(
      /^[0-9a-f]{40,64}$/.test(blob),
      "invalid_revision",
      "source blobs must use pinned ids",
    );
    let bytes = cache.get(blob);
    if (!bytes) {
      bytes = git(workspace, ["cat-file", "blob", blob], { encoding: null });
      cache.set(blob, bytes);
    }
    return bytes;
  };

  const asText = (bytes: Buffer | null) => {
    if (bytes === null) return null;
    invariant(
      !bytes.includes(0),
      "binary_anchor",
      "line anchors require a text file",
    );
    const text = bytes.toString("utf8");
    invariant(
      Buffer.from(text).equals(bytes),
      "invalid_encoding",
      "line anchors require UTF-8 source text",
    );
    return text;
  };

  const readWorking = (file: ManifestFile) => {
    if (file.untracked || file.unstaged) {
      if (!file.working) return null; // selected deletion
      const absolute = path.resolve(workspace, file.path);
      const parent = fs.realpathSync(path.dirname(absolute));
      invariant(
        parent === workspace || parent.startsWith(`${workspace}${path.sep}`),
        "path_outside_workspace",
        "anchor parent resolves outside the workspace",
      );
      const stat = fs.lstatSync(absolute);
      invariant(
        stat.isFile() || stat.isSymbolicLink(),
        "invalid_source",
        "anchor source is not a file",
      );
      const bytes = stat.isSymbolicLink()
        ? Buffer.from(fs.readlinkSync(absolute))
        : fs.readFileSync(absolute);
      invariant(
        digest(bytes) === file.working.digest,
        "stale_change",
        "working source changed; refresh the review map",
      );
      return bytes;
    }
    if (file.staged) {
      invariant(
        !file.indexEntry || file.indexEntry.stage === 0,
        "unmerged_source",
        "resolve index conflicts before authoring anchors",
      );
      return readBlob(file.indexEntry?.blob);
    }
    return readBlob(headTree.get(file.path));
  };
  return {
    revisions,
    repositoryPaths: [
      ...new Set([...baseTree.keys(), ...headTree.keys(), ...selected.keys()]),
    ],
    readSource(anchor) {
      invariant(
        validPath(anchor.path),
        "invalid_path",
        "anchor path must stay inside the repository",
      );
      invariant(
        anchor.rev.base === revisions.base &&
          anchor.rev.head === revisions.head,
        "revision_mismatch",
        "anchor revisions do not match this review map",
      );
      const basePath = renames.get(anchor.path) || anchor.path;
      const entry = selected.get(anchor.path);
      return {
        base: asText(readBlob(baseTree.get(basePath))),
        head: asText(
          entry ? readWorking(entry) : readBlob(headTree.get(anchor.path)),
        ),
      };
    },
  };
}

export { tourSources };
