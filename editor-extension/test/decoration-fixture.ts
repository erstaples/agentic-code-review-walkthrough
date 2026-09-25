import type { DecorationRenderOptions, TextEditorDecorationType } from "vscode";
import type { PresenterApi } from "../src/host/native.js";
import { present } from "../../test/assertions.js";

export function decorationFixture() {
  const created: Decoration[] = [];
  interface Decoration extends TextEditorDecorationType {
    options: DecorationRenderOptions;
    disposed: boolean;
  }
  const api = {
    ThemeColor: class {
      constructor(readonly id: string) {}
    },
    Range: class {
      readonly start: { line: number; character: number };
      readonly end: { line: number; character: number };
      constructor(
        start: number,
        character: number,
        end: number,
        endCharacter: number,
      ) {
        this.start = { line: start, character };
        this.end = { line: end, character: endCharacter };
      }
    },
    OverviewRulerLane: { Left: 1 },
    window: {
      createTextEditorDecorationType(
        options: DecorationRenderOptions,
      ): Decoration {
        const decoration = {
          key: `decoration-${created.length}`,
          options,
          disposed: false,
          dispose() {
            this.disposed = true;
          },
        };
        created.push(decoration);
        return decoration;
      },
    },
  } as unknown as PresenterApi;
  const decoration = (type: TextEditorDecorationType) =>
    present(created.find((value) => value === type));
  return { api, created, decoration };
}
