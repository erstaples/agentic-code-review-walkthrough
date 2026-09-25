import type { ErrorCode } from "../shared/tour.js";
import type { TourSnapshot, PresentationSnapshot } from "../shared/snapshot.js";
import type { PreparedTour, TourState } from "./state.js";
import { request, isRecord } from "./requests.js";
export interface ControllerDependencies {
  prepare(body: unknown): PreparedTour | PromiseLike<PreparedTour>;
  present(
    state: TourState,
    options: { focus: boolean },
  ): PromiseLike<PresentationSnapshot>;
  clear(): PromiseLike<void>;
  publish(snapshot: TourSnapshot): unknown;
  layoutAction(
    body: Record<string, unknown>,
    state: TourState,
  ): PromiseLike<PresentationSnapshot>;
}
export type TourController = ReturnType<typeof createTourController>;

import { renderNarration } from "../../lib/narration.js";
const fail = (code: ErrorCode, message: string, details?: unknown) =>
  Object.assign(new Error(message), { code, details });

// Serialize changes so failed requests leave the current tour intact.
function createTourController({
  prepare,
  present,
  clear,
  publish,
  layoutAction,
}: ControllerDependencies) {
  let current: TourState | null = null,
    revision = 0;
  let queue: Promise<unknown> = Promise.resolve();
  function snapshot(state = current): TourSnapshot {
    if (!state) return { revision, loaded: false };
    const stop = state.plan.stops[state.stopIndex],
      beat = stop.beats[state.beatIndex];
    return structuredClone({
      revision,
      loaded: true,
      tourId: state.tourId,
      planId: state.plan.id,
      title: state.plan.title,
      mode: state.mode,
      stopIndex: state.stopIndex,
      beatIndex: state.beatIndex,
      stopCount: state.plan.stops.length,
      beatCount: stop.beats.length,
      stop,
      beat,
      selectedAnchor: state.selectedAnchor,
      findings: state.findings,
      presentation: state.presentation ?? { anchors: [] },
      narrationHtml: renderNarration(beat.narration, stop.anchors, "sidebar"),
      narration: renderNarration(beat.narration, stop.anchors, "terminal"),
      receiptNarration: renderNarration(
        beat.narration,
        stop.anchors,
        "receipt",
      ),
    });
  }
  function run<T>(action: () => Promise<T>): Promise<T> {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
  }
  function guard(expected: unknown): TourState {
    if (!current) throw fail("no_tour", "Load a tour first.");
    if (expected !== undefined && expected !== revision)
      throw fail(
        "stale_presentation",
        "The tour changed; use the latest snapshot.",
      );
    return current;
  }
  async function commit(next: TourState, { focus = false } = {}) {
    next.presentation = await present(next, { focus });
    current = next;
    revision++;
    const value = snapshot();
    publish(value);
    return value;
  }
  return {
    snapshot,
    updatePresentation: (
      read: () => PromiseLike<PresentationSnapshot> | PresentationSnapshot,
    ) =>
      run(async () => {
        if (!current) return;
        const presentation = await read();
        if (
          JSON.stringify(presentation) === JSON.stringify(current.presentation)
        )
          return;
        current = { ...current, presentation };
        revision++;
        publish(snapshot());
      }),
    load: (body: unknown) =>
      run(async () => {
        const validated = await prepare(body);
        const first = validated.plan.stops[0].beats[0];
        return commit({
          ...validated,
          stopIndex: 0,
          beatIndex: 0,
          mode: "following",
          selectedAnchor: first.active[0] || null,
        });
      }),
    navigate: (input: unknown) =>
      run(async () => {
        const body = request(input);
        const next = { ...guard(body.expectedRevision) };
        const stops = next.plan.stops;
        switch (body.action) {
          case "nextBeat":
            if (next.beatIndex + 1 < stops[next.stopIndex].beats.length)
              next.beatIndex++;
            else if (next.stopIndex + 1 < stops.length) {
              next.stopIndex++;
              next.beatIndex = 0;
            } else
              throw fail("navigation_boundary", "Already at the last beat.");
            break;
          case "previousBeat":
            if (next.beatIndex > 0) next.beatIndex--;
            else if (next.stopIndex > 0) {
              next.stopIndex--;
              next.beatIndex = stops[next.stopIndex].beats.length - 1;
            } else
              throw fail("navigation_boundary", "Already at the first beat.");
            break;
          case "nextStop":
            if (++next.stopIndex >= stops.length)
              throw fail("navigation_boundary", "Already at the last stop.");
            next.beatIndex = 0;
            break;
          case "previousStop":
            if (--next.stopIndex < 0)
              throw fail("navigation_boundary", "Already at the first stop.");
            next.beatIndex = 0;
            break;
          case "goto":
            next.stopIndex = stops.findIndex((s) => s.id === body.stopId);
            next.beatIndex =
              stops[next.stopIndex]?.beats.findIndex(
                (b) => b.id === body.beatId,
              ) ?? -1;
            if (next.stopIndex < 0 || next.beatIndex < 0)
              throw fail(
                "bad_request",
                "Choose an existing stopId and beatId.",
              );
            break;
          default:
            throw fail("bad_request", "Unknown navigation action.");
        }
        next.selectedAnchor =
          stops[next.stopIndex].beats[next.beatIndex].active[0] || null;
        return commit(next);
      }),
    setState: (input: unknown) =>
      run(async () => {
        const body = request(input);
        const state = guard(body.expectedRevision);
        if (
          body.mode !== "following" &&
          body.mode !== "exploring" &&
          body.mode !== "paused"
        )
          throw fail(
            "bad_request",
            "Mode must be following, exploring, or paused.",
          );
        return commit({ ...state, mode: body.mode });
      }),
    focus: (input: unknown) =>
      run(async () => {
        const body = request(input);
        const state = guard(body.expectedRevision);
        if (
          typeof body.anchor !== "number" ||
          !state.plan.stops[state.stopIndex].anchors.some(
            (a) => a.n === body.anchor,
          )
        )
          throw fail("bad_request", "Choose an anchor from the current stop.");
        return commit(
          { ...state, selectedAnchor: body.anchor },
          { focus: true },
        );
      }),
    layout: (input: unknown) =>
      run(async () => {
        const body = request(input);
        const state = guard(body.expectedRevision);
        if (state.mode === "paused")
          throw fail(
            "bad_request",
            "Resume the tour before changing its layout.",
          );
        const presentation = await layoutAction(body, state);
        current = {
          ...state,
          presentation,
          selectedAnchor:
            body.action === "place" &&
            isRecord(body.placement) &&
            body.placement.kind !== "peek" &&
            typeof body.anchor === "number"
              ? body.anchor
              : state.selectedAnchor,
        };
        revision++;
        const value = snapshot();
        publish(value);
        return value;
      }),
    clear: () =>
      run(async () => {
        await clear();
        current = null;
        revision++;
        const value = snapshot();
        publish(value);
        return value;
      }),
  };
}
export { createTourController };
