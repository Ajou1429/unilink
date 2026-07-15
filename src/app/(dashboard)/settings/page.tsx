"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BellRing, CalendarClock, MessageSquare } from "lucide-react";
import {
  AUTH_CHANGED_EVENT,
  getCurrentUser,
  type CurrentUser,
  updateDisplayName,
} from "@/lib/auth-storage";
import {
  getNotificationSettings,
  NotificationSettings,
  NOTIFICATION_SETTINGS_CHANGED_EVENT,
  saveNotificationSettings,
} from "@/lib/notification-settings";

export default function SettingsPage() {
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [message, setMessage] = useState("");
  const [notificationSettings, setNotificationSettings] =
    useState<NotificationSettings>({
      community: false,
      deadline: false,
    });
  const [notificationMessage, setNotificationMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    function syncUser() {
      const user = getCurrentUser();
      setCurrentUser(user);
      setDisplayName(user?.displayName || user?.username || "");
    }

    syncUser();
    window.addEventListener(AUTH_CHANGED_EVENT, syncUser);
    window.addEventListener("storage", syncUser);

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, syncUser);
      window.removeEventListener("storage", syncUser);
    };
  }, []);

  useEffect(() => {
    function syncNotificationSettings() {
      setNotificationSettings(getNotificationSettings());
    }

    syncNotificationSettings();
    window.addEventListener(
      NOTIFICATION_SETTINGS_CHANGED_EVENT,
      syncNotificationSettings,
    );
    window.addEventListener("storage", syncNotificationSettings);

    return () => {
      window.removeEventListener(
        NOTIFICATION_SETTINGS_CHANGED_EVENT,
        syncNotificationSettings,
      );
      window.removeEventListener("storage", syncNotificationSettings);
    };
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setMessage("");

    const result = await updateDisplayName(displayName);
    setIsSubmitting(false);
    setMessage(result.message);

    if (result.ok) {
      const user = getCurrentUser();
      setCurrentUser(user);
      setDisplayName(user?.displayName || "");
    }
  }

  async function requestBrowserNotificationPermission() {
    if (!("Notification" in window)) {
      setNotificationMessage("이 브라우저는 알림 기능을 지원하지 않습니다.");
      return false;
    }

    if (Notification.permission === "granted") {
      return true;
    }

    if (Notification.permission === "denied") {
      setNotificationMessage(
        "브라우저에서 알림이 차단되어 있습니다. 사이트 권한에서 알림을 허용해주세요.",
      );
      return false;
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setNotificationMessage(
        "알림 권한이 허용되지 않아 앱 안 알림만 표시될 수 있습니다.",
      );
      return false;
    }

    setNotificationMessage("브라우저 알림 권한이 허용되었습니다.");
    return true;
  }

  async function updateNotificationSetting(
    key: keyof NotificationSettings,
    enabled: boolean,
  ) {
    setNotificationMessage("");

    if (enabled) {
      await requestBrowserNotificationPermission();
    }

    const nextSettings = {
      ...notificationSettings,
      [key]: enabled,
    };
    setNotificationSettings(nextSettings);
    saveNotificationSettings(nextSettings);
    setNotificationMessage(
      enabled ? "알림 설정이 저장되었습니다." : "알림 설정이 꺼졌습니다.",
    );
  }

  const schoolLabel =
    currentUser && (currentUser.university || currentUser.department)
      ? `${currentUser.university} ${currentUser.department}`.trim()
      : "학교/학과 정보 없음";

  return (
    <div className="flex min-h-screen flex-col">
      <Header title="설정" />
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 p-6">
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle>프로필</CardTitle>
          </CardHeader>
          <CardContent>
            {currentUser ? (
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="username">아이디</Label>
                    <Input
                      id="username"
                      className="h-11"
                      value={currentUser.username}
                      readOnly
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="displayName">사용자 이름</Label>
                    <Input
                      id="displayName"
                      className="h-11"
                      value={displayName}
                      maxLength={30}
                      onChange={(event) => setDisplayName(event.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="school">학교/학과</Label>
                  <Input id="school" className="h-11" value={schoolLabel} readOnly />
                </div>

                {message && (
                  <p
                    className={`rounded-md px-3 py-2 text-sm ${
                      message.includes("변경")
                        ? "bg-emerald-50 text-emerald-700"
                        : "bg-red-50 text-red-600"
                    }`}
                  >
                    {message}
                  </p>
                )}

                <div className="flex justify-end">
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? "저장 중..." : "저장"}
                  </Button>
                </div>
              </form>
            ) : (
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-muted-foreground">
                  로그인 후 프로필을 수정할 수 있습니다.
                </p>
                <Button render={<Link href="/login" />}>로그인</Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <BellRing className="h-5 w-5 text-primary" />
              알림
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border bg-background p-4">
              <div className="flex gap-3">
                <MessageSquare className="mt-0.5 h-4 w-4 text-primary" />
                <div>
                  <p className="font-medium">커뮤니티 알림</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    새 커뮤니티 글이 올라오면 알림을 받습니다.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-primary"
                checked={notificationSettings.community}
                onChange={(event) =>
                  updateNotificationSetting("community", event.target.checked)
                }
              />
            </label>

            <label className="flex cursor-pointer items-start justify-between gap-4 rounded-lg border bg-background p-4">
              <div className="flex gap-3">
                <CalendarClock className="mt-0.5 h-4 w-4 text-primary" />
                <div>
                  <p className="font-medium">마감 하루 전 알림</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    학습 계획 마감일이 하루 남았을 때 알림을 받습니다.
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 accent-primary"
                checked={notificationSettings.deadline}
                onChange={(event) =>
                  updateNotificationSetting("deadline", event.target.checked)
                }
              />
            </label>

            {notificationMessage && (
              <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                {notificationMessage}
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
