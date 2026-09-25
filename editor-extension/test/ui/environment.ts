import { JSDOM } from "jsdom";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  url: "http://localhost",
  pretendToBeVisual: true,
});
for (const key of [
  "window",
  "document",
  "HTMLElement",
  "Element",
  "Node",
  "MutationObserver",
  "getComputedStyle",
])
  Reflect.set(globalThis, key, Reflect.get(dom.window, key));
Object.defineProperty(globalThis, "navigator", {
  value: dom.window.navigator,
  configurable: true,
});
Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
const observers = new Set<ResizeObserver>();
globalThis.ResizeObserver = class {
  observe() {
    observers.add(this);
  }
  unobserve() {}
  disconnect() {
    observers.delete(this);
  }
};
HTMLElement.prototype.scrollIntoView = function () {};
export { dom, observers };
