#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
vsix="$root/editor-extension/claude-tour-0.1.0.vsix"

for tool in node code; do
  command -v "$tool" >/dev/null || { echo "error: $tool is not on PATH" >&2; exit 1; }
done

if [ ! -f "$vsix" ]; then
  echo "building the extension..."
  (cd "$root/editor-extension" && npm install --silent && npm run package --silent)
fi

echo "installing the VS Code extension..."
code --install-extension "$vsix" --force

if command -v codex >/dev/null; then
  echo "checking the Codex MCP registration..."
  if codex mcp get tour-bridge 2>/dev/null | grep -q 'CLAUDE_PLUGIN_ROOT'; then
    echo "  Codex did not expand \${CLAUDE_PLUGIN_ROOT}; re-registering with an absolute path"
    codex mcp remove tour-bridge >/dev/null 2>&1 || true
    codex mcp add tour-bridge -- node "$root/mcp/server.js"
  fi
fi

cat <<EOF

Extension installed. Reload the VS Code window so it activates:
  Command Palette -> "Developer: Reload Window"

Then install the plugin for your agent:
  Claude Code:  /plugin marketplace add $root
                /plugin install tour-changes@code-review-walkthrough
  Codex CLI:    codex plugin marketplace add $root
                codex plugin add tour-changes@code-review-walkthrough
EOF
