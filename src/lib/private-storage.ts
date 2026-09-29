/** Account namespaces prevent accidental cross-account reads, not access by a
 * person with browser/devtools access. Never store server credentials here. */
let userId: string | null = null;
export const PRIVATE_STORAGE_CHANGED_EVENT = "unilink:privateStorageChanged";
export function setStorageUser(id: string | null) { userId = id; }
export function getStorageUser() { return userId; }
export function privateStorageKey(key: string) {
  return `unilink:private:${userId ? "user:" + encodeURIComponent(userId) : "guest"}:${key}`;
}
function storage() {
  // A signed-out demo is tab-local; it never reads account or legacy data.
  return userId ? window.localStorage : window.sessionStorage;
}
function changedRecordIds(previousValue: string | null, nextValue: string | null) {
  try {
    const previous = previousValue ? JSON.parse(previousValue) : [];
    const next = nextValue ? JSON.parse(nextValue) : [];
    if (!Array.isArray(previous) && !Array.isArray(next)) return null;
    const before = new Map((Array.isArray(previous) ? previous : []).filter((row) => row?.id != null).map((row) => [String(row.id), JSON.stringify(row)]));
    const after = new Map((Array.isArray(next) ? next : []).filter((row) => row?.id != null).map((row) => [String(row.id), JSON.stringify(row)]));
    const all = new Set([...before.keys(), ...after.keys()]);
    const changed: string[] = [];
    const removed: string[] = [];
    for (const id of all) {
      if (!after.has(id)) removed.push(id);
      else if (before.get(id) !== after.get(id)) changed.push(id);
    }
    return { changedIds: changed, deletedIds: removed };
  } catch { return null; }
}
export const privateStorage = {
  getItem(key: string): string | null {
    if (typeof window === "undefined") return null;
    return storage().getItem(privateStorageKey(key));
  },
  setItem(key: string, value: string) {
    if (typeof window !== "undefined") {
      const target = storage();
      const storageKey = privateStorageKey(key);
      const previousValue = target.getItem(storageKey);
      target.setItem(storageKey, value);
      if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent(PRIVATE_STORAGE_CHANGED_EVENT, { detail: { key, userId, ...changedRecordIds(previousValue, value) } }));
      }
    }
  },
  removeItem(key: string) {
    if (typeof window !== "undefined") {
      const target = storage();
      const storageKey = privateStorageKey(key);
      const previousValue = target.getItem(storageKey);
      target.removeItem(storageKey);
      if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(new CustomEvent(PRIVATE_STORAGE_CHANGED_EVENT, { detail: { key, userId, ...changedRecordIds(previousValue, null) } }));
      }
    }
  },
};
