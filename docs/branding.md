# Kankō naming

Use **Kankō** in prose, marketing, documentation, and UI labels. Use **Kanko**
only where a macron is unsupported. Use lowercase ASCII **kanko** in identifiers,
paths, package names, and other programmatic contexts. The graphic wordmark
keeps its designed lowercase letterforms.

| Surface | Name |
|---|---|
| GitHub repository | `getkanko/kanko` |
| Agent plugin and marketplace | `kanko` |
| Plugin installation identifier | `kanko@kanko` |
| Implementation skill | `kanko-build` — Kankō Build |
| Review skill | `kanko-tour` — Kankō Tour |
| VS Code extension | `getkankodev.kanko` — Kankō |
| MCP server | `kanko` |
| Tour tools | `kanko_tour_*` |
| Change notes tools | `kanko_notes_*` |
| Settings and commands | `kanko.*` |
| Revision URI scheme | `kanko-rev` |
| Environment variables | `KANKO_*` |
| Bridge lockfiles | `~/.kanko/tour` |
| Application state directory | `kanko` under the platform's user state location |

Call the saved context **change notes** in product language. A **change record**
is the stored unit that contains those notes, the tour plan, and review state.
Its API identifier is `recordId` and its generated IDs start with `rec_`.

The rename is a clean break: bridge protocol 3 and change record schema 2 use
only the new names and paths. There are no aliases or migrations. Update both
the agent plugin and extension together and start a new agent session.

Historical verification JSON and screenshots retain what the original runs
actually produced. Their README files identify them as historical; current
examples and runtime interfaces use the names above.
