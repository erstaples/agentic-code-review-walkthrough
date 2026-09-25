"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { runTests, downloadAndUnzipVSCode } = require("@vscode/test-electron");
const {
  createFixture,
} = require("../../.test-dist/checks/editor-extension/test/tour-fixture/create.js");
async function main() {
  const f = createFixture();
  const output = path.resolve(
    process.env.KANKO_TOUR_OUTPUT || path.join(f.root, "results"),
  );
  fs.mkdirSync(output, { recursive: true });
  const user = path.join(f.root, "user");
  fs.mkdirSync(path.join(user, "User"), { recursive: true });
  fs.writeFileSync(
    path.join(user, "User/settings.json"),
    JSON.stringify({
      "security.workspace.trust.enabled": false,
      "workbench.startupEditor": "none",
      "window.restoreWindows": "none",
      "window.newWindowDimensions": "maximized",
      "telemetry.telemetryLevel": "off",
      "workbench.colorTheme": "Default Dark Modern",
      "editor.fontSize": 15,
      "diffEditor.renderSideBySide": false,
      "diffEditor.useInlineViewWhenSpaceIsLimited": false,
      "workbench.editor.closeEmptyGroups": false,
      "editor.minimap.enabled": false,
      "workbench.editor.openSideBySideDirection": "down",
      "kanko.layout.orientation": "stacked",
      "kanko.layout.sequenceFallback": false,
      "workbench.secondarySideBar.defaultVisibility": "visible",
      "window.title": "Kankō acceptance · ${rootName}",
    }),
  );
  let executable =
    process.env.VSCODE_EXECUTABLE_PATH ||
    (await downloadAndUnzipVSCode(process.env.VSCODE_VERSION || "stable"));
  if (process.platform === "darwin" && !fs.existsSync(executable))
    executable = path.join(path.dirname(executable), "Code");
  console.log(`Tour acceptance output: ${output}`);
  await runTests({
    vscodeExecutablePath: executable,
    extensionDevelopmentPath:
      process.env.EXTENSION_PATH || path.resolve(__dirname, "../.."),
    extensionTestsPath: path.join(__dirname, "index.js"),
    extensionTestsEnv: {
      KANKO_TOUR_FIXTURE: path.join(f.root, "fixture.json"),
      KANKO_TOUR_OUTPUT: output,
      KANKO_TOUR_MANUAL: process.env.KANKO_TOUR_MANUAL || "",
    },
    launchArgs: [
      f.workspace,
      `--user-data-dir=${user}`,
      `--shared-data-dir=${path.join(f.root, "shared")}`,
      `--extensions-dir=${path.join(f.root, "extensions")}`,
      "--disable-extensions",
      "--disable-gpu",
      "--use-inmemory-secretstorage",
      "--password-store=basic",
      "--skip-welcome",
      "--skip-release-notes",
    ],
  });
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
