#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"
fail() { echo "error: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null || fail "$1 is not on PATH"; }
validate_version() {
  local value="$1" part
  [[ "$value" =~ ^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || fail 'Use a stable major.minor.patch version'
  local parts
  IFS=. read -r -a parts <<< "$value"
  for part in "${parts[@]}"; do
    [ "${#part}" -le 16 ] && [ "$part" -le 9007199254740991 ] || fail 'Version component exceeds the safe integer range'
  done
}
next_version() {
  local current="$1" bump="$2" major minor patch next_major next_minor next_patch
  validate_version "$current"
  IFS=. read -r major minor patch <<< "$current"
  case "$bump" in
    major) bump="$((major + 1)).0.0" ;;
    minor) bump="$major.$((minor + 1)).0" ;;
    patch) bump="$major.$minor.$((patch + 1))" ;;
  esac
  validate_version "$bump"
  IFS=. read -r next_major next_minor next_patch <<< "$bump"
  if (( next_major > major || (next_major == major && next_minor > minor) || (next_major == major && next_minor == minor && next_patch > patch) )); then
    printf '%s\n' "$bump"
  else
    fail 'New version must be greater than the current version'
  fi
}

main() {
  local command="${1:-}" version file index
  # Global because the EXIT trap runs after main returns on failure.
  staging=""
  case "$command" in
    show|sync) [ "$#" -eq 1 ] || fail "Usage: make version-$command" ;;
    check) [ "$#" -le 2 ] || fail 'Usage: make version-check [TAG=vX.Y.Z]' ;;
    bump) [ "$#" -eq 2 ] || fail 'Usage: make bump VERSION=patch|minor|major|X.Y.Z' ;;
    *) fail 'Usage: make version, version-check, version-sync, or bump VERSION=patch' ;;
  esac
  need jq
  # Reject embedded line endings before command substitution strips trailing LF.
  jq -e '.version | type == "string" and (contains("\n") | not) and (contains("\r") | not)' plugin.json >/dev/null || fail 'Invalid version in plugin.json'
  version="$(jq -r '.version' plugin.json)"
  validate_version "$version"
  if [ "$command" = show ]; then printf '%s\n' "$version"; return; fi
  local files=(
    plugin.json
    .codex-plugin/plugin.json
    .claude-plugin/plugin.json
    .claude-plugin/marketplace.json
    editor-extension/package.json
    editor-extension/package-lock.json
  )
  local filters=(
    '.version = $v'
    '.version = $v'
    '.version = $v'
    'if any(.plugins[]; .name == "kanko") then
       .metadata.version = $v | (.plugins[] | select(.name == "kanko")).version = $v
     else error("Marketplace is missing the kanko plugin") end'
    '.version = $v'
    '.version = $v | .packages[""].version = $v'
  )
  if [ "$command" = check ]; then
    for index in "${!files[@]}"; do
      file="${files[$index]}"
      jq -e --arg v "$version" ". == (${filters[$index]})" "$file" >/dev/null || fail "Release versions differ from plugin.json ($version): $file. Run make version-sync."
    done
    cmp -s LICENSE editor-extension/LICENSE || fail 'Packaged license differs from repository license'
    awk -v heading="## $version" '{sub(/\r$/, ""); if ($0 == heading) found=1} END {exit !found}' editor-extension/CHANGELOG.md || fail 'Add a changelog heading for the release version'
    if [ "$#" -eq 2 ]; then [ "$2" = "v$version" ] || fail 'Release tag must match the shared version'; fi
    printf 'Validated Kankō %s\n' "$version"
    return
  fi
  if [ "$command" = bump ]; then version="$(next_version "$version" "$2")"; fi
  need node
  [ "$(node -p 'process.versions.node.split(".")[0]')" -ge 22 ] || fail 'Node.js 22 or newer is required'
  # Check build dependencies before modifying manifests.
  node -e 'for (const name of ["typescript", "prettier"]) require.resolve(name, {paths: ["./editor-extension"]})' || fail 'Run make setup first'
  staging="$(mktemp -d "${TMPDIR:-/tmp}/kanko-version.XXXXXX")"
  trap 'rm -rf "$staging"' EXIT
  if [ "$command" = bump ]; then
    # Stage the notes and all JSON before writing anything into the checkout.
    awk -v version="$version" '
      { line=$0; sub(/\r$/, "", line) }
      line == "## " version { duplicate=1 }
      line == "## Unreleased" { count++; in_notes=1; print "## " version; next }
      /^## / { in_notes=0 }
      in_notes && line ~ /[^[:space:]]/ { notes=1 }
      { print }
      END { if (count != 1 || !notes || duplicate) exit 1 }
    ' editor-extension/CHANGELOG.md > "$staging/changelog" || fail 'Add release notes under one ## Unreleased heading; the target version must not already exist'
  fi
  for index in "${!files[@]}"; do
    jq --arg v "$version" "${filters[$index]}" "${files[$index]}" > "$staging/$index"
  done
  for index in "${!files[@]}"; do
    file="${files[$index]}"
    # Preserve existing formatting when its JSON value has not changed.
    if ! jq -e --slurpfile updated "$staging/$index" '. == $updated[0]' "$file" >/dev/null; then
      cat "$staging/$index" > "$file"
    fi
  done
  if [ "$command" = bump ]; then cat "$staging/changelog" > editor-extension/CHANGELOG.md; fi
  node scripts/build-runtime.mjs --write
  printf 'Kankō %s: synchronized manifests and runtime. Review and commit the changes; release tag: v%s\n' "$version" "$version"
  rm -rf "$staging"
  trap - EXIT
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then main "$@"; fi
