import type { PresenterApi } from "./native.js";
import type { Presenter, PaintEditor } from "./presenter.js";
import { createPresenter } from "./presenter.js";
import { colorIndex } from "../../lib/narration.js";
function createDecorationRegistry(vscode: PresenterApi) {
  const sets = new Map<number, Presenter>();
  let opacity = 0.45;
  return {
    forAnchor(n: number) {
      const color = colorIndex(n);
      let presenter = sets.get(color);
      if (!presenter) {
        presenter = createPresenter(vscode, color);
        presenter.configure(opacity);
        sets.set(color, presenter);
      }
      return presenter;
    },
    configure(value: number) {
      opacity = value;
      for (const set of sets.values()) set.configure(value);
    },
    clear(editor: PaintEditor) {
      for (const set of sets.values()) set.clear(editor);
    },
    dispose() {
      for (const set of sets.values()) set.dispose();
      sets.clear();
    },
  };
}
export { createDecorationRegistry };
