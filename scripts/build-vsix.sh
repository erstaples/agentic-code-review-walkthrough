#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

for tool in node npm python3; do
  command -v "$tool" >/dev/null || { echo "error: $tool is not on PATH" >&2; exit 1; }
done

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 22 ]; then
  echo "error: Node.js 22 or newer is required (found $(node --version))" >&2
  exit 1
fi

cd "$root/editor-extension"
node "$root/scripts/check-extension-release.js"
npm ci
npm run package

vsix="$root/editor-extension/$(node -p "const p = require('./package.json'); p.name + '-' + p.version + '.vsix'")"
python3 "$root/scripts/check-vsix.py" "$vsix"
printf '\nVSIX ready: %s\n' "$vsix"
