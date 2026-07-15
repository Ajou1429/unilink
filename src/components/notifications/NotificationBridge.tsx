"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  COMMUNITY_POSTS_CHANGED_EVENT,
  getCommunityPosts,
} from "@/lib/community-storage";
import {
  getNotificationSettings,
  NOTIFICATION_SETTINGS_CHANGED_EVENT,
} from "@/lib/notification-settings";
import {
  getWeeklyStudyPlans,
  STUDY_PLANS_CHANGED_EVENT,
} from "@/lib/study-storage";
import {
  AppNotification,
  markAppNotificationRead,
  upsertAppNotification,
} from "@/lib/notification-storage";

const NOTIFICATION_HISTORY_STORAGE_KEY = "unilink:notification-history";

interface NotificationToast {
  id: string;
  title: string;
  body: string;
  notification: AppNotification;
}

function addDays(date: Date, amount: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + amount);
  return next;
}

function formatDateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getNotificationHistory() {
  try {
    const raw = window.localStorage.getItem(NOTIFICATION_HISTORY_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function saveNotificationHistory(history: string[]) {
  window.localStorage.setItem(
    NOTIFICATION_HISTORY_STORAGE_KEY,
    JSON.stringify(history.slice(-200)),
  );
}

export function NotificationBridge() {
  const router = useRouter();
  const [toasts, setToasts] = useState<NotificationToast[]>([]);
  const seenPostIdsRef = useRef<Set<string> | null>(null);

  function openNotification(notification: AppNotification) {
    markAppNotificationRead(notification.id);
    router.push(notification.href);
  }

  function showNotification(notification: AppNotification) {
    upsertAppNotification(notification);

    if ("Notification" in window && Notification.permission === "granted") {
      const browserNotification = new Notification(notification.title, {
        body: notification.body,
        tag: notification.id,
      });
      browserNotification.onclick = () => {
        window.focus();
        openNotification(notification);
        browserNotification.close();
      };
    }

    const id = `${notification.id}-${Date.now()}`;
    setToasts((prev) =>
      [
        {
          id,
          title: notification.title,
          body: notification.body,
          notification,
        },
        ...prev,
      ].slice(0, 3),
    );
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, 5200);
  }

  function checkCommunityNotifications() {
    const settings = getNotificationSettings();
    const posts = getCommunityPosts();
    const previousPostIds = seenPostIdsRef.current;

    seenPostIdsRef.current = new Set(posts.map((post) => post.id));

    if (!previousPostIds || !settings.community) return;

    const newPosts = posts
      .filter((post) => !previousPostIds.has(post.id))
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    const latestPost = newPosts[0];

    if (!latestPost) return;

    showNotification({
      id: `community-${latestPost.id}`,
      type: "community",
      title: "새 커뮤니티 글",
      body: `${latestPost.category} · ${latestPost.title}`,
      href: `/community?postId=${encodeURIComponent(latestPost.id)}`,
      read: false,
      createdAt: new Date().toISOString(),
    });
  }

  function checkDeadlineNotifications() {
    const settings = getNotificationSettings();
    if (!settings.deadline) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrowKey = formatDateKey(addDays(today, 1));
    const todayKey = formatDateKey(today);
    const plansDueTomorrow = getWeeklyStudyPlans().filter(
      (plan) => plan.dueDate === tomorrowKey && !plan.isCompleted,
    );
    const history = new Set(getNotificationHistory());
    let changed = false;

    plansDueTomorrow.forEach((plan) => {
      const historyKey = `${todayKey}:deadline:${plan.id}`;
      if (history.has(historyKey)) return;

      showNotification({
        id: `deadline-${plan.id}-${todayKey}`,
        type: "deadline",
        title: "마감 하루 전",
        body: `${plan.courseName} · ${plan.title}`,
        href: `/study?planId=${encodeURIComponent(plan.id)}`,
        read: false,
        createdAt: new Date().toISOString(),
      });
      history.add(historyKey);
      changed = true;
    });

    if (changed) {
      saveNotificationHistory(Array.from(history));
    }
  }

  useEffect(() => {
    seenPostIdsRef.current = new Set(getCommunityPosts().map((post) => post.id));
    checkDeadlineNotifications();

    function handleStorage() {
      checkCommunityNotifications();
      checkDeadlineNotifications();
    }

    window.addEventListener(COMMUNITY_POSTS_CHANGED_EVENT, checkCommunityNotifications);
    window.addEventListener(STUDY_PLANS_CHANGED_EVENT, checkDeadlineNotifications);
    window.addEventListener(
      NOTIFICATION_SETTINGS_CHANGED_EVENT,
      checkDeadlineNotifications,
    );
    window.addEventListener("storage", handleStorage);

    const interval = window.setInterval(checkDeadlineNotifications, 60 * 60 * 1000);

    return () => {
      window.removeEventListener(
        COMMUNITY_POSTS_CHANGED_EVENT,
        checkCommunityNotifications,
      );
      window.removeEventListener(STUDY_PLANS_CHANGED_EVENT, checkDeadlineNotifications);
      window.removeEventListener(
        NOTIFICATION_SETTINGS_CHANGED_EVENT,
        checkDeadlineNotifications,
      );
      window.removeEventListener("storage", handleStorage);
      window.clearInterval(interval);
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2">
      {toasts.map((toast) => (
        <button
          type="button"
          key={toast.id}
          className="rounded-lg border border-slate-200 bg-white p-3 text-left shadow-lg transition-colors hover:bg-accent"
          onClick={() => openNotification(toast.notification)}
        >
          <p className="text-sm font-semibold">{toast.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{toast.body}</p>
        </button>
      ))}
    </div>
  );
}
