import type {
  LoadedTourSnapshot,
  PresentationMode,
} from "../../shared/snapshot.js";
export function TourHeader({ snapshot: s }: { snapshot: LoadedTourSnapshot }) {
  const rev = s.stop.anchors[0].rev;
  return (
    <>
      <div className="progress">
        <span id="position">
          STOP {s.stopIndex + 1} / {s.stopCount}
        </span>
        <span id="risk" className="risk">
          {s.stop.risk} risk
        </span>
      </div>
      <h2 id="stop-title">{s.stop.title}</h2>
      <div id="revisions" className="revisions">
        {rev.base.slice(0, 7)} →{" "}
        {rev.head.startsWith("WORKTREE:")
          ? "working snapshot"
          : rev.head.slice(0, 7)}
      </div>
    </>
  );
}
export function ModeControls({
  mode,
  change,
}: {
  mode: PresentationMode;
  change(mode: PresentationMode): void;
}) {
  return (
    <>
      <nav className="modes" aria-label="Presentation mode">
        {(["following", "exploring", "paused"] as const).map((value) => (
          <button
            key={value}
            data-mode={value}
            aria-pressed={value === mode}
            onClick={() => change(value)}
          >
            {value[0].toUpperCase() + value.slice(1)}
          </button>
        ))}
      </nav>
      <p id="mode-help" className="muted">
        {
          {
            following: "Following the current beat.",
            exploring: "Explore freely. Your editor stays where you leave it.",
            paused: "Presentation paused. Resume with Following.",
          }[mode]
        }
      </p>
    </>
  );
}
