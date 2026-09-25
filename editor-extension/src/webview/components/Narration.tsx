import { useLayoutEffect, useMemo, useRef } from "react";
export function Narration({
  html,
  active,
  paused,
  select,
}: {
  html: string;
  active: number[];
  paused: boolean;
  select(n: number): void;
}) {
  const node = useRef<HTMLDivElement>(null);
  const markup = useMemo(() => ({ __html: html }), [html]);
  useLayoutEffect(() => {
    for (const chip of node.current?.querySelectorAll<HTMLButtonElement>(
      "[data-anchor]",
    ) || []) {
      chip.classList.toggle(
        "active",
        active.includes(Number(chip.dataset.anchor)),
      );
      chip.disabled = paused;
    }
  }, [html, active, paused]);
  // The host supplies escaped Markdown and numbered buttons.
  return (
    <div
      id="narration"
      className="narration"
      aria-live="polite"
      ref={node}
      dangerouslySetInnerHTML={markup}
      onClick={(event) => {
        const button =
          event.target instanceof Element
            ? event.target.closest<HTMLButtonElement>("button[data-anchor]")
            : null;
        if (button && !button.disabled) select(Number(button.dataset.anchor));
      }}
    />
  );
}
