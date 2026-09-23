#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
vsix="$root/editor-extension/claude-tour-0.1.0.vsix"

for tool in node code; do
  command -v "$tool" >/dev/null || { echo "error: $tool is not on PATH" >&2; exit 1; }
done

node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$node_major" -lt 22 ]; then
  echo "error: Node.js 22 or newer is required (found $(node --version))" >&2
  exit 1
fi

if [ ! -f "$vsix" ]; then
  echo "building the extension..."
  (cd "$root/editor-extension" && npm install --silent && npm run package --silent)
fi

echo "installing the VS Code extension..."
code --install-extension "$vsix" --force

cat <<EOF

Extension installed. Reload the VS Code window so it activates:
  Command Palette -> "Developer: Reload Window"

Then install the plugin for your agent:
  Claude Code:  /plugin marketplace add $root
                /plugin install tour-changes@code-review-walkthrough
  Codex CLI:    codex plugin marketplace add $root
                codex plugin add tour-changes@code-review-walkthrough
                # Start a new thread after installation.
EOF
