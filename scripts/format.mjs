import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(
  new URL("../editor-extension/package.json", import.meta.url),
);
const prettier = require.resolve("prettier/bin/prettier.cjs");
const mode = process.argv[2];
if (mode !== "--check" && mode !== "--write") {
  throw new Error("Choose --check or --write.");
}
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8" },
)
  .split("\0")
  .filter(
    (file) =>
      /\.(?:[cm]?js|tsx?)$/.test(file) ||
      /(?:^|\/)tsconfig[^/]*\.json$/.test(file),
  )
  .filter((file) => !file.startsWith("editor-extension/lib/"))
  .filter((file) => existsSync(join(root, file)));
execFileSync(process.execPath, [prettier, mode, ...new Set(files)], {
  cwd: root,
  stdio: "inherit",
});
