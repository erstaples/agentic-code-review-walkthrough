import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(
  new URL("../editor-extension/package.json", import.meta.url),
);
const ts = require("typescript");
const prettier = require("prettier");
const write = process.argv.includes("--write");
const configPath = path.join(root, "editor-extension/tsconfig.runtime.json");
const config = ts.readConfigFile(configPath, ts.sys.readFile);
if (config.error)
  throw new Error(
    ts.flattenDiagnosticMessageText(config.error.messageText, "\n"),
  );
const parsed = ts.parseJsonConfigFileContent(
  config.config,
  ts.sys,
  path.dirname(configPath),
);
const outputIndex = process.argv.indexOf("--output-dir");
const directory =
  outputIndex < 0
    ? path.join(root, "generated")
    : path.resolve(process.argv[outputIndex + 1]);
parsed.options.outDir = directory;
const program = ts.createProgram(parsed.fileNames, parsed.options);
const diagnostics = [...parsed.errors, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length) {
  console.error(
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCurrentDirectory: () => root,
      getCanonicalFileName: (file) => file,
      getNewLine: () => "\n",
    }),
  );
  process.exit(1);
}
const output = new Map();
const emitted = program.emit(undefined, (filename, text) =>
  output.set(filename, text),
);
if (emitted.emitSkipped || emitted.diagnostics.length)
  throw new Error("Runtime emit failed.");
const options = await prettier.resolveConfig(
  path.join(root, ".prettierrc.json"),
);
const expected = new Map();
for (const [filename, text] of output) {
  const relative = path.relative(directory, filename);
  if (relative.startsWith("..") || path.isAbsolute(relative))
    throw new Error(`Unexpected output: ${filename}`);
  const formatted = await prettier.format(
    filename.endsWith(".json")
      ? text
      : `// Generated from TypeScript. Run npm run runtime:build in editor-extension.\n${text}`,
    { ...options, filepath: filename },
  );
  expected.set(relative, formatted);
}
async function files(directory, prefix = "") {
  const entries = await fs
    .readdir(directory, { withFileTypes: true })
    .catch((error) => {
      if (error.code === "ENOENT") return [];
      throw error;
    });
  const result = [];
  for (const entry of entries) {
    const relative = path.join(prefix, entry.name);
    if (entry.isDirectory())
      result.push(...(await files(path.join(directory, entry.name), relative)));
    else result.push(relative);
  }
  return result;
}
if (write) {
  await fs.rm(directory, { recursive: true, force: true });
  for (const [relative, text] of expected) {
    const filename = path.join(directory, relative);
    await fs.mkdir(path.dirname(filename), { recursive: true });
    await fs.writeFile(filename, text);
  }
  console.log(`Generated ${expected.size} runtime files.`);
} else {
  const differences = [];
  for (const relative of new Set([
    ...expected.keys(),
    ...(await files(directory)),
  ])) {
    const actual = await fs
      .readFile(path.join(directory, relative), "utf8")
      .catch((error) => {
        if (error.code === "ENOENT") return undefined;
        throw error;
      });
    if (actual !== expected.get(relative)) differences.push(relative);
  }
  if (differences.length) {
    console.error(`Rebuild the generated runtime:\n${differences.join("\n")}`);
    process.exit(1);
  }
  console.log(`Generated runtime matches TypeScript (${expected.size} files).`);
}
