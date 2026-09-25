import {
  useLayoutEffect,
  useState,
  type RefObject,
  type KeyboardEvent,
} from "react";
import * as model from "../../shared/sidebar-model.js";
import { AnchorRow, RoleIcon } from "./AnchorRow.js";
export function AnchorList({
  rows,
  filter,
  order,
  collapsed,
  scrollTop,
  listRef,
  paused,
  scroll,
  toggle,
  select,
  pin,
  keyDown,
}: {
  rows: model.AnchorRow[];
  filter: string;
  order: model.ListOrder;
  collapsed: model.ListOptions["collapsed"];
  scrollTop: number;
  listRef: RefObject<HTMLDivElement | null>;
  paused: boolean;
  scroll(top: number): void;
  toggle(key: model.SectionKey, closed: boolean): void;
  select(n: number, move?: boolean): void;
  pin(row: model.AnchorRow): void;
  keyDown(event: KeyboardEvent<HTMLDivElement>): void;
}) {
  const [height, setHeight] = useState(340);
  useLayoutEffect(() => {
    const node = listRef.current;
    if (!node) return;
    const measure = () => setHeight(node.clientHeight || 340);
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    measure();
    return () => observer.disconnect();
  }, [listRef]);
  const entries = model.entries(rows, { filter, order, collapsed });
  const page = model.windowed(entries, scrollTop, height);
  return (
    <>
      <div
        id="anchor-list"
        ref={listRef}
        hidden={rows.length === 1}
        tabIndex={0}
        role="region"
        aria-label="Stop anchor list. Use arrow keys to navigate rows."
        onScroll={(event) => scroll(event.currentTarget.scrollTop)}
        onKeyDown={keyDown}
      >
        <div id="list-content">
          <div style={{ height: page.before }} aria-hidden="true" />
          {page.visible.map((entry) =>
            entry.type === "row" ? (
              <AnchorRow
                key={`anchor:${entry.row.n}`}
                row={entry.row}
                showRoleIcon={entry.showRoleIcon}
                paused={paused}
                select={select}
                pin={pin}
              />
            ) : (
              <button
                key={`section:${entry.key}`}
                className="role-section"
                data-section={entry.key}
                aria-label={`${entry.label}, ${entry.count} anchors`}
                aria-expanded={!entry.closed}
                onClick={() => toggle(entry.key, !entry.closed)}
              >
                <span className="section-chevron">
                  {entry.closed ? "▸" : "▾"}
                </span>
                {entry.key !== "view" && (
                  <RoleIcon role={entry.key} decorative />
                )}
                <span>
                  {entry.label} {entry.count}
                </span>
              </button>
            ),
          )}
          <div style={{ height: page.after }} aria-hidden="true" />
        </div>
      </div>
      <p id="no-results" className="muted" hidden={entries.length > 0}>
        No matching files.
      </p>
    </>
  );
}
