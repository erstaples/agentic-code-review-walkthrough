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
| Review map tools | `kanko_map_*` |
| Settings and commands | `kanko.*` |
| Revision URI scheme | `kanko-rev` |
| Environment variables | `KANKO_*` |
| Bridge lockfiles | `~/.kanko/tour` |
| Application state directory | `kanko` under the platform's user state location |

A **review map** connects requirements, code, decisions, evidence, the tour
plan, and review progress. **Change notes** hold explanations and decisions
inside the map. Its **event log** preserves the history.

`kanko-build` implements a change and prepares its review map; `kanko-tour`
guides the reviewer through it.
Its API identifier is `mapId` and its generated IDs start with `map_`.

The rename is a clean break: bridge protocol 3 and review map schema 2 use
only the new names and paths. There are no aliases or migrations. Update both
the agent plugin and extension together and start a new agent session.

Historical verification JSON and screenshots retain what the original runs
actually produced. Their README files identify them as historical; current
examples and runtime interfaces use the names above.
