# Claude Tour

Let your coding agent walk you through a diff in VS Code: open the relevant
files, highlight the lines being discussed, and pause for questions.

This is the editor companion for
[tour-changes](https://github.com/erstaples/agentic-code-review-walkthrough).
Install and configure that project's agent plugin or MCP server to drive a tour.
The extension alone does not provide an AI assistant.

## Getting started

1. Install this extension in VS Code 1.90 or newer.
2. Follow the [agent setup instructions](https://github.com/erstaples/agentic-code-review-walkthrough#step-2--your-agent).
   The MCP server requires Node.js 22 or newer and Git on its PATH.
3. Open your repository and ask your agent to “tour the changes”.

For WSL, SSH, or containers, install the extension in the remote workspace so
it runs on the same side as your code and the agent's MCP server.

## Controls

- **Tour Changes: Toggle Diff View** shows or hides the native multi-file diff.
- **Tour Changes: Follow Presenter** follows the current tour focus.
- **Tour Changes: Pause Presentation** lets you explore independently.
- **Tour Changes: Copy Citation** copies the selected code location for your agent.

The `relay.presentation` settings control removed-code companions, context
opacity, beat labels, and when companion tabs close. Selecting code switches
from following the presenter to exploring.

## Local connection

The extension starts a loopback HTTP server with a per-session authentication
token. The local MCP server discovers it through a lockfile under
`~/.claude/tour`. It lets the agent open files, control diff views, and inspect
editor selection within your workspace.

[Report an issue](https://github.com/erstaples/agentic-code-review-walkthrough/issues)
with your VS Code version and whether you use a local or remote workspace.
