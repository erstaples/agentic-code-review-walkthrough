import type * as Code from "vscode";
import { createPresenter } from "../../src/host/presenter.js";
import {
  createTourController,
  type ControllerDependencies,
} from "../../src/host/tour-controller.js";
import type { PreparedTour } from "../../src/host/state.js";
import type { TourSnapshot } from "../../src/shared/snapshot.js";

declare const constructors: Pick<
  typeof Code,
  "Range" | "ThemeColor" | "OverviewRulerLane"
>;

// A presenter fake needs only the API it uses.
createPresenter({
  ...constructors,
  window: {
    createTextEditorDecorationType: () => ({ key: "test", dispose() {} }),
  },
});

export function controllerFake(prepared: PreparedTour) {
  const published: TourSnapshot[] = [];
  const dependencies: ControllerDependencies = {
    prepare: () => prepared,
    present: async () => ({ anchors: [] }),
    clear: async () => {},
    publish: (snapshot) => published.push(snapshot),
    layoutAction: async () => ({ anchors: [] }),
  };
  const controller = createTourController(dependencies);
  // Requests stay unknown until the controller checks them.
  controller.navigate(JSON.parse("{}"));
  return { controller, published };
}

export function invalidDependencies(prepared: PreparedTour) {
  const dependencies: ControllerDependencies = {
    prepare: () => prepared,
    // @ts-expect-error Presentation must describe anchors, not native handles.
    present: async () => ({ tabs: [] }),
    clear: async () => {},
    publish: () => {},
    layoutAction: async () => ({ anchors: [] }),
  };
  return dependencies;
}
