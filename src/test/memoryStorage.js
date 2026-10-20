// In-memory Web Storage for tests (Node 25's built-in localStorage global is a
// stub without --localstorage-file and shadows jsdom's).
export function memoryStorage() {
  const m = new Map()
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)) },
    removeItem: k => { m.delete(k) },
    clear: () => m.clear(),
    key: i => [...m.keys()][i] ?? null,
    get length() { return m.size },
  }
}
