"use strict";

/** @typedef {import("./contract-types.js").NarrationAnchor} NarrationAnchor */
/** @typedef {import("./contract-types.js").NarrationSurface} NarrationSurface */

/** @param {unknown} value */
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => (/** @type {Record<string, string>} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }))[c]);
/** @param {number} n */
const anchorNumber = (n) => n <= 20 ? String.fromCodePoint(0x2460 + n - 1) : `(${n})`;
/** @param {string} path */
const filename = (path) => path.slice(path.lastIndexOf("/") + 1);
/** Anchor identity colors repeat every six numbers. @param {number} n */
const colorIndex = (n) => ((n - 1) % 6) + 1;
/** @param {NarrationAnchor} anchor @param {"terminal" | "receipt"} surface */
function citation(anchor, surface) {
  const range = anchor.context;
  if (surface === "terminal") return `${anchorNumber(anchor.n)} ${filename(anchor.path)}:${range.startLine}`;
  const revision = anchor.rev[anchor.side || (anchor.view === "base" || anchor.change === "deleted" ? "base" : "head")];
  return `${anchorNumber(anchor.n)} ${anchor.path}:${range.startLine}–${range.endLine} @${revision.startsWith("WORKTREE:") ? revision : revision.slice(0, 7)}`;
}
/** @param {string} text */
function inlineMarkdown(text) {
  // Deliberately small Markdown subset. Raw HTML, links, images and command
  // URIs remain inert text; only extension-owned chips can post actions.
  return escapeHtml(text).replace(/`([^`\n]+)`/g, "<code>$1</code>").replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>").replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
}
/** @param {string} text @param {readonly NarrationAnchor[]} anchors @param {NarrationSurface} [surface] @returns {string} */
function renderNarration(text, anchors, surface = "terminal") {
  if (!["terminal", "sidebar", "receipt"].includes(surface)) throw new Error("unknown narration surface");
  const parts = text.split(/(\{\{a:[1-9]\d*\}\})/g);
  return parts.map((part) => {
    const match = /^\{\{a:(\d+)\}\}$/.exec(part);
    if (!match) return surface === "sidebar" ? inlineMarkdown(part) : part;
    const anchor = anchors.find((a) => a.n === Number(match[1]));
    if (!anchor) throw new Error(`Unknown anchor ${match[1]}`);
    if (surface !== "sidebar") return citation(anchor, surface);
    const title = `${anchor.path}:${anchor.context.startLine}–${anchor.context.endLine} · ${anchor.label}`;
    return `<button class="chip color-${colorIndex(anchor.n)}" data-anchor="${anchor.n}" title="${escapeHtml(title)}" aria-label="${escapeHtml(`Open anchor ${anchor.n}: ${title}`)}">${anchor.n}</button>`;
  }).join("");
}
module.exports = { escapeHtml, anchorNumber, filename, colorIndex, citation, renderNarration };
