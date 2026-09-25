export class ReviewMapError extends Error {
  readonly code: string;
  readonly details?: unknown;
  constructor(code: string, message: string, details?: unknown) {
    super(message);
    this.name = "ReviewMapError";
    this.code = code;
    if (details !== undefined) this.details = details;
  }
}

export function invariant(
  condition: unknown,
  code: string,
  message: string,
  details?: unknown,
): asserts condition {
  if (!condition) throw new ReviewMapError(code, message, details);
}
