"use strict";

// Decorations are owned by one activation, never by an individual editor.
function createPresenter(vscode, color) {
  const theme = name => color ? (name === "labelBackground" || name === "labelForeground" ? `relay.anchor${color}.${name}` : `relay.anchor${color}`) : `relay.presenter${name[0].toUpperCase()}${name.slice(1)}`;
  const tc = (id) => new vscode.ThemeColor(id);
  const type = (options) => vscode.window.createTextEditorDecorationType(options);
  const border = (width, color = theme("focus"), style = "solid") => type({
    isWholeLine: true, borderStyle: style, borderColor: tc(color), borderWidth: width,
  });
  const rail = (style) => type({
    isWholeLine: true, borderStyle: style, borderColor: tc(theme("rail")),
    borderWidth: "0 0 0 3px", overviewRulerColor: tc(theme("rail")),
    overviewRulerLane: vscode.OverviewRulerLane.Left,
  });
  const types = {
    rail: rail("solid"), railStale: rail("dashed"),
    dim: type({ opacity: "0.45" }),
    boxTop: border("1px 1px 0 1px"), boxMid: border("0 1px 0 1px"),
    boxBot: border("0 1px 1px 1px"), boxOne: border("1px"),
    label: type({ after: { margin: "0 0 0 2em", color: tc(theme("labelForeground")), backgroundColor: tc(theme("labelBackground")) } }),
    seam: border("2px 0 0 0", theme("seam"), "dashed"),
    // Per-range renderOptions cannot change borders; EOF needs its own type.
    seamBottom: border("0 0 2px 0", theme("seam"), "dashed"),
    companionRemoved: type({ isWholeLine: true, backgroundColor: tc("diffEditor.removedLineBackground") }),
  };
  let opacity = 0.45;
  function configure(value) {
    const next = Math.min(1, Math.max(0.2, Number.isFinite(value) ? value : 0.45));
    if (opacity === next) return;
    types.dim.dispose();
    types.dim = type({ opacity: String(next) });
    opacity = next;
  }
  const line = (n) => new vscode.Range(n, 0, n, 0);
  const lines = (r, count) => Array.from({ length: Math.max(0, Math.min(count, r.endLine) - Math.max(1, r.startLine) + 1) }, (_, i) => Math.max(1, r.startLine) - 1 + i);
  function clear(editor) { for (const t of Object.values(types)) editor.setDecorations(t, []); }
  function paint(editor, p) {
    clear(editor);
    const count = editor.document.lineCount;
    const contexts = [...new Set((p.context || []).flatMap((r) => lines(r, count)))];
    const stale = p.state === "stale";
    editor.setDecorations(stale ? types.railStale : types.rail, contexts.map(line));
    const focus = stale ? [] : (p.focus || []).filter((r) => r.startLine >= 1 && r.endLine <= count);
    const buckets = { boxTop: [], boxMid: [], boxBot: [], boxOne: [] };
    for (const r of focus) {
      const ns = lines(r, count);
      for (let i = 0; i < ns.length; i++) {
        const name = ns.length === 1 ? "boxOne" : i === 0 ? "boxTop" : i === ns.length - 1 ? "boxBot" : "boxMid";
        buckets[name].push({ range: line(ns[i]), hoverMessage: p.hover });
      }
    }
    for (const [name, ranges] of Object.entries(buckets)) editor.setDecorations(types[name], ranges);
    if (p.state === "following" && focus.length && opacity < 1) {
      editor.setDecorations(types.dim, contexts.filter((n) => !focus.some((r) => n >= r.startLine - 1 && n < r.endLine))
        .map((n) => new vscode.Range(n, 0, n, editor.document.lineAt(n).text.length)));
    }
    const labels = [];
    const candidates = focus.length ? lines(focus[0], count).slice(0, 3) : (stale || p.label) ? contexts.slice(0, 3) : [];
    if (candidates.length && (stale || (p.showLabels !== false && p.state !== "exploring" && p.label))) {
      const n = candidates.reduce((best, n) => editor.document.lineAt(n).text.length < editor.document.lineAt(best).text.length ? n : best);
      labels.push({ range: line(n), renderOptions: { after: { contentText: `\u2002${stale ? "Stale" : p.label}\u2002` } } });
    }
    if (!stale) {
      const top = [], bottom = [];
      for (const seam of p.seams || []) {
        const n = Math.max(0, Math.min(count - 1, seam.line));
        const deco = { range: line(n), hoverMessage: seam.hover };
        (seam.line >= count ? bottom : top).push(deco);
        if (p.showLabels !== false && p.state !== "exploring") labels.push({ range: deco.range, renderOptions: { after: { contentText: `\u2002${seam.label}\u2002` } } });
      }
      editor.setDecorations(types.seam, top);
      editor.setDecorations(types.seamBottom, bottom);
      editor.setDecorations(types.companionRemoved, (p.removedLines || []).filter((n) => n >= 0 && n < count).map(line));
    }
    editor.setDecorations(types.label, labels);
  }
  return { types, configure, clear, paint, dispose() { for (const t of Object.values(types)) t.dispose(); } };
}

module.exports = { createPresenter };
