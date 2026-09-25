#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
fail() { echo "error: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null || fail "$1 is not on PATH"; }
[ "$#" -eq 0 ] || { [ "$#" -eq 1 ] && [ "$1" = --dry-run ]; } || fail 'Usage: make release or make release-check'
need node
need npm
need git
[ "$(git branch --show-current)" = main ] || fail 'Switch to main after the version PR is merged'
[ -z "$(git status --porcelain)" ] || fail 'Commit or remove working-tree changes before releasing'
git fetch origin refs/heads/main:refs/remotes/origin/main
[ "$(git rev-parse HEAD)" = "$(git rev-parse refs/remotes/origin/main)" ] || fail 'Update main with git pull --ff-only before releasing'
version="$(bash "$root/scripts/version.sh" show)"
tag="v$version"
bash "$root/scripts/version.sh" check "$tag"
npm --prefix "$root/editor-extension" run runtime:check
if git show-ref --verify --quiet "refs/tags/$tag"; then
  fail "Local tag $tag already exists; do not reuse a release version"
fi
if git ls-remote --exit-code --tags origin "refs/tags/$tag" > /dev/null; then
  fail "Remote tag $tag already exists; do not reuse a release version"
else
  status=$?
  [ "$status" -eq 2 ] || fail 'Could not check remote release tags'
fi
if [ "${1:-}" = --dry-run ]; then
  printf 'Would create and push %s at %s; no tag created or pushed.\n' "$tag" "$(git rev-parse --short HEAD)"
else
  git tag -a "$tag" -m "Release Kankō $version"
  git push origin "refs/tags/$tag"
fi
