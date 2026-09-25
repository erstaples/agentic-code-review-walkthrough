import type { AnchorRole } from "../../shared/tour.js";
import type { AnchorRow as Row } from "../../shared/sidebar-model.js";
export const color = (n: number) => `color-${((n - 1) % 6) + 1}`;
export const roleName = (role: AnchorRole) =>
  role[0].toUpperCase() + role.slice(1);
const rolePaths = {
  change: "M3 10.5 10.5 3l2.5 2.5L5.5 13H3z M9 4.5 11.5 7",
  evidence: "M14 8a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M5 8l2 2 4-4",
  caller: "M3 3l10 10 M7 13h6V7",
  callee: "M3 13 13 3 M7 3h6v6",
  config: "M2 4h12 M2 8h12 M2 12h12 M5 2v4 M11 6v4 M7 10v4",
  schema: "M5 2H2v12h3 M11 2h3v12h-3 M6 5h4 M6 8h4 M6 11h4",
  context: "M14 8a6 6 0 1 1-12 0 6 6 0 0 1 12 0 M8 7v5 M8 4v.5",
};
export function RoleIcon({
  role,
  decorative = false,
}: {
  role: AnchorRole;
  decorative?: boolean;
}) {
  return (
    <span
      className="role-icon"
      {...(decorative
        ? { "aria-hidden": true as const }
        : {
            tabIndex: 0,
            role: "img",
            "aria-label": roleName(role),
            "data-tooltip": roleName(role),
          })}
    >
      <svg viewBox="0 0 16 16" aria-hidden="true">
        <path d={rolePaths[role]} />
      </svg>
    </span>
  );
}
export function AnchorRow({
  row,
  showRoleIcon,
  paused,
  select,
  pin,
}: {
  row: Row;
  showRoleIcon: boolean;
  paused: boolean;
  select(n: number, move?: boolean): void;
  pin(row: Row): void;
}) {
  const location = `${row.path}:${row.context.startLine}–${row.context.endLine} · ${row.label}`;
  return (
    <div
      className={`anchor-row ${color(row.n)}${row.active ? " current-beat" : ""}${row.pinned ? " pinned" : ""}`}
      data-row={row.n}
      aria-label={`Anchor ${row.n}: ${row.path}, ${row.role}${row.active ? ", current beat" : ""}`}
    >
      <button
        className={`chip ${color(row.n)}`}
        data-anchor={row.n}
        aria-label={`Anchor ${row.n}: ${row.path}`}
        disabled={paused}
        onClick={() => select(row.n)}
      >
        {row.n}
      </button>
      <div className="identity" title={`${location} · ${row.role}`}>
        <div className="filename">
          <strong>{row.filename}</strong>
          <span className={`change ${row.change}`} title={row.change}>
            {
              { modified: "M", added: "A", deleted: "D", unchanged: "U" }[
                row.change
              ]
            }
          </span>
          {row.active && (
            <span className="active-dot" title="Referenced in this beat">
              ●
            </span>
          )}
          {row.status === "stale" && (
            <span className="stale">source changed</span>
          )}
        </div>
        <div className="details" title={location}>
          {row.directory} · {row.context.startLine}–{row.context.endLine} ·{" "}
          {row.label}
        </div>
      </div>
      <div className="row-controls">
        {row.slot ? (
          <>
            <button
              className="role-focus"
              data-anchor={row.n}
              data-tooltip={roleName(row.role)}
              aria-label={`${roleName(row.role)}: focus anchor ${row.n}`}
              disabled={paused}
              onClick={() => select(row.n)}
            >
              <RoleIcon role={row.role} decorative />
            </button>
            <div className="row-actions">
              <button
                data-pin={row.n}
                aria-label={`${row.pinned ? "Unpin" : "Pin"} anchor ${row.n}`}
                disabled={paused}
                onClick={() => pin(row)}
              >
                {row.pinned ? "Unpin" : "Pin"}
              </button>
              <button
                data-move={row.n}
                aria-label={`Move anchor ${row.n}`}
                disabled={paused}
                onClick={() => select(row.n, true)}
              >
                Move…
              </button>
            </div>
          </>
        ) : (
          <>
            {showRoleIcon && <RoleIcon role={row.role} />}
            <button
              data-anchor={row.n}
              aria-label={`Open anchor ${row.n}: ${row.filename}`}
              disabled={paused}
              onClick={() => select(row.n)}
            >
              {row.status === "open" ? "Show ▾" : "Open ▾"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
