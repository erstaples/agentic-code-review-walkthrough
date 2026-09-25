import { useEffect, useLayoutEffect, useRef } from "react";
import type { SidebarBridge, SidebarState } from "../bridge.js";

interface SidebarShortcuts {
  selection: SidebarState["selection"];
  bridge: SidebarBridge;
  select(anchorNumber: number, move?: boolean): void;
  closePicker(): void;
  pickerOpen: boolean;
}

export function useSidebarShortcuts({
  selection,
  bridge,
  select,
  closePicker,
  pickerOpen,
}: SidebarShortcuts) {
  // Host shortcuts and document keys use the current render's choices.
  const actions = useRef({ select, closePicker, pickerOpen });
  useLayoutEffect(() => {
    actions.current = { select, closePicker, pickerOpen };
  });
  useEffect(() => {
    if (selection) actions.current.select(selection.anchor, selection.move);
  }, [selection]);
  useEffect(() => {
    const keyDown = (event: globalThis.KeyboardEvent) => {
      if (event.altKey && /^Digit\d$/.test(event.code)) {
        event.preventDefault();
        const digit = Number(event.code.slice(5));
        if (!digit && !event.shiftKey) bridge.send({ type: "quickPick" });
        else actions.current.select(digit + (event.shiftKey ? 10 : 0));
      } else if (event.key === "Escape" && actions.current.pickerOpen) {
        event.preventDefault();
        actions.current.closePicker();
      }
    };
    document.addEventListener("keydown", keyDown);
    return () => document.removeEventListener("keydown", keyDown);
  }, [bridge]);
}
