// Mimics Claude's window.storage API using localStorage, so the app runs
// standalone in a real browser. If you've configured Supabase (see
// SETUP_REAL_BACKEND.md), the app uses that as the primary backend instead —
// this polyfill is only the fallback path.
window.storage = {
  async get(key, shared) {
    const k = (shared ? "shared:" : "personal:") + key;
    const raw = localStorage.getItem(k);
    if (raw === null) throw new Error("Key not found");
    return { key, value: raw, shared: !!shared };
  },
  async set(key, value, shared) {
    const k = (shared ? "shared:" : "personal:") + key;
    localStorage.setItem(k, value);
    return { key, value, shared: !!shared };
  },
  async delete(key, shared) {
    const k = (shared ? "shared:" : "personal:") + key;
    localStorage.removeItem(k);
    return { key, deleted: true, shared: !!shared };
  },
  async list(prefix, shared) {
    const p = (shared ? "shared:" : "personal:") + (prefix || "");
    const keys = Object.keys(localStorage)
      .filter((k) => k.startsWith(p))
      .map((k) => k.slice((shared ? "shared:" : "personal:").length));
    return { keys, prefix, shared: !!shared };
  },
};
