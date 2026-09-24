"use strict";
const { createPresenter } = require("./presenter.js");
const { colorIndex } = require("./narration.js");
function createDecorationRegistry(vscode) {
  const sets = new Map();
  let opacity = 0.45;
  return {
    forAnchor(n) { const color = colorIndex(n); if (!sets.has(color)) { const presenter = createPresenter(vscode, color); presenter.configure(opacity); sets.set(color, presenter); } return sets.get(color); },
    configure(value) { opacity = value; for (const set of sets.values()) set.configure(value); },
    clear(editor) { for (const set of sets.values()) set.clear(editor); },
    dispose() { for (const set of sets.values()) set.dispose(); sets.clear(); },
  };
}
module.exports = { createDecorationRegistry };
