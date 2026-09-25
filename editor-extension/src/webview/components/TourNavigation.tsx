import type { LoadedTourSnapshot } from "../../shared/snapshot.js";
import type { NavigationAction } from "../../shared/messages.js";
export function TourNavigation({
  snapshot: s,
  navigate,
  end,
}: {
  snapshot: LoadedTourSnapshot;
  navigate(action: NavigationAction): void;
  end(): void;
}) {
  return (
    <>
      <div className="navigation">
        <button
          id="previous-beat"
          data-action="previousBeat"
          disabled={s.stopIndex === 0 && s.beatIndex === 0}
          onClick={() => navigate("previousBeat")}
        >
          ← Previous beat
        </button>
        <button
          id="next-beat"
          data-action="nextBeat"
          disabled={
            s.stopIndex === s.stopCount - 1 && s.beatIndex === s.beatCount - 1
          }
          onClick={() => navigate("nextBeat")}
        >
          Next beat →
        </button>
      </div>
      <div className="navigation stops">
        <button
          id="previous-stop"
          data-action="previousStop"
          disabled={s.stopIndex === 0}
          onClick={() => navigate("previousStop")}
        >
          Previous stop
        </button>
        <button
          id="next-stop"
          data-action="nextStop"
          disabled={s.stopIndex === s.stopCount - 1}
          onClick={() => navigate("nextStop")}
        >
          Next stop
        </button>
      </div>
      <button id="end-tour" className="end" onClick={end}>
        End tour
      </button>
    </>
  );
}
