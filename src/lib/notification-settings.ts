import { privateStorage } from "./private-storage.ts";
export const NOTIFICATION_SETTINGS_STORAGE_KEY = "unilink:notification-settings";
export const NOTIFICATION_SETTINGS_CHANGED_EVENT =
  "unilink:notificationSettingsChanged";

export interface NotificationSettings {
  deadline: boolean;
}

const defaultSettings: NotificationSettings = {
  deadline: false,
};

export function getNotificationSettings(): NotificationSettings {
  if (typeof window === "undefined") return defaultSettings;

  try {
    const raw = privateStorage.getItem(NOTIFICATION_SETTINGS_STORAGE_KEY);
    if (!raw) return defaultSettings;
    const parsed = JSON.parse(raw) as Partial<NotificationSettings>;

    return {
      deadline: Boolean(parsed.deadline),
    };
  } catch {
    return defaultSettings;
  }
}

export function saveNotificationSettings(settings: NotificationSettings) {
  if (typeof window === "undefined") return;

  privateStorage.setItem(
    NOTIFICATION_SETTINGS_STORAGE_KEY,
    JSON.stringify({ deadline: Boolean(settings.deadline) }),
  );
  window.dispatchEvent(new Event(NOTIFICATION_SETTINGS_CHANGED_EVENT));
}
