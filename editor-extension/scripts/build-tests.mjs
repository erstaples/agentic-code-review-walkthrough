import * as esbuild from "esbuild";
import { readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../../", import.meta.url));
const output = path.join(root, "editor-extension/.test-dist/checks");
await rm(output, { recursive: true, force: true });
const entries = [];
for (const folder of ["test", "mcp/test"]) {
  for (const name of await readdir(path.join(root, folder))) {
    if (name.endsWith(".test.ts")) entries.push(path.join(folder, name));
  }
}
entries.push("editor-extension/test/tour-fixture/create.ts");
await Promise.all(
  entries.map(async (entry) => {
    const source = path.join(root, entry);
    await esbuild.build({
      entryPoints: [source],
      outfile: path.join(output, entry.replace(/\.ts$/, ".js")),
      bundle: true,
      packages: "external",
      platform: "node",
      format: "cjs",
      target: "node22",
      // Fixtures and child processes use paths relative to the source test.
      define: { __dirname: JSON.stringify(path.dirname(source)) },
    });
  }),
);
console.log(`Built ${entries.length} TypeScript test entries.`);
