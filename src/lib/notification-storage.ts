export const APP_NOTIFICATIONS_STORAGE_KEY = "unilink:app-notifications";
export const APP_NOTIFICATIONS_CHANGED_EVENT = "unilink:appNotificationsChanged";

export interface AppNotification {
  id: string;
  type: "community" | "deadline";
  title: string;
  body: string;
  href: string;
  read: boolean;
  createdAt: string;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeNotifications(notifications: AppNotification[]) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    APP_NOTIFICATIONS_STORAGE_KEY,
    JSON.stringify(notifications.slice(0, 80)),
  );
  window.dispatchEvent(new Event(APP_NOTIFICATIONS_CHANGED_EVENT));
}

export function getAppNotifications(): AppNotification[] {
  return readJson<AppNotification[]>(APP_NOTIFICATIONS_STORAGE_KEY, []).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function upsertAppNotification(notification: AppNotification) {
  const notifications = getAppNotifications();
  const exists = notifications.some((item) => item.id === notification.id);
  const nextNotifications = exists
    ? notifications.map((item) =>
        item.id === notification.id ? { ...item, ...notification } : item,
      )
    : [notification, ...notifications];

  writeNotifications(nextNotifications);
}

export function markAppNotificationRead(id: string) {
  const notifications = getAppNotifications();
  const nextNotifications = notifications.map((item) =>
    item.id === id ? { ...item, read: true } : item,
  );

  writeNotifications(nextNotifications);
}
