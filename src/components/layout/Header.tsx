"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  APP_NOTIFICATIONS_CHANGED_EVENT,
  AppNotification,
  getAppNotifications,
  markAppNotificationRead,
} from "@/lib/notification-storage";

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const unreadCount = notifications.filter((notification) => !notification.read).length;

  useEffect(() => {
    function syncNotifications() {
      setNotifications(getAppNotifications());
    }

    syncNotifications();
    window.addEventListener(APP_NOTIFICATIONS_CHANGED_EVENT, syncNotifications);
    window.addEventListener("storage", syncNotifications);

    return () => {
      window.removeEventListener(APP_NOTIFICATIONS_CHANGED_EVENT, syncNotifications);
      window.removeEventListener("storage", syncNotifications);
    };
  }, []);

  function formatNotificationTime(createdAt: string) {
    const diff = Date.now() - new Date(createdAt).getTime();
    if (diff < 60 * 1000) return "방금 전";
    if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}분 전`;
    if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}시간 전`;
    return `${Math.floor(diff / 86400000)}일 전`;
  }

  function openNotification(notification: AppNotification) {
    markAppNotificationRead(notification.id);
    setNotifications(getAppNotifications());
    router.push(notification.href);
  }

  return (
    <header className="h-16 border-b bg-white flex items-center gap-4 px-6">
      <h1 className="text-lg font-semibold">{title}</h1>
      <div className="flex-1 max-w-sm ml-4 hidden md:block">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="수업, 게시글 검색..."
            className="pl-9 h-9 bg-muted border-0"
          />
        </div>
      </div>
      <div className="flex-1" />
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="ghost" size="icon" className="relative" />}
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <Badge className="absolute -top-1 -right-1 h-5 w-5 p-0 flex items-center justify-center text-[10px]">
              {unreadCount}
            </Badge>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          <div className="px-3 py-2 border-b">
            <p className="font-semibold text-sm">알림</p>
          </div>
          {notifications.length > 0 ? (
            notifications.slice(0, 8).map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className="px-3 py-3 flex gap-3 cursor-pointer"
                onClick={() => openNotification(notification)}
              >
                {!notification.read && (
                  <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
                )}
                <div className={notification.read ? "ml-4 min-w-0" : "min-w-0"}>
                  <p className="text-sm font-medium leading-snug">
                    {notification.title}
                  </p>
                  <p className="text-xs leading-snug text-muted-foreground">
                    {notification.body}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {formatNotificationTime(notification.createdAt)}
                  </p>
                </div>
              </DropdownMenuItem>
            ))
          ) : (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              아직 받은 알림이 없습니다.
            </div>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
