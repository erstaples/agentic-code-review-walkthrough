"use strict";
const { createHash } = require("node:crypto");
const { SHAPES } = require("./layout-model.js");
const roles = new Set(["change", "evidence", "callee", "caller", "config", "schema", "context"]);
const slots = new Set(Object.values(SHAPES).flatMap(s => s.slots));
function digest(value) {
  const stable = v => Array.isArray(v) ? v.map(stable) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map(k => [k, stable(v[k])])) : v;
  return createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");
}
const stopIdentity = (state, stop) => digest({ identity: state.identity, anchors: stop.anchors, beats: stop.beats });
function validLayout(value, cap) {
  let leaves = 0;
  function node(n, depth = 0) {
    if (!n || typeof n !== "object" || depth > 4 || (n.size !== undefined && (!Number.isFinite(n.size) || n.size <= 0))) return false;
    if (!n.groups) { leaves++; return true; }
    return Array.isArray(n.groups) && n.groups.length > 0 && n.groups.length <= 4 && (n.orientation === undefined || [0, 1].includes(n.orientation)) && n.groups.every(g => node(g, depth + 1));
  }
  return node(value) && leaves > 0 && leaves <= cap ? leaves : 0;
}
function compatible(saved, state, stop, cap) {
  const count = saved && validLayout(saved.layout, cap);
  const numbers = new Set(stop.anchors.map(a => a.n)), used = new Set();
  return Boolean(count && saved.identity === stopIdentity(state, stop) && Array.isArray(saved.slots) && saved.slots.length === count &&
    ["customized", "sequence", "override"].every(k => typeof saved[k] === "boolean") && saved.slots.every(s => {
      if (!s || typeof s.pinned !== "boolean" || !Number.isFinite(s.lastActive)) return false;
      if (s.anchor === null) return !s.pinned;
      if (!numbers.has(s.anchor) || used.has(s.anchor)) return false;
      used.add(s.anchor); return true;
    }));
}
// VS Code's profile-local globalState lives outside the reviewed repository.
// Save semantic anchor numbers, never executable commands, URIs or tab ownership.
function createLayoutState(memento) {
  return {
    read(state) {
      const value = memento?.get(`kanko.layout.${digest([state.workspace, state.tourId])}`);
      const preferences = Object.fromEntries(Object.entries(value?.version === 1 ? value.preferences || {} : {}).filter(([role, p]) => roles.has(role) && p?.kind === "replace" && slots.has(p.slot)));
      return { preferences, layouts: value?.version === 1 && value.identity === state.identity && value.layouts && typeof value.layouts === "object" ? structuredClone(value.layouts) : {} };
    },
    async write(state, value) {
      await memento?.update(`kanko.layout.${digest([state.workspace, state.tourId])}`, { version: 1, identity: state.identity, ...structuredClone(value) });
    },
  };
}
module.exports = { createLayoutState, stopIdentity, compatible, validLayout };
