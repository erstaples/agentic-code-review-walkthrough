<img src="https://raw.githubusercontent.com/getkanko/kanko/main/editor-extension/assets/kanko-icon-256.png" alt="kanko icon" width="96" height="96">

# Kankō

Let your coding agent walk you through a diff in VS Code: open the relevant
files, highlight the lines being discussed, and pause for questions.

This is the editor companion for
[tour-changes](https://github.com/getkanko/kanko).
Install and configure that project's agent plugin or MCP server to drive a tour.
The extension alone does not provide an AI assistant.

## Getting started

1. Install this extension in VS Code 1.139 or newer.
2. Follow the [agent setup instructions](https://github.com/getkanko/kanko#step-2--your-agent).
   The MCP server requires Node.js 22 or newer and Git on its PATH.
3. Open your repository and ask your agent to “tour the changes”.

For WSL, SSH, or containers, install the extension in the remote workspace so
it runs on the same side as your code and the agent's MCP server.

## Controls

The **Tour** view opens in the secondary sidebar when your agent loads a tour.
It shows stop and beat progress, risk, pinned revisions, and narration.

- Numbered narration chips open the referenced source.
- **Previous beat / Next beat** and the stop controls move through the plan.
- **Following** opens the selected anchor as narration advances.
- **Exploring** advances narration without moving your editor.
- **Paused** removes tour decorations; **Following** resumes at the current beat.
- **End tour** clears presentation without marking anything reviewed.
- **kanko: Copy Citation** copies the selected code location and source revision.

`relay.presentation.dimOpacity` and `relay.presentation.showLabels` control
context opacity and inline labels. `relay.tour.anchorLimit` limits anchors per
stop (24 by default). Up to three active anchors share numbered colors, inline labels, and tab badges.
The status bar names their files. Removed base focus opens a companion when
there is room, otherwise a seam offers **Peek removed code**. Set
`relay.presentation.removedCode` to `seam` to always use that fallback.

The tour reuses matching tabs and closes only untouched previews that it opened.
Pinning, editing, or moving a tab makes it yours. Selecting code switches to
Exploring. Layout placement and restoration remain later phases.

## Local connection

The extension starts a loopback HTTP server with a per-session authentication
token. The local MCP server discovers it through a lockfile under
`~/.kanko/tour`. It lets the agent open files, navigate authored beats, and change presentation mode within your workspace.
Bridge protocol 2 is required on both sides.

[Report an issue](https://github.com/getkanko/kanko/issues)
with your VS Code version and whether you use a local or remote workspace.
