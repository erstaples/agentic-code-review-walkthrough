"use strict";
// Shared by the webview and contract tests. It contains no DOM or editor actions.
(function (root) {
  const roles = { change: "Changes", evidence: "Evidence", caller: "Callers", callee: "Callees", config: "Config", schema: "Schema", context: "Context" };
  const position = slot => slot ? slot.replace(/([A-Z])/g, " $1").toLowerCase().replace(/^group/, "group ") : "";
  function rows(snapshot) {
    const states = snapshot.presentation?.anchors || [], layout = snapshot.presentation?.layout || {};
    return snapshot.stop.anchors.map(a => {
      const state = states.find(s => s.n === a.n) || {}, slot = layout.slots?.find(s => s.anchor === a.n);
      return { ...a, filename: a.path.split("/").at(-1), directory: a.path.split("/").slice(0, -1).join("/") || ".",
        active: snapshot.beat.active.includes(a.n), status: state.status || "not-open", slot: position(slot?.slot),
        pinned: !!slot?.pinned, options: layout.options?.[a.n] || [], remembered: layout.preferences?.[a.role] };
    });
  }
  function entries(rows, { filter = "", order = "role", collapsed = {} } = {}) {
    const query = filter.toLowerCase().trim();
    const found = rows.filter(r => `${r.n} ${r.path} ${r.label} ${r.role}`.toLowerCase().includes(query));
    if (rows.length < 5 || order === "order") return found.map(row => ({ type: "row", row, showRoleIcon: true, height: 68 }));
    const groups = [["view", "In view", found.filter(r => r.slot)], ...Object.entries(roles).map(([role, label]) => [role, label, found.filter(r => !r.slot && r.role === role)])];
    return groups.flatMap(([key, label, members]) => {
      if (!members.length) return [];
      const closed = !query && (collapsed[key] ?? (rows.length >= 12 && key !== "view" && !members.some(r => r.active)));
      return [{ type: "section", key, label, count: members.length, closed, height: 28 }, ...closed ? [] : members.map(row => ({ type: "row", row, showRoleIcon: key === "view", height: 68 }))];
    });
  }
  // Fixed row heights let 99-anchor stops render only the viewport plus a small
  // overscan. Spacers preserve scroll geometry; numbers remain global identities.
  function windowed(entries, scrollTop, height) {
    let top = 0; const positioned = entries.map(entry => { const value = { ...entry, top }; top += entry.height; return value; });
    const visible = positioned.filter(e => e.top + e.height >= scrollTop - 136 && e.top <= scrollTop + height + 136);
    return { visible, before: visible[0]?.top || 0, after: visible.length ? top - visible.at(-1).top - visible.at(-1).height : top, total: top };
  }
  const api = { roles, position, rows, entries, windowed };
  if (typeof module !== "undefined") module.exports = api; else root.SidebarModel = api;
})(typeof globalThis === "undefined" ? this : globalThis);
