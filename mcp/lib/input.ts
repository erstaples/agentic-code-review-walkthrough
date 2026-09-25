export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function errorFields(error: unknown) {
  const fields = isRecord(error) ? error : {};
  return {
    code: typeof fields.code === "string" ? fields.code : undefined,
    message:
      typeof fields.message === "string" ? fields.message : String(error),
    details: fields.details,
    stderr: fields.stderr instanceof Buffer ? fields.stderr : undefined,
  };
}
