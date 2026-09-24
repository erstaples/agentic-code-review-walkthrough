# Publishing the VS Code extension

The extension identity is `kanko.kanko`. Its version comes from
`editor-extension/package.json`; the agent plugin has its own version lifecycle.
The Marketplace package name is `kanko` and the display name is
`kanko`. The supplied kanko logo assets are used for branding.

## Branding assets

The supplied brand masters are in `editor-extension/assets/`, with palette and
usage notes in its `README.md`. The Marketplace icon and listing README use
`kanko-icon-256.png`; the gallery banner uses the brand indigo `#2E2873`
with a dark theme. Only the listing icon is included in the VSIX; the remaining
masters are retained as source assets for future use.

## Pipeline

`.github/workflows/extension.yml` runs on pull requests, pushes to `main`,
`extension-v*` tags, and manual dispatches. It:

1. Installs locked dependencies with Node.js 22 and `npm ci`.
2. Checks the manifest, lockfile, changelog, and license; runs repository,
   MCP server, and extension unit tests.
3. Builds a universal VSIX containing only runtime code and Marketplace docs,
   checks its contents against source, and uploads it with a SHA-256 checksum.
4. Extracts that artifact and runs the extension-host tests against it in stable
   VS Code on Linux under Xvfb.
5. For a release tag, publishes that same artifact to the Visual Studio
   Marketplace using the `VSCE_PAT` environment secret, then attaches it and its
   checksum to a GitHub release.

Tags must match `extension-v<package version>` exactly and point to a commit
reachable from `origin/main`. Only stable `major.minor.patch` versions are
accepted. Pre-release channels and Open VSX publishing are not configured.
A failure in packaging or tests prevents publishing. PR jobs have read-only
repository permissions and no publishing credentials. Only the Marketplace
job receives `VSCE_PAT`; only the GitHub release job can write releases.
Actions are pinned to commits and Dependabot proposes updates weekly.

## One-time Marketplace setup

1. In [Marketplace publisher management](https://marketplace.visualstudio.com/manage/publishers/),
   confirm that you control the `kanko` publisher. This is the registered
   publisher ID, and the extension package name is `kanko`.
2. Create an Azure DevOps Personal Access Token using the Microsoft account
   that controls the publisher. Select **All accessible organizations** and
   **Marketplace → Manage** under custom scopes. See Microsoft's
   [PAT instructions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token).
3. In [GitHub environment settings](https://github.com/getkanko/kanko/settings/environments),
   create or open `vscode-marketplace`. Restrict deployment tags to `extension-v*`
   and add the PAT as an **environment secret** named `VSCE_PAT`. Add required
   reviewers if your release process needs manual approval. Never commit the token.
4. Protect `main` and release tags with repository rulesets. Require the workflow's
   build and integration checks before merging, and restrict release-tag creation
   and updates to maintainers.

The publish job passes `VSCE_PAT` to the pinned `vsce` CLI and fails with an
explicit setup error if the secret is missing. The environment must permit the
release tag before the job can start. A manual Marketplace upload does not
configure this credential for GitHub Actions.

Microsoft has announced retirement of global Azure DevOps PATs on December 1,
2026. This PAT setup is an interim publishing method; migrate to Microsoft's
[Entra ID publishing approach](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace)
before that deadline. This workflow does not currently use OIDC or Entra ID.

## Release procedure

For a new release, update both version files and add the version's changelog
entry in a PR:

```sh
cd editor-extension
npm version patch --no-git-tag-version
# Edit CHANGELOG.md: add a heading such as "## 0.1.1" and release notes.
npm run check:release
```

The kanko asset update is version `0.1.1`. Before tagging any release, confirm
that its version has not already been published through the Marketplace UI.
If it has, bump the version and add release notes before tagging.

After merging and checking CI, tag the release from the updated `main`:

```sh
git switch main
git pull --ff-only
version=$(node -p 'require("./editor-extension/package.json").version')
git tag -a "extension-v$version" -m "Release kanko $version"
git push origin "extension-v$version"
```

Pushing this tag requests a public release. Ordinary commits and PRs only build
and test. To dry-run manually, select **VS Code extension → Run workflow** and
leave **publish** unchecked. To retry publishing manually, select an existing
release tag and check **publish**. Selecting a branch with **publish** checked
fails validation.

Download `extension-vsix` from the workflow run to inspect a build before
releasing. Verify the checksum from its extracted directory with
`sha256sum --check SHA256SUMS` (or `shasum -a 256 -c SHA256SUMS` on macOS).

## Failures and recovery

Fix a failed check before issuing a release. If authentication fails, correct
the `VSCE_PAT` environment secret, its expiry, and its Marketplace permissions,
then rerun the failed job. If Marketplace
publishing succeeds but the GitHub release job fails, use **Re-run failed jobs**
so the already-published version is not sent again. If GitHub created the release
before a network error, inspect its assets and upload any missing files from
that run's artifact manually.

Versions and tags are immutable release identities. The workflow deliberately
does not skip duplicate Marketplace versions or overwrite GitHub assets.
If a published version is wrong, increment the version and ship a fix; do not
move the tag or delete/reuse the version. Build artifacts are retained for
14 days; successful GitHub releases retain the attached files.

## Local checks

From the repository root:

```sh
./scripts/build-vsix.sh
node --test test/*.test.js mcp/test/*.test.js editor-extension/test/*.test.js
```

The rebuild script requires Node.js 22 or newer, npm, and Python 3.9 or newer.
It installs locked dependencies, validates release metadata, packages the
extension, checks the archive against source, and prints the output path.
It works from any working directory when invoked by its path, and always
rebuilds the current version. From `editor-extension`, use `npm run rebuild:vsix`
for the same operation. Rebuilding does not install or publish the extension.

Run host tests with
`npm --prefix editor-extension run test:integration` on a desktop, or prepend
`xvfb-run -a` on headless Linux. Set `EXTENSION_PATH` to an extracted VSIX's
`extension` directory to test the packaged build, as CI does. Host tests currently
cover stable VS Code on Linux in CI; they do not certify every supported VS Code
version or platform.

On macOS, if dossier tests report `workspace_mismatch` under `/var/folders`,
use `TMPDIR=/private/tmp` for the unit-test command. The existing dossier tests
compare Git's canonical repository path with the temporary directory path.
