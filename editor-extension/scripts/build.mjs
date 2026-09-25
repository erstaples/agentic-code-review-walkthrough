import * as esbuild from "esbuild";
import { readdir, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const test = process.argv.includes("--test");
const watch = process.argv.includes("--watch");
const outdir = path.join(root, test ? ".test-dist" : "dist");
// Clear retired outputs so packaging/tests cannot accidentally use stale files.
await rm(outdir, { recursive: true, force: true });
async function sources(directory) {
  const entries = await readdir(path.join(root, directory), {
    withFileTypes: true,
  });
  return (
    await Promise.all(
      entries.map((entry) => {
        const name = path.join(directory, entry.name);
        return entry.isDirectory()
          ? sources(name)
          : /\.(tsx?|js)$/.test(name)
            ? [name]
            : [];
      }),
    )
  ).flat();
}
const options = {
  absWorkingDir: root,
  entryPoints: test
    ? [
        ...(await sources("src")).filter(
          (file) => !file.startsWith("src/webview/"),
        ),
      ]
    : ["src/extension.ts"],
  outdir,
  ...(test ? { outbase: "." } : {}),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node22",
  external: ["vscode"],
  logLevel: "info",
};
const browser = {
  absWorkingDir: root,
  entryPoints: ["src/webview/index.tsx"],
  outfile: path.join(outdir, "webview.js"),
  bundle: true,
  platform: "browser",
  format: "iife",
  target: "es2022",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  minify: !test,
  legalComments: "inline",
  logLevel: "info",
};
const builds = [options, browser];
if (test)
  builds.push({
    absWorkingDir: root,
    entryPoints: (await sources("src/webview")).filter(
      (file) => !file.endsWith("index.tsx"),
    ),
    outdir,
    outbase: ".",
    platform: "node",
    format: "cjs",
    jsx: "automatic",
    target: "node22",
  });
if (watch) {
  await Promise.all(
    builds.map(async (options) => {
      const context = await esbuild.context(options);
      await context.watch();
    }),
  );
} else {
  await Promise.all(builds.map((options) => esbuild.build(options)));
}
