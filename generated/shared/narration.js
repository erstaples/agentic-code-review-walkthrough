// Generated from TypeScript. Run npm run runtime:build in editor-extension.
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.colorIndex =
  exports.filename =
  exports.anchorNumber =
  exports.escapeHtml =
    void 0;
exports.citation = citation;
exports.renderNarration = renderNarration;
const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
exports.escapeHtml = escapeHtml;
const anchorNumber = (n) =>
  n <= 20 ? String.fromCodePoint(0x2460 + n - 1) : `(${n})`;
exports.anchorNumber = anchorNumber;
const filename = (path) => path.slice(path.lastIndexOf("/") + 1);
exports.filename = filename;
const colorIndex = (n) => ((n - 1) % 6) + 1;
exports.colorIndex = colorIndex;
function citation(anchor, surface) {
  const range = anchor.context;
  if (surface === "terminal")
    return `${anchorNumber(anchor.n)} ${filename(anchor.path)}:${range.startLine}`;
  const revision =
    anchor.rev[
      anchor.side ||
        (anchor.view === "base" || anchor.change === "deleted"
          ? "base"
          : "head")
    ];
  return `${anchorNumber(anchor.n)} ${anchor.path}:${range.startLine}–${range.endLine} @${revision.startsWith("WORKTREE:") ? revision : revision.slice(0, 7)}`;
}
function inlineMarkdown(text) {
  // Deliberately small Markdown subset. Raw HTML, links, images and command
  // URIs remain inert text; only extension-owned chips can post actions.
  return escapeHtml(text)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
}
function renderNarration(text, anchors, surface = "terminal") {
  if (!["terminal", "sidebar", "receipt"].includes(surface))
    throw new Error("unknown narration surface");
  const parts = text.split(/(\{\{a:[1-9]\d*\}\})/g);
  return parts
    .map((part) => {
      const match = /^\{\{a:(\d+)\}\}$/.exec(part);
      if (!match) return surface === "sidebar" ? inlineMarkdown(part) : part;
      const anchor = anchors.find((a) => a.n === Number(match[1]));
      if (!anchor) throw new Error(`Unknown anchor ${match[1]}`);
      if (surface !== "sidebar") return citation(anchor, surface);
      const title = `${anchor.path}:${anchor.context.startLine}–${anchor.context.endLine} · ${anchor.label}`;
      return `<button class="chip color-${colorIndex(anchor.n)}" data-anchor="${anchor.n}" title="${escapeHtml(title)}" aria-label="${escapeHtml(`Open anchor ${anchor.n}: ${title}`)}">${anchor.n}</button>`;
    })
    .join("");
}
