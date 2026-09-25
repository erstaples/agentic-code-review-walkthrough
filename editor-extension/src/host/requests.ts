export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
export function request(value: unknown): Record<string, unknown> {
  if (!isRecord(value))
    throw Object.assign(new Error("Provide a request object."), {
      code: "bad_request",
    });
  return value;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
export function errorDetails(error: unknown): unknown {
  return isRecord(error) ? error.details : undefined;
}
