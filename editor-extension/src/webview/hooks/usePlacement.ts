import { useRef, useState } from "react";
import type { AnchorRow } from "../../shared/sidebar-model.js";
import type { LoadedTourSnapshot } from "../../shared/snapshot.js";
import type { SidebarBridge } from "../bridge.js";
import type { AnchorListState } from "./useAnchorList.js";

export function usePlacement(
  snapshot: LoadedTourSnapshot,
  rows: AnchorRow[],
  bridge: SidebarBridge,
  list: AnchorListState,
) {
  const [picker, setPicker] = useState<{ anchor: number; id: number } | null>(
    null,
  );
  const pickerId = useRef(0);
  function select(anchorNumber: number, move = false) {
    const layout = snapshot.presentation.layout;
    const row = rows.find((row) => row.n === anchorNumber);
    if (!layout || !row || snapshot.mode === "paused") return;
    if (!move && (row.slot || row.status === "open")) {
      setPicker(null);
      bridge.send({ type: "focus", anchor: anchorNumber });
      return;
    }
    const target = layout.slots.find(
      (slot) => slot.slot === row.remembered?.slot,
    );
    if (
      !move &&
      target?.anchor &&
      row.options.some(
        (option) => option.kind === "replace" && option.of === target.anchor,
      )
    ) {
      setPicker(null);
      bridge.send({
        type: "layout",
        action: "place",
        anchor: anchorNumber,
        placement: { kind: "replace", of: target.anchor },
      });
      return;
    }
    list.reveal(anchorNumber);
    setPicker({ anchor: anchorNumber, id: ++pickerId.current });
  }
  function closePicker() {
    if (picker) {
      if (list.isVisible(picker.anchor)) list.reveal(picker.anchor, false);
      list.focusAnchor(picker.anchor);
    }
    setPicker(null);
  }
  return {
    picker,
    select,
    closePicker,
    row: rows.find((row) => row.n === picker?.anchor),
  };
}
