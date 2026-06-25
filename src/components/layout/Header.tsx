"use client";

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

const notifications = [
  {
    id: 1,
    text: "운영체제 커뮤니티에 새 글이 올라왔어요.",
    time: "방금 전",
    unread: true,
  },
  {
    id: 2,
    text: "이번 주 학습 계획 3개가 완료되었어요.",
    time: "1시간 전",
    unread: true,
  },
  {
    id: 3,
    text: "'알고리즘' 수업을 듣는 53명이 있어요.",
    time: "어제",
    unread: false,
  },
];

interface HeaderProps {
  title: string;
}

export function Header({ title }: HeaderProps) {
  const unreadCount = notifications.filter((n) => n.unread).length;

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
          {notifications.map((n) => (
            <DropdownMenuItem
              key={n.id}
              className="px-3 py-3 flex gap-3 cursor-pointer"
            >
              {n.unread && (
                <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
              )}
              <div className={n.unread ? "" : "ml-4"}>
                <p className="text-sm leading-snug">{n.text}</p>
                <p className="text-xs text-muted-foreground mt-1">{n.time}</p>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
