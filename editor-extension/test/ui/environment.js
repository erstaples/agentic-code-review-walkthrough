const { JSDOM } = require('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost', pretendToBeVisual: true });
for (const key of ['window','document','HTMLElement','Element','Node','MutationObserver','getComputedStyle']) globalThis[key] = dom.window[key];
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const observers = new Set();
globalThis.ResizeObserver = class {
  observe() { observers.add(this); }
  disconnect() { observers.delete(this); }
};
HTMLElement.prototype.scrollIntoView = function () {};
module.exports = { dom, observers };
