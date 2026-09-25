// Builds rows for the sidebar and quick pick.
import type { PlacementOption, RolePreference } from "./layout.js";
import type { AnchorStatus, PresentationSnapshot } from "./snapshot.js";
import type { AnchorRole, Beat, TourAnchor, TourStop } from "./tour.js";

/** Role section headings, in display order. */
export const roles: Record<AnchorRole, string> = {
  change: "Changes",
  evidence: "Evidence",
  caller: "Callers",
  callee: "Callees",
  config: "Config",
  schema: "Schema",
  context: "Context",
};

/** A readable slot position: `bottomLeft` → `bottom left`, `group3` → `group 3`. */
export function position(slot: string | undefined): string {
  if (!slot) return "";
  return slot
    .replace(/([A-Z])/g, " $1")
    .toLowerCase()
    .replace(/^group/, "group ");
}

export interface RowSource {
  stop: Pick<TourStop, "anchors">;
  beat: Pick<Beat, "active">;
  presentation?: Partial<PresentationSnapshot>;
}

export interface AnchorRow extends TourAnchor {
  filename: string;
  /** The parent directory, or `.` at the repository root. */
  directory: string;
  /** Cited by the current beat. */
  active: boolean;
  status: AnchorStatus;
  /** A readable group position when the anchor is in view, otherwise empty. */
  slot: string;
  pinned: boolean;
  options: PlacementOption[];

  remembered: RolePreference | undefined;
}

export function rows(snapshot: RowSource): AnchorRow[] {
  const states = snapshot.presentation?.anchors || [];
  const layout = snapshot.presentation?.layout;
  return snapshot.stop.anchors.map((anchor) => {
    const state = states.find((s) => s.n === anchor.n);
    const slot = layout?.slots?.find((s) => s.anchor === anchor.n);
    const parts = anchor.path.split("/");
    return {
      ...anchor,
      filename: parts[parts.length - 1],
      directory: parts.slice(0, -1).join("/") || ".",
      active: snapshot.beat.active.includes(anchor.n),
      status: state?.status || "not-open",
      slot: position(slot?.slot),
      pinned: !!slot?.pinned,
      options: layout?.options?.[anchor.n] || [],
      remembered: layout?.preferences?.[anchor.role],
    };
  });
}

/** `view` groups anchors that are currently shown in an editor group. */
export type SectionKey = "view" | AnchorRole;
export type ListOrder = "role" | "order";

export interface ListOptions {
  filter?: string;
  order?: ListOrder;
  /** User choices override the initial collapsed state. */
  collapsed?: Partial<Record<SectionKey, boolean>>;
}

export const ROW_HEIGHT = 68;
export const SECTION_HEIGHT = 28;

export interface RowEntry {
  type: "row";
  row: AnchorRow;
  /** Hide repeated role icons under a role heading. */
  showRoleIcon: boolean;
  height: typeof ROW_HEIGHT;
}

export interface SectionEntry {
  type: "section";
  key: SectionKey;
  label: string;
  count: number;
  closed: boolean;
  height: typeof SECTION_HEIGHT;
}

export type ListEntry = RowEntry | SectionEntry;

/** Smaller stops use a flat list. */
const GROUPING_THRESHOLD = 5;
/** Larger stops start with inactive sections collapsed. */
const COLLAPSE_THRESHOLD = 12;

export function entries(
  rows: AnchorRow[],
  { filter = "", order = "role", collapsed = {} }: ListOptions = {},
): ListEntry[] {
  const query = filter.toLowerCase().trim();
  const found = rows.filter((row) =>
    `${row.n} ${row.path} ${row.label} ${row.role}`
      .toLowerCase()
      .includes(query),
  );
  const rowEntry = (row: AnchorRow, showRoleIcon: boolean): RowEntry => ({
    type: "row",
    row,
    showRoleIcon,
    height: ROW_HEIGHT,
  });
  if (rows.length < GROUPING_THRESHOLD || order === "order") {
    return found.map((row) => rowEntry(row, true));
  }

  const sections: [SectionKey, string, AnchorRow[]][] = [
    ["view", "In view", found.filter((row) => row.slot)],
    ...(Object.entries(roles) as [AnchorRole, string][]).map(
      ([role, label]): [SectionKey, string, AnchorRow[]] => [
        role,
        label,
        found.filter((row) => !row.slot && row.role === role),
      ],
    ),
  ];
  return sections.flatMap(([key, label, members]): ListEntry[] => {
    if (!members.length) return [];
    const collapsedByDefault =
      rows.length >= COLLAPSE_THRESHOLD &&
      key !== "view" &&
      !members.some((row) => row.active);
    // A filter always shows its matches.
    const closed = !query && (collapsed[key] ?? collapsedByDefault);
    const header: SectionEntry = {
      type: "section",
      key,
      label,
      count: members.length,
      closed,
      height: SECTION_HEIGHT,
    };
    if (closed) return [header];
    return [header, ...members.map((row) => rowEntry(row, key === "view"))];
  });
}

export type PositionedEntry = ListEntry & { top: number };

export interface ListWindow {
  visible: PositionedEntry[];
  /** Spacer heights above and below the mounted entries. */
  before: number;
  after: number;
  total: number;
}

/** Extra height rendered above and below the viewport. */
const OVERSCAN = 136;

// Render nearby rows and use spacers for the rest.
export function windowed(
  entries: ListEntry[],
  scrollTop: number,
  height: number,
): ListWindow {
  let top = 0;
  const positioned = entries.map((entry) => {
    const value = { ...entry, top };
    top += entry.height;
    return value;
  });
  const visible = positioned.filter(
    (entry) =>
      entry.top + entry.height >= scrollTop - OVERSCAN &&
      entry.top <= scrollTop + height + OVERSCAN,
  );
  const last = visible[visible.length - 1];
  return {
    visible,
    before: visible[0]?.top || 0,
    after: last ? top - last.top - last.height : top,
    total: top,
  };
}
