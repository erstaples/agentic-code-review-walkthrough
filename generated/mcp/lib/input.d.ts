// Generated from TypeScript. Run npm run runtime:build in editor-extension.
export declare function isRecord(
  value: unknown,
): value is Record<string, unknown>;
export declare function errorFields(error: unknown): {
  code: string | undefined;
  message: string;
  details: unknown;
  stderr: Buffer<any> | undefined;
};
