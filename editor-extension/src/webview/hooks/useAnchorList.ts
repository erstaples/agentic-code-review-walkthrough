import { useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import * as model from "../../shared/sidebar-model.js";

export function useAnchorList(rows: model.AnchorRow[], order: model.ListOrder) {
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<
    Partial<Record<model.SectionKey, boolean>>
  >({});
  const [scrollTop, setScrollTop] = useState(0);
  const [focusRow, setFocusRow] = useState<number | null>(null);
  const list = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (list.current) list.current.scrollTop = scrollTop;
  }, [scrollTop, filter, order, collapsed]);
  function scroll(top: number) {
    if (list.current) list.current.scrollTop = top;
    setScrollTop(top);
  }
  function reveal(anchorNumber: number, clearFilter = true) {
    const row = rows.find((row) => row.n === anchorNumber);
    if (!row) return;
    const nextCollapsed = clearFilter
      ? { ...collapsed, [row.slot ? "view" : row.role]: false }
      : collapsed;
    if (clearFilter) {
      setFilter("");
      setCollapsed(nextCollapsed);
    }
    const entries = model.entries(rows, {
      filter: clearFilter ? "" : filter,
      order,
      collapsed: nextCollapsed,
    });
    let top = 0;
    for (const entry of entries) {
      if (entry.type === "row" && entry.row.n === anchorNumber) break;
      top += entry.height;
    }
    scroll(Math.max(0, top - 32));
  }
  useLayoutEffect(() => {
    if (focusRow !== null) {
      const target = list.current?.querySelector<HTMLButtonElement>(
        `[data-row="${focusRow}"] [data-anchor]`,
      );
      (target || list.current)?.focus({ preventScroll: true });
      setFocusRow(null);
    }
  }, [focusRow]);
  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const available = model
      .entries(rows, { filter, order, collapsed })
      .flatMap((entry) => (entry.type === "row" ? [entry.row.n] : []));
    if (!available.length) return;
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-row]")
        : null;
    const index = available.indexOf(Number(target?.dataset.row));
    let nextIndex: number;
    switch (event.key) {
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = available.length - 1;
        break;
      default: {
        const direction = event.key === "ArrowDown" ? 1 : -1;
        nextIndex = Math.max(
          0,
          Math.min(available.length - 1, index + direction),
        );
      }
    }
    event.preventDefault();
    reveal(available[nextIndex], false);
    setFocusRow(available[nextIndex]);
  }
  function isVisible(anchor: number) {
    return model
      .entries(rows, { filter, order, collapsed })
      .some((entry) => entry.type === "row" && entry.row.n === anchor);
  }
  return {
    filter,
    setFilter,
    collapsed,
    setCollapsed,
    scrollTop,
    setScrollTop,
    listRef: list,
    scroll,
    reveal,
    isVisible,
    focusAnchor: setFocusRow,
    handleKeyDown,
  };
}
export type AnchorListState = ReturnType<typeof useAnchorList>;
