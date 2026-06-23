"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  MessageSquare,
  BookOpen,
  GraduationCap,
  Settings,
  LogOut,
  Sparkles,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "홈" },
  { href: "/timetable", icon: CalendarDays, label: "시간표" },
  { href: "/community", icon: MessageSquare, label: "커뮤니티" },
  { href: "/study", icon: BookOpen, label: "학습 플랜" },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 bg-white border-r flex flex-col z-40">
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b">
        <GraduationCap className="h-6 w-6 text-primary mr-2" />
        <span className="text-lg font-bold text-primary">UniLink</span>
      </div>

      {/* User info */}
      <div className="px-4 py-4 border-b">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">이준</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">이준원</p>
            <p className="text-xs text-muted-foreground truncate">연세대학교 · 컴퓨터과학</p>
          </div>
        </div>
        <div className="mt-3">
          <Badge variant="secondary" className="text-xs gap-1 text-primary">
            <Sparkles className="h-3 w-3" /> Pro 플랜
          </Badge>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}

        <div className="pt-4 pb-1">
          <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            내 수업
          </p>
          {[
            { name: "운영체제", color: "#4F46E5" },
            { name: "데이터베이스", color: "#7C3AED" },
            { name: "알고리즘", color: "#059669" },
          ].map((course) => (
            <Link
              key={course.name}
              href={`/community?course=${course.name}`}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
            >
              <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: course.color }} />
              {course.name}
            </Link>
          ))}
        </div>
      </nav>

      {/* Bottom section */}
      <div className="px-3 py-3 border-t space-y-1">
        <Link
          href="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <Settings className="h-4 w-4" />
          설정
        </Link>
        <Link
          href="/login"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        >
          <LogOut className="h-4 w-4" />
          로그아웃
        </Link>
      </div>
    </aside>
  );
}

export function MobileSidebar() {
  const pathname = usePathname();
  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 bg-white border-t lg:hidden">
      <div className="flex">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground"
              )}
            >
              <Icon className={cn("h-5 w-5", active && "text-primary")} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
