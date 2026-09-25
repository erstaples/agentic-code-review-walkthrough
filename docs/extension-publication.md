# Publishing the VS Code extension

The extension identity is `getkankodev.kanko`. The extension, MCP runtime,
Claude plugin, Codex plugin, and marketplace metadata share one release version.
The only authoritative version is `version` in the root `plugin.json`.
Required copies in other manifests and the generated runtime are maintained by
`scripts/version.sh` through the root Makefile; do not bump them individually.
The Marketplace package name is `kanko` and the display name is
**Kankō**. The supplied Kankō logo assets are used for branding.

## Branding assets

The supplied brand masters are in `editor-extension/assets/`, with palette and
usage notes in its `README.md`. The Marketplace icon and listing README use
`kanko-icon-256.png`; the gallery banner uses the brand indigo `#2E2873`
with a dark theme. Only the listing icon is included in the VSIX; the remaining
masters are retained as source assets for future use.

## Pipeline

`.github/workflows/extension.yml` runs on pull requests, pushes to `main`,
`v*` tags, and manual dispatches. It:

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

Tags must match `v<plugin.json version>` exactly and point to a commit
reachable from `origin/main`. Only stable `major.minor.patch` versions are
accepted. Pre-release channels and Open VSX publishing are not configured.
A failure in packaging or tests prevents publishing. PR jobs have read-only
repository permissions and no publishing credentials. Only the Marketplace
job receives `VSCE_PAT`; only the GitHub release job can write releases.
Actions are pinned to commits and Dependabot proposes updates weekly.

## One-time Marketplace setup

1. In [Marketplace publisher management](https://marketplace.visualstudio.com/manage/publishers/),
   confirm that you control the `getkankodev` publisher. This is the registered
   publisher ID, and the extension package name is `kanko`.
2. Create an Azure DevOps Personal Access Token using the Microsoft account
   that controls the publisher. Select **All accessible organizations** and
   **Marketplace → Manage** under custom scopes. See Microsoft's
   [PAT instructions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension#get-a-personal-access-token).
3. In [GitHub environment settings](https://github.com/getkanko/kanko/settings/environments),
   create or open `vscode-marketplace`. Restrict deployment tags to `v*`
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

The [README versioning guide](../README.md#versioning-and-releases) covers the
complete bump, review, and publication sequence. Prepare a release in a PR,
from the repository root:

```sh
make setup
# Add release notes under "## Unreleased" in editor-extension/CHANGELOG.md.
make bump VERSION=patch
# Or: VERSION=minor, VERSION=major, or an exact stable version such as 1.2.3.
make version-check
make test
```

The bump command updates root `plugin.json`, synchronizes the extension manifest
and both lockfile version fields, Claude/Codex manifests and marketplace entry,
regenerates the checked-in MCP runtime, and promotes `## Unreleased` to the new
version. It does not commit, tag, push, install, or publish. Commit the complete
diff, including generated files, for review. A bump needs installed build
dependencies; if runtime generation fails, fix the error and run
`make version-sync` to finish synchronizing the selected version.

Use patch for fixes, minor for compatible features, and major for incompatible
changes. During `0.x`, use minor for breaking changes and describe them in the
release notes. Bump once when preparing a release; ordinary development commits
can keep the current version and accumulate notes under `## Unreleased`.

To repair drift without incrementing, run `make version-sync`.
`make version-check` checks the manifest copies without writing;
`make runtime-check` also checks generated runtime
files. CI and local packaging reject stale versions. Avoid `npm version` or
`vsce publish patch/minor/major`, which only update the extension's version.

Dependency versions (including `0.1.0` in transitive dependencies), historical
changelog entries, and example/test fixture versions are not release inputs.
Bridge protocol and saved-data schema versions describe compatibility and are
changed only when those contracts change, independently of product releases.
The legacy producer version used when replaying old review maps is also fixed;
new maps store their creation version so future bumps preserve saved digests.
The layout spike's private test extension also keeps its own fixture version.

Before tagging, confirm that the selected version has not already been published
in the Marketplace. Published versions cannot be reused.

After merging and checking CI, tag the release from the updated `main`:

```sh
git switch main
git pull --ff-only
make release-check
make release
```

Before the first release with this convention, update any existing
`vscode-marketplace` environment tag policy and release-tag ruleset from
`extension-v*` to `v*`. The Kankō publishing environment has been updated to
allow `v*`; its old pattern is retained during the transition. For other
repositories, these hosted settings must be configured separately.
Old `extension-v*` tags remain historical and no longer trigger publishing.

Pushing a `vX.Y.Z` tag requests a public release. Ordinary commits and PRs only build
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
make rebuild
make test
```

The Make targets require Make, Bash 3.2 or newer, Node.js 22 or newer, npm, jq,
and Python 3.9 or newer.
It installs locked dependencies, validates release metadata, packages the
extension, checks the archive against source, and prints the output path.
Use `make -C /path/to/kanko rebuild` from another directory. The old
`scripts/build-vsix.sh` and `npm run rebuild:vsix` entry points delegate to this
target. Rebuilding does not install or publish the extension.

Run host tests with
`make integration` on a desktop, or prepend
`xvfb-run -a` on headless Linux. Set `EXTENSION_PATH` to an extracted VSIX's
`extension` directory to test the packaged build, as CI does. Host tests currently
cover stable VS Code on Linux in CI; they do not certify every supported VS Code
version or platform.

On macOS, the Makefile sets `TMPDIR=/private/tmp` to avoid `workspace_mismatch`
when Git and Node resolve system temporary directories differently. Review map
tests compare Git's canonical repository path with the temporary directory path.
