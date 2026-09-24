# Publishing the VS Code extension

The extension identity is `erstaples.codewalk-review`. Its version comes from
`editor-extension/package.json`; the agent plugin has its own version lifecycle.
The Marketplace package name is `codewalk-review` and the display name is
`codewalk Review`. The supplied codewalk logo assets remain in use.

## Branding assets

The supplied brand masters are in `editor-extension/assets/`, with palette and
usage notes in its `README.md`. The Marketplace icon and listing README use
`codewalk-icon-256.png`; the gallery banner uses the brand indigo `#2E2873`
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
   Marketplace using OIDC, then attaches it and its checksum to a GitHub release.

Tags must match `extension-v<package version>` exactly and point to a commit
reachable from `origin/main`. Only stable `major.minor.patch` versions are
accepted. Pre-release channels and Open VSX publishing are not configured.
A failure in packaging or tests prevents publishing. PR jobs have read-only
repository permissions and no publishing credentials. Only the Marketplace
job can request an OIDC token; only the GitHub release job can write releases.
Actions are pinned to commits and Dependabot proposes updates weekly.

## One-time Marketplace setup

1. In [Marketplace publisher management](https://marketplace.visualstudio.com/manage/publishers/),
   confirm that you control the `erstaples` publisher. This is the registered
   publisher ID, and the extension package name is `codewalk-review`.
2. Configure a trusted publishing policy for publisher `erstaples`, repository
   `erstaples/agentic-code-review-walkthrough`, workflow `extension.yml`, and
   environment `vscode-marketplace`. See
   [vsce trusted publishing](https://github.com/microsoft/vscode-vsce#trusted-publishing).
3. Create the GitHub environment `vscode-marketplace`. Restrict its deployment
   tags to `extension-v*`. Add required reviewers if your release process needs
   manual approval. The policy must match the environment used by the job.
4. Protect `main` and release tags with repository rulesets. Require the workflow's
   build and integration checks before merging, and restrict release-tag creation
   and updates to maintainers.

No `VSCE_PAT` or other long-lived Marketplace secret is needed. `vsce` 4.0.0
is pinned in the lockfile and supports `publish --oidc`; it exchanges a GitHub
identity token for a short-lived Marketplace credential. Trust configuration
must exist before the first publish. The workflow fails if that exchange is
rejected; it does not fall back to a token.

These account settings are separate from the checked-in workflow. If trusted
publishing is not available for your publisher, configure Microsoft's
[Entra ID publishing approach](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#secure-automated-publishing-to-visual-studio-marketplace)
and adapt the authentication step before releasing.

## Release procedure

For a new release, update both version files and add the version's changelog
entry in a PR:

```sh
cd editor-extension
npm version patch --no-git-tag-version
# Edit CHANGELOG.md: add a heading such as "## 0.1.1" and release notes.
npm run check:release
```

For the initial `0.1.0` release, the current version and changelog already match;
no bump is necessary if that version has never been published.

After merging and checking CI, tag the release from the updated `main`:

```sh
git switch main
git pull --ff-only
version=$(node -p 'require("./editor-extension/package.json").version')
git tag -a "extension-v$version" -m "Release codewalk $version"
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
the publisher trust configuration and rerun the failed job. If Marketplace
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
