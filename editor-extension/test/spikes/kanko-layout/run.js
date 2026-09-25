"use strict";

// This spike gets a disposable workspace, user profile, and extension directory.
// No setting or extension is written to the reviewer's normal VS Code profile.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const cp = require("node:child_process");
const { runTests, downloadAndUnzipVSCode } = require("@vscode/test-electron");

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "kanko-spike-"));
  const workspace = path.join(root, "workspace");
  const output = path.resolve(
    process.env.KANKO_SPIKE_OUTPUT || path.join(root, "results"),
  );
  fs.mkdirSync(workspace);
  fs.mkdirSync(output, { recursive: true });
  if (fs.readdirSync(output).length)
    throw new Error(
      "Choose an empty KANKO_SPIKE_OUTPUT directory; earlier control files must not finish a new run.",
    );
  fs.mkdirSync(path.join(root, "user", "User"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "user", "User", "settings.json"),
    JSON.stringify({
      "security.workspace.trust.enabled": false,
      "workbench.startupEditor": "none",
      "workbench.secondarySideBar.defaultVisibility": "hidden",
      "window.restoreWindows": "none",
      "workbench.editor.decorations.badges": true,
      "workbench.editor.decorations.colors": true,
      "workbench.editor.closeEmptyGroups": false,
      "diffEditor.renderSideBySide": true,
      "diffEditor.useInlineViewWhenSpaceIsLimited": false,
      "go.toolsManagement.autoUpdate": false,
      "go.useLanguageServer": true,
      "go.toolsManagement.checkForUpdates": "off",
      "telemetry.telemetryLevel": "off",
    }),
  );
  const git = (...args) =>
    cp.execFileSync("git", args, { cwd: workspace, encoding: "utf8" }).trim();
  git("init", "-q");
  fs.writeFileSync(
    path.join(workspace, "go.mod"),
    "module example.com/kankospike\n\ngo 1.23\n",
  );
  fs.writeFileSync(
    path.join(workspace, "tsconfig.json"),
    '{"compilerOptions":{"strict":true},"include":["*.ts"]}\n',
  );
  fs.writeFileSync(
    path.join(workspace, "service.ts"),
    "export function kankoProbe(value: number): number {\n  return value + 1;\n}\n" +
      "// context\n".repeat(160),
  );
  fs.writeFileSync(
    path.join(workspace, "evidence.go"),
    "package kankospike\n\nfunc Evidence() int { return 1 }\n" +
      "// context\n".repeat(160),
  );
  git("add", ".");
  git(
    "-c",
    "user.name=Kankō Spike",
    "-c",
    "user.email=kanko-spike@example.invalid",
    "commit",
    "-qm",
    "base fixture",
  );
  const base = git("rev-parse", "HEAD");
  fs.writeFileSync(
    path.join(workspace, "service.ts"),
    fs
      .readFileSync(path.join(workspace, "service.ts"), "utf8")
      .replace("value + 1", "value + 2"),
  );
  git("add", ".");
  git(
    "-c",
    "user.name=Kankō Spike",
    "-c",
    "user.email=kanko-spike@example.invalid",
    "commit",
    "-qm",
    "head fixture",
  );
  const head = git("rev-parse", "HEAD");
  const extensions = path.join(root, "extensions");
  fs.mkdirSync(extensions);
  if (process.env.KANKO_SPIKE_GO_EXTENSION) {
    fs.symlinkSync(
      path.resolve(process.env.KANKO_SPIKE_GO_EXTENSION),
      path.join(extensions, "golang.go"),
      "dir",
    );
  }
  let executable =
    process.env.VSCODE_EXECUTABLE_PATH ||
    (await downloadAndUnzipVSCode(process.env.VSCODE_VERSION || "stable"));
  if (process.platform === "darwin" && !fs.existsSync(executable))
    executable = path.join(path.dirname(executable), "Code");
  console.log(`Spike output: ${output}`);
  await runTests({
    vscodeExecutablePath: executable,
    extensionDevelopmentPath: [path.resolve(__dirname, "../../.."), __dirname],
    extensionTestsPath: path.join(__dirname, "suite.js"),
    extensionTestsEnv: {
      KANKO_SPIKE_OUTPUT: output,
      KANKO_SPIKE_BASE: base,
      KANKO_SPIKE_HEAD: head,
    },
    // This fixture never signs in or stores credentials. Keep secret storage in
    // memory and Chromium's disposable profile away from the OS keychain.
    launchArgs: [
      workspace,
      `--user-data-dir=${path.join(root, "user")}`,
      `--extensions-dir=${extensions}`,
      "--use-inmemory-secretstorage",
      "--password-store=basic",
      "--disable-gpu",
      "--skip-welcome",
      "--skip-release-notes",
    ],
  });
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
