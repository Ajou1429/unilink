export const NOTIFICATION_SETTINGS_STORAGE_KEY = "unilink:notification-settings";
export const NOTIFICATION_SETTINGS_CHANGED_EVENT =
  "unilink:notificationSettingsChanged";

export interface NotificationSettings {
  community: boolean;
  deadline: boolean;
}

const defaultSettings: NotificationSettings = {
  community: false,
  deadline: false,
};

export function getNotificationSettings(): NotificationSettings {
  if (typeof window === "undefined") return defaultSettings;

  try {
    const raw = window.localStorage.getItem(NOTIFICATION_SETTINGS_STORAGE_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<NotificationSettings>;

    return {
      community: Boolean(parsed.community),
      deadline: Boolean(parsed.deadline),
    };
  } catch {
    return defaultSettings;
  }
}

export function saveNotificationSettings(settings: NotificationSettings) {
  if (typeof window === "undefined") return;

  window.localStorage.setItem(
    NOTIFICATION_SETTINGS_STORAGE_KEY,
    JSON.stringify(settings),
  );
  window.dispatchEvent(new Event(NOTIFICATION_SETTINGS_CHANGED_EVENT));
}
