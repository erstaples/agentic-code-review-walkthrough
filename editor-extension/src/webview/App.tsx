import { useEffect, useState, useSyncExternalStore } from "react";
import type { LoadedTourSnapshot } from "../shared/snapshot.js";
import type { SidebarBridge, SidebarState } from "./bridge.js";
import * as model from "../shared/sidebar-model.js";
import { TourHeader, ModeControls } from "./components/TourHeader.js";
import { TourNavigation } from "./components/TourNavigation.js";
import { AnchorList } from "./components/AnchorList.js";
import { PlacementPicker } from "./components/PlacementPicker.js";
import { Narration } from "./components/Narration.js";

import { useAnchorList } from "./hooks/useAnchorList.js";
import { usePlacement } from "./hooks/usePlacement.js";
import { useSidebarShortcuts } from "./hooks/useSidebarShortcuts.js";

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
  snapshot,
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
  const rows = model.rows(snapshot);
  const paused = snapshot.mode === "paused";
  const listState = useAnchorList(rows, order);
  const {
    filter,
    setFilter,
    collapsed,
    setCollapsed,
    scrollTop,
    setScrollTop,
    scroll,
  } = listState;
  const { picker, select, closePicker, row } = usePlacement(
    snapshot,
    rows,
    bridge,
    listState,
  );
  useSidebarShortcuts({
    selection,
    bridge,
    select,
    closePicker,
    pickerOpen: picker !== null,
  });
  const pinned = rows.filter((row) => row.pinned).length;
  const hidden = rows.filter((row) => row.active && !row.slot).length;
  const notes = [
    pinned ? `${pinned} anchor${pinned === 1 ? " is" : "s are"} pinned.` : "",
    rows.some((row) => row.status === "stale")
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
      <TourHeader snapshot={snapshot} />
      <ModeControls
        mode={snapshot.mode}
        change={(mode) => bridge.send({ type: "state", mode })}
      />
      <section id="inventory" aria-label="Files in this stop">
        <div className="inventory-heading">
          <span id="file-count">
            {rows.length} {rows.length === 1 ? "anchor" : "anchors"} ·{" "}
            {rows.filter((row) => row.slot).length} in view
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
          listRef={listState.listRef}
          paused={paused}
          scroll={setScrollTop}
          toggle={(key, closed) =>
            setCollapsed({ ...collapsed, [key]: closed })
          }
          select={select}
          pin={(row) =>
            bridge.send({
              type: "layout",
              action: "pin",
              anchor: row.n,
              pinned: !row.pinned,
            })
          }
          keyDown={listState.handleKeyDown}
        />
        {row && picker && snapshot.presentation.layout && (
          <PlacementPicker
            key={picker.id}
            row={row}
            layout={snapshot.presentation.layout}
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
          Beat {snapshot.beatIndex + 1} of {snapshot.beatCount}
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
        html={snapshot.narrationHtml}
        active={snapshot.beat.active}
        paused={paused}
        select={select}
      />
      <p
        id="sequence-note"
        className="muted"
        hidden={!snapshot.presentation.layout?.sequence}
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
        snapshot={snapshot}
        navigate={(action) => bridge.send({ type: "navigate", action })}
        end={() => bridge.send({ type: "clear" })}
      />
    </section>
  );
}
