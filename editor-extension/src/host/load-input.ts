import type {
  ReviewChange,
  ClaimSummary,
  ManifestFile,
} from "../../../generated/shared/types.js";
import { isRecord } from "./requests.js";

const optionalString = (value: unknown) =>
  value === undefined || typeof value === "string";
const optionalBoolean = (value: unknown) =>
  value === undefined || typeof value === "boolean";
function manifestFile(value: unknown): value is ManifestFile {
  if (!isRecord(value) || typeof value.path !== "string") return false;
  if (
    ![
      value.kind,
      value.oldPath,
      value.renamedFrom,
      value.index,
      value.worktree,
    ].every(optionalString)
  )
    return false;
  if (![value.staged, value.unstaged, value.untracked].every(optionalBoolean))
    return false;
  if (
    value.indexEntry != null &&
    (!isRecord(value.indexEntry) ||
      typeof value.indexEntry.stage !== "number" ||
      !optionalString(value.indexEntry.blob))
  )
    return false;
  if (
    value.working != null &&
    (!isRecord(value.working) || typeof value.working.digest !== "string")
  )
    return false;
  return true;
}
export function isReviewChange(value: unknown): value is ReviewChange {
  if (
    !isRecord(value) ||
    typeof value.manifestDigest !== "string" ||
    !isRecord(value.manifest)
  )
    return false;
  const manifest = value.manifest;
  return (
    [
      manifest.kind,
      manifest.effectiveBase,
      manifest.baselineCommit,
      manifest.headCommit,
      manifest.currentHead,
    ].every(optionalString) &&
    Array.isArray(manifest.files) &&
    manifest.files.every(manifestFile)
  );
}
export function isClaimSummary(value: unknown): value is ClaimSummary {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    [value.truthStatus, value.status, value.disposition].every(optionalString)
  );
}
