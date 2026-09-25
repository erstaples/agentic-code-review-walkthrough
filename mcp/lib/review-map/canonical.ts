import * as crypto from "node:crypto";

function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${canonicalize((value as Record<string, unknown>)[key])}`,
    )
    .join(",")}}`;
}

function digest(value: unknown) {
  const bytes = Buffer.isBuffer(value)
    ? value
    : Buffer.from(typeof value === "string" ? value : canonicalize(value));
  return `sha256:${crypto.createHash("sha256").update(bytes).digest("hex")}`;
}

function id(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export { canonicalize, digest, id };
