import type {
  DecorationRenderOptions,
  DecorationOptions,
  TextEditor,
  MarkdownString,
} from "vscode";
import type { PresenterApi } from "./native.js";
import type { LineRange } from "../shared/tour.js";
import type { PresentationMode } from "../shared/snapshot.js";
export type PaintEditor = Pick<TextEditor, "setDecorations"> & {
  document: Pick<TextEditor["document"], "lineCount" | "lineAt">;
};
export interface PaintState {
  state: PresentationMode | "stale";
  context?: LineRange[];
  focus?: LineRange[];
  hover?: MarkdownString;
  showLabels?: boolean;
  label?: string;
  removedLines?: number[];
  seams?: { line: number; hover?: MarkdownString; label: string }[];
}
export type Presenter = ReturnType<typeof createPresenter>;

// Decorations are owned by one activation, never by an individual editor.
function createPresenter(vscode: PresenterApi, color?: number) {
  const theme = (name: string) =>
    color
      ? name === "labelBackground" || name === "labelForeground"
        ? `kanko.anchor${color}.${name}`
        : `kanko.anchor${color}`
      : `kanko.presenter${name[0].toUpperCase()}${name.slice(1)}`;
  const tc = (id: string) => new vscode.ThemeColor(id);
  const type = (options: DecorationRenderOptions) =>
    vscode.window.createTextEditorDecorationType(options);
  const border = (width: string, color = theme("focus"), style = "solid") =>
    type({
      isWholeLine: true,
      borderStyle: style,
      borderColor: tc(color),
      borderWidth: width,
    });
  const rail = (style: string) =>
    type({
      isWholeLine: true,
      borderStyle: style,
      borderColor: tc(theme("rail")),
      borderWidth: "0 0 0 3px",
      overviewRulerColor: tc(theme("rail")),
      overviewRulerLane: vscode.OverviewRulerLane.Left,
    });
  const types = {
    rail: rail("solid"),
    railStale: rail("dashed"),
    dim: type({ opacity: "0.45" }),
    boxTop: border("1px 1px 0 1px"),
    boxMid: border("0 1px 0 1px"),
    boxBot: border("0 1px 1px 1px"),
    boxOne: border("1px"),
    label: type({
      after: {
        margin: "0 0 0 2em",
        color: tc(theme("labelForeground")),
        backgroundColor: tc(theme("labelBackground")),
      },
    }),
    seam: border("2px 0 0 0", theme("seam"), "dashed"),
    // Per-range renderOptions cannot change borders; EOF needs its own type.
    seamBottom: border("0 0 2px 0", theme("seam"), "dashed"),
    companionRemoved: type({
      isWholeLine: true,
      backgroundColor: tc("diffEditor.removedLineBackground"),
    }),
  };
  let opacity = 0.45;
  function configure(value: number) {
    const next = Math.min(
      1,
      Math.max(0.2, Number.isFinite(value) ? value : 0.45),
    );
    if (opacity === next) return;
    types.dim.dispose();
    types.dim = type({ opacity: String(next) });
    opacity = next;
  }
  const line = (n: number) => new vscode.Range(n, 0, n, 0);
  const lines = (range: LineRange, count: number) =>
    Array.from(
      {
        length: Math.max(
          0,
          Math.min(count, range.endLine) - Math.max(1, range.startLine) + 1,
        ),
      },
      (_, i) => Math.max(1, range.startLine) - 1 + i,
    );
  function clear(editor: PaintEditor) {
    for (const t of Object.values(types)) editor.setDecorations(t, []);
  }
  function paint(editor: PaintEditor, presentation: PaintState) {
    clear(editor);
    const count = editor.document.lineCount;
    const contexts = [
      ...new Set(
        (presentation.context || []).flatMap((range) => lines(range, count)),
      ),
    ];
    const stale = presentation.state === "stale";
    editor.setDecorations(
      stale ? types.railStale : types.rail,
      contexts.map(line),
    );
    const focus = stale
      ? []
      : (presentation.focus || []).filter(
          (range) => range.startLine >= 1 && range.endLine <= count,
        );
    const buckets: Record<
      "boxTop" | "boxMid" | "boxBot" | "boxOne",
      DecorationOptions[]
    > = { boxTop: [], boxMid: [], boxBot: [], boxOne: [] };
    for (const range of focus) {
      const ns = lines(range, count);
      for (let i = 0; i < ns.length; i++) {
        const name =
          ns.length === 1
            ? "boxOne"
            : i === 0
              ? "boxTop"
              : i === ns.length - 1
                ? "boxBot"
                : "boxMid";
        buckets[name].push({
          range: line(ns[i]),
          hoverMessage: presentation.hover,
        });
      }
    }
    for (const name of ["boxTop", "boxMid", "boxBot", "boxOne"] as const)
      editor.setDecorations(types[name], buckets[name]);
    if (presentation.state === "following" && focus.length && opacity < 1) {
      editor.setDecorations(
        types.dim,
        contexts
          .filter(
            (n) =>
              !focus.some(
                (range) => n >= range.startLine - 1 && n < range.endLine,
              ),
          )
          .map(
            (n) =>
              new vscode.Range(n, 0, n, editor.document.lineAt(n).text.length),
          ),
      );
    }
    const labels: DecorationOptions[] = [];
    const candidates = focus.length
      ? lines(focus[0], count).slice(0, 3)
      : stale || presentation.label
        ? contexts.slice(0, 3)
        : [];
    if (
      candidates.length &&
      (stale ||
        (presentation.showLabels !== false &&
          presentation.state !== "exploring" &&
          presentation.label))
    ) {
      const n = candidates.reduce((best, n) =>
        editor.document.lineAt(n).text.length <
        editor.document.lineAt(best).text.length
          ? n
          : best,
      );
      labels.push({
        range: line(n),
        renderOptions: {
          after: {
            contentText: `\u2002${stale ? "Stale" : presentation.label}\u2002`,
          },
        },
      });
    }
    if (!stale) {
      const top: DecorationOptions[] = [],
        bottom: DecorationOptions[] = [];
      for (const seam of presentation.seams || []) {
        const n = Math.max(0, Math.min(count - 1, seam.line));
        const deco = { range: line(n), hoverMessage: seam.hover };
        (seam.line >= count ? bottom : top).push(deco);
        if (
          presentation.showLabels !== false &&
          presentation.state !== "exploring"
        )
          labels.push({
            range: deco.range,
            renderOptions: {
              after: { contentText: `\u2002${seam.label}\u2002` },
            },
          });
      }
      editor.setDecorations(types.seam, top);
      editor.setDecorations(types.seamBottom, bottom);
      editor.setDecorations(
        types.companionRemoved,
        (presentation.removedLines || [])
          .filter((n) => n >= 0 && n < count)
          .map(line),
      );
    }
    editor.setDecorations(types.label, labels);
  }
  return {
    types,
    configure,
    clear,
    paint,
    dispose() {
      for (const t of Object.values(types)) t.dispose();
    },
  };
}

export { createPresenter };
