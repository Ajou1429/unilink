/** One-time compatibility cleanup for the retired browser-only feature.
 * Match exact legacy/namespaced keys; never clear an account's other data. */
export function removeRetiredCommunityData(storage: Storage) {
  const prefix = "(?:unilink:private:(?:guest|demo|user:[^:]+):)?";
  const retired = new RegExp(`^${prefix}unilink:(community-v2|posts|comments)$`);
  const settings = new RegExp(`^${prefix}unilink:notification-settings$`);
  const notifications = new RegExp(`^${prefix}unilink:app-notifications$`);
  const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index)).filter((key): key is string => key !== null);
  for (const key of keys) {
    if (retired.test(key)) { storage.removeItem(key); continue; }
    if (!settings.test(key) && !notifications.test(key)) continue;
    try {
      const raw = storage.getItem(key);
      if (!raw) continue;
      const value = JSON.parse(raw);
      if (settings.test(key) && value && typeof value === "object" && !Array.isArray(value) && "community" in value) {
        delete value.community;
        storage.setItem(key, JSON.stringify(value));
      } else if (notifications.test(key) && Array.isArray(value)) {
        const retained = value.filter((item) => item?.type !== "community" &&
          !(typeof item?.href === "string" && /^\/(?:unilink\/)?community(?:[/?#]|$)/.test(item.href)));
        if (retained.length !== value.length) storage.setItem(key, JSON.stringify(retained));
      }
    } catch { /* Preserve malformed unrelated settings rather than erase them. */ }
  }
}
