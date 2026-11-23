// A browser's local storage, held in memory for the stand-in page (fake-dom.js): test support only.

/** A Storage held in memory, as a browser's local storage is. */
export function fakeStorage() {
  const kept = new Map();
  return {
    get length() {
      return kept.size;
    },
    key: (i) => [...kept.keys()][i] ?? null,
    getItem: (k) => (kept.has(k) ? kept.get(k) : null),
    setItem: (k, v) => void kept.set(k, String(v)),
    removeItem: (k) => void kept.delete(k),
    clear: () => kept.clear(),
  };
}
