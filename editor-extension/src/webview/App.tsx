import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";
import type { LoadedTourSnapshot } from "../shared/snapshot.js";
import type { SidebarBridge, SidebarState } from "./bridge.js";
import * as model from "../shared/sidebar-model.js";
import { TourHeader, ModeControls } from "./components/TourHeader.js";
import { TourNavigation } from "./components/TourNavigation.js";
import { AnchorList } from "./components/AnchorList.js";
import { PlacementPicker } from "./components/PlacementPicker.js";
import { Narration } from "./components/Narration.js";

export function App({ bridge }: { bridge: SidebarBridge }) {
  const { snapshot, error, selection } = useSyncExternalStore(
    bridge.subscribe,
    bridge.getState,
  );
  const [order, setOrder] = useState<model.ListOrder>("role");
  useEffect(() => {
    bridge.ready();
  }, [bridge]);
  return (
    <main>
      <div className="eyebrow">CODE WALKTHROUGH</div>
      <h1 id="tour-title">
        {snapshot.loaded
          ? String(snapshot.title ?? "")
          : "Your tour, one beat at a time."}
      </h1>
      {snapshot.loaded ? (
        <StopView
          key={`${snapshot.tourId}:${snapshot.stop.id}`}
          snapshot={snapshot}
          selection={selection}
          bridge={bridge}
          order={order}
          setOrder={setOrder}
        />
      ) : (
        <p id="empty">Load a tour from your agent to begin.</p>
      )}
      <p id="error" role="alert">
        {error}
      </p>
    </main>
  );
}

