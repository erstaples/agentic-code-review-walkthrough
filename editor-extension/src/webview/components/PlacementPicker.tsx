import { useLayoutEffect, useRef, useState } from "react";
import type { AnchorRow } from "../../shared/sidebar-model.js";
import { position } from "../../shared/sidebar-model.js";
import type { LayoutSnapshot } from "../../shared/snapshot.js";
import type { PlacementChoice, PlacementOption } from "../../shared/layout.js";
import { color } from "./AnchorRow.js";
function Diagram({ option, row }: { option: PlacementOption; row: AnchorRow }) {
  return (
    <span className="diagram" aria-hidden="true">
      {option.preview?.map((cell, i) => (
        <span
          key={i}
          className={`diagram-cell ${color(cell.anchor || row.n)}${cell.anchor === row.n ? " incoming" : ""}`}
          style={{
            left: `${cell.x * 100}%`,
            top: `${cell.y * 100}%`,
            width: `${cell.w * 100}%`,
            height: `${cell.h * 100}%`,
          }}
        >
          {cell.anchor || "–"}
        </span>
      ))}
    </span>
  );
}
export function PlacementPicker({
  row,
  layout,
  paused,
  close,
  place,
}: {
  row: AnchorRow;
  layout: LayoutSnapshot;
  paused: boolean;
  close(): void;
  place(placement: PlacementChoice, remember: boolean): void;
}) {
  const [remember, setRemember] = useState(false);
  const picker = useRef<HTMLElement>(null);
  const hadFocus = useRef(false);
  useLayoutEffect(() => {
    if (hadFocus.current && document.activeElement === document.body) {
      const target =
        picker.current?.querySelector<HTMLButtonElement>(
          "#placement-options button:not(:disabled)",
        ) || picker.current?.querySelector<HTMLButtonElement>("#close-picker");
      target?.focus();
    }
  });
  useLayoutEffect(() => {
    picker.current?.scrollIntoView({ block: "nearest" });
    picker.current
      ?.querySelector<HTMLButtonElement>("#placement-options button")
      ?.focus();
  }, []);
  const options = row.options
    .filter((o) => o.kind !== "auto")
    .sort((a, b) => Number(a.kind === "peek") - Number(b.kind === "peek"));
  const atCap = layout.slots.length >= layout.cap;
  return (
    <section
      id="picker"
      aria-label="Placement picker"
      ref={picker}
      onFocus={() => {
        hadFocus.current = true;
      }}
      onBlur={(event) => {
        if (
          event.relatedTarget &&
          !event.currentTarget.contains(event.relatedTarget)
        )
          hadFocus.current = false;
      }}
    >
      <div className="picker-heading">
        <strong id="picker-title">
          {row.slot ? "Move" : "Open"} {row.n} · {row.filename}
        </strong>
        <button
          id="close-picker"
          aria-label="Close placement picker"
          onClick={close}
        >
          ×
        </button>
      </div>
      <div id="placement-options">
        {options.map((option) => {
          const of = "of" in option ? option.of : undefined;
          const slot = layout.slots.find((s) => s.anchor === of);
          const label =
            option.kind === "peek"
              ? "Peek"
              : `${{ below: "Below", beside: "Beside", replace: "Replace" }[option.kind]} ${option.of}`;
          return (
            <button
              key={`${option.kind}:${of}`}
              className="placement-tile"
              data-placement={option.kind}
              data-of={of ?? ""}
              aria-label={`${label}${slot ? ` in ${position(slot.slot)}` : ` at anchor ${row.n}`}`}
              disabled={paused}
              onClick={() =>
                place(
                  option.kind === "peek"
                    ? { kind: "peek" }
                    : { kind: option.kind, of: option.of },
                  remember,
                )
              }
            >
              {option.kind === "peek" ? (
                <span className="peek-icon">↗</span>
              ) : (
                <Diagram option={option} row={row} />
              )}
              <span>{label}</span>
              <small>
                {option.kind === "peek"
                  ? "Keep this layout"
                  : position(slot?.slot)}
              </small>
            </button>
          );
        })}
      </div>
      <label
        id="remember-label"
        hidden={!options.some((o) => o.kind !== "peek")}
      >
        <input
          id="remember"
          type="checkbox"
          checked={remember}
          onChange={(event) => setRemember(event.target.checked)}
        />{" "}
        <span id="remember-text">Remember for {row.role} anchors</span>
      </label>
      <p id="picker-help" className="muted">
        {row.pinned
          ? "Unpin this anchor to move it. Peek keeps pins in place."
          : `${atCap ? `${layout.cap} groups is the limit. Choose an eligible replacement, or peek.` : "Choose what to compare. Pins and reviewer previews are protected."}${row.remembered ? ` Remembered destination: ${position(row.remembered.slot)}.` : ""}`}
      </p>
    </section>
  );
}
