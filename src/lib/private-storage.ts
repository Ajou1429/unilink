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
export const privateStorage = {
  getItem(key: string): string | null {
    if (typeof window === "undefined") return null;
    return storage().getItem(privateStorageKey(key));
  },
  setItem(key: string, value: string) {
    if (typeof window !== "undefined") {
      storage().setItem(privateStorageKey(key), value);
      if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(
          new CustomEvent(PRIVATE_STORAGE_CHANGED_EVENT, {
            detail: { key, userId },
          }),
        );
      }
    }
  },
  removeItem(key: string) {
    if (typeof window !== "undefined") {
      storage().removeItem(privateStorageKey(key));
      if (typeof window.dispatchEvent === "function") {
        window.dispatchEvent(
          new CustomEvent(PRIVATE_STORAGE_CHANGED_EVENT, {
            detail: { key, userId },
          }),
        );
      }
    }
  },
};