function StopView({
  snapshot: s,
  selection,
  bridge,
  order,
  setOrder,
}: {
  snapshot: LoadedTourSnapshot;
  selection: SidebarState["selection"];
  bridge: SidebarBridge;
  order: model.ListOrder;
  setOrder(order: model.ListOrder): void;
}) {
  const rows = model.rows(s);
  const paused = s.mode === "paused";
  const [filter, setFilter] = useState("");
  const [collapsed, setCollapsed] = useState<
    Partial<Record<model.SectionKey, boolean>>
  >({});
  const [picker, setPicker] = useState<{ anchor: number; id: number } | null>(
    null,
  );
  const pickerId = useRef(0);
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
  function reveal(n: number, clearFilter = true) {
    const row = rows.find((r) => r.n === n);
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
      if (entry.type === "row" && entry.row.n === n) break;
      top += entry.height;
    }
    scroll(Math.max(0, top - 32));
  }
  function select(n: number, move = false) {
    const layout = s.presentation.layout;
    const row = rows.find((r) => r.n === n);
    if (!layout || !row || paused) return;
    if (!move && (row.slot || row.status === "open")) {
      setPicker(null);
      bridge.send({ type: "focus", anchor: n });
      return;
    }
    const target = layout.slots.find(
      (slot) => slot.slot === row.remembered?.slot,
    );
    if (
      !move &&
      target?.anchor &&
      row.options.some((o) => o.kind === "replace" && o.of === target.anchor)
    ) {
      setPicker(null);
      bridge.send({
        type: "layout",
        action: "place",
        anchor: n,
        placement: { kind: "replace", of: target.anchor },
      });
      return;
    }
    reveal(n);
    setPicker({ anchor: n, id: ++pickerId.current });
  }
  function closePicker() {
    if (picker) {
      reveal(picker.anchor);
      setFocusRow(picker.anchor);
    }
    setPicker(null);
  }
  useLayoutEffect(() => {
    if (focusRow !== null) {
      list.current
        ?.querySelector<HTMLButtonElement>(
          `[data-row="${focusRow}"] [data-anchor]`,
        )
        ?.focus({ preventScroll: true });
      setFocusRow(null);
    }
  }, [focusRow]);
  // Host shortcuts and document keys use the current render's choices.
  const actions = useRef({ select, closePicker, picker });
  useLayoutEffect(() => {
    actions.current = { select, closePicker, picker };
  });
  useEffect(() => {
    if (selection) actions.current.select(selection.anchor, selection.move);
  }, [selection]);
  useEffect(() => {
    const keyDown = (event: globalThis.KeyboardEvent) => {
      if (event.altKey && /^Digit\d$/.test(event.code)) {
        event.preventDefault();
        const n = Number(event.code.slice(5));
        if (!n && !event.shiftKey) bridge.send({ type: "quickPick" });
        else actions.current.select(n + (event.shiftKey ? 10 : 0));
      } else if (event.key === "Escape" && actions.current.picker) {
        event.preventDefault();
        actions.current.closePicker();
      }
    };
    document.addEventListener("keydown", keyDown);
    return () => document.removeEventListener("keydown", keyDown);
  }, [bridge]);
  function listKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
    const available = model
      .entries(rows, { filter, order, collapsed })
      .flatMap((e) => (e.type === "row" ? [e.row.n] : []));
    if (!available.length) return;
    const target =
      event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-row]")
        : null;
    const index = available.indexOf(Number(target?.dataset.row));
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? available.length - 1
          : Math.max(
              0,
              Math.min(
                available.length - 1,
                index + (event.key === "ArrowDown" ? 1 : -1),
              ),
            );
    event.preventDefault();
    reveal(available[next], false);
    setFocusRow(available[next]);
  }
  const row = rows.find((r) => r.n === picker?.anchor);
  const pinned = rows.filter((r) => r.pinned).length;
  const hidden = rows.filter((r) => r.active && !r.slot).length;
  const notes = [
    pinned ? `${pinned} anchor${pinned === 1 ? " is" : "s are"} pinned.` : "",
    rows.some((r) => r.status === "stale")
      ? "A source has changed. Reload the tour before relying on its highlights."
      : "",
    hidden
      ? `${hidden} cited source${hidden === 1 ? " is" : "s are"} outside the current view. Choose a numbered file to inspect it.`
      : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <section id="tour">
      <TourHeader snapshot={s} />
      <ModeControls
        mode={s.mode}
        change={(mode) => bridge.send({ type: "state", mode })}
      />
      <section id="inventory" aria-label="Files in this stop">
        <div className="inventory-heading">
          <span id="file-count">
            {rows.length} {rows.length === 1 ? "anchor" : "anchors"} ·{" "}
            {rows.filter((r) => r.slot).length} in view
          </span>
          <button
            id="quick-pick"
            title="Find any anchor (Alt+0)"
            onClick={() => bridge.send({ type: "quickPick" })}
          >
            Find file…
          </button>
        </div>
        <p id="guideline" className="muted" hidden={rows.length <= 7}>
          Above the 7-file guideline
        </p>
        <div id="list-tools" hidden={rows.length < 5}>
          <input
            id="filter"
            type="search"
            placeholder="Filter files…"
            aria-label="Filter files by number, path, label or role"
            value={filter}
            onChange={(event) => {
              setFilter(event.target.value);
              scroll(0);
            }}
          />
          {(["role", "order"] as const).map((value) => (
            <button
              key={value}
              id={`order-${value}`}
              aria-pressed={order === value}
              onClick={() => {
                setOrder(value);
                scroll(0);
              }}
            >
              {value === "role" ? "Role" : "Order"}
            </button>
          ))}
        </div>
        <p id="single-file" hidden={rows.length !== 1}>
          {rows.length === 1
            ? `${rows[0].path}:${rows[0].context.startLine}–${rows[0].context.endLine} · ${rows[0].role}`
            : ""}
        </p>
        <AnchorList
          rows={rows}
          filter={filter}
          order={order}
          collapsed={collapsed}
          scrollTop={scrollTop}
          listRef={list}
          paused={paused}
          scroll={setScrollTop}
          toggle={(key, closed) =>
            setCollapsed({ ...collapsed, [key]: closed })
          }
          select={select}
          pin={(r) =>
            bridge.send({
              type: "layout",
              action: "pin",
              anchor: r.n,
              pinned: !r.pinned,
            })
          }
          keyDown={listKeyDown}
        />
        {row && picker && s.presentation.layout && (
          <PlacementPicker
            key={picker.id}
            row={row}
            layout={s.presentation.layout}
            paused={paused}
            close={closePicker}
            place={(placement, remember) =>
              bridge.send({
                type: "layout",
                action: "place",
                anchor: row.n,
                placement,
                remember,
              })
            }
          />
        )}
      </section>
      <div className="beat-heading">
        <span id="beat-position">
          Beat {s.beatIndex + 1} of {s.beatCount}
        </span>
        <button
          id="reset-layout"
          disabled={paused}
          onClick={() => bridge.send({ type: "layout", action: "reset" })}
        >
          Reset layout
        </button>
      </div>
      <Narration
        html={s.narrationHtml}
        active={s.beat.active}
        paused={paused}
        select={select}
      />
      <p
        id="sequence-note"
        className="muted"
        hidden={!s.presentation.layout?.sequence}
      >
        Sequence mode keeps small editors readable.{" "}
        <button
          id="sequence-override"
          onClick={() => bridge.send({ type: "sequenceOverride" })}
        >
          Show multiple groups
        </button>
      </p>
      <p id="warnings" className="muted">
        {notes}
      </p>
      <TourNavigation
        snapshot={s}
        navigate={(action) => bridge.send({ type: "navigate", action })}
        end={() => bridge.send({ type: "clear" })}
      />
    </section>
  );
}
