// Minimal in-memory localStorage polyfill installed BEFORE any test module
// imports store.js (which reads localStorage at import time in LOCAL MODE).
if (typeof globalThis.localStorage === "undefined") {
  const store = new Map();
  globalThis.localStorage = {
    getItem(k) {
      return store.has(k) ? store.get(k) : null;
    },
    setItem(k, v) {
      store.set(k, String(v));
    },
    removeItem(k) {
      store.delete(k);
    },
    clear() {
      store.clear();
    },
    key(i) {
      return Array.from(store.keys())[i] ?? null;
    },
    get length() {
      return store.size;
    },
  };
}
