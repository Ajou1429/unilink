"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  LayoutDashboard,
  CalendarDays,
  MessageSquare,
  BookOpen,
  FileText,
  GraduationCap,
  Settings,
  LogOut,
  Sparkles,
  Target,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Course } from "@/lib/types";
import {
  COURSES_CHANGED_EVENT,
  getStoredCourses,
} from "@/lib/course-storage";
import {
  getPersonalStudies,
  PersonalStudy,
  PERSONAL_STUDIES_CHANGED_EVENT,
} from "@/lib/personal-study-storage";
import {
  AUTH_CHANGED_EVENT,
  getCurrentUser,
  type CurrentUser,
} from "@/lib/auth-storage";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "대시보드" },
  { href: "/timetable", icon: CalendarDays, label: "시간표" },
  { href: "/community", icon: MessageSquare, label: "커뮤니티" },
  { href: "/study", icon: BookOpen, label: "학습 플랜" },
  { href: "/notes", icon: FileText, label: "나의 노트" },
];

function useSidebarData() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [personalStudies, setPersonalStudies] = useState<PersonalStudy[]>([]);

  useEffect(() => {
    function syncData() {
      setCourses(getStoredCourses());
      setPersonalStudies(getPersonalStudies());
    }

    syncData();
    window.addEventListener(COURSES_CHANGED_EVENT, syncData);
    window.addEventListener(PERSONAL_STUDIES_CHANGED_EVENT, syncData);
    window.addEventListener("storage", syncData);

    return () => {
      window.removeEventListener(COURSES_CHANGED_EVENT, syncData);
      window.removeEventListener(PERSONAL_STUDIES_CHANGED_EVENT, syncData);
      window.removeEventListener("storage", syncData);
    };
  }, []);

  return { courses, personalStudies };
}

export function Sidebar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeCourseId = searchParams.get("courseId");
  const activeStudyId = searchParams.get("studyId");
  const { courses, personalStudies } = useSidebarData();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    function syncUser() {
      setCurrentUser(getCurrentUser());
    }

    syncUser();
    window.addEventListener(AUTH_CHANGED_EVENT, syncUser);
    window.addEventListener("storage", syncUser);

    return () => {
      window.removeEventListener(AUTH_CHANGED_EVENT, syncUser);
      window.removeEventListener("storage", syncUser);
    };
  }, []);

  const displayName =
    currentUser?.displayName || currentUser?.username || "게스트";
  const schoolLabel =
    currentUser && (currentUser.university || currentUser.department)
      ? `${currentUser.university} ${currentUser.department}`.trim()
      : "로그인 후 학과가 표시됩니다";

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-60 bg-white border-r flex flex-col z-40">
      <div className="h-16 flex items-center px-5 border-b">
        <GraduationCap className="h-6 w-6 text-primary mr-2" />
        <span className="text-lg font-bold text-primary">UniLink</span>
      </div>

      <div className="px-4 py-4 border-b">
        <div className="flex items-center gap-3">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">
              {displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{schoolLabel}</p>
          </div>
        </div>
        <div className="mt-3">
          <Badge variant="secondary" className="text-xs gap-1 text-primary">
            <Sparkles className="h-3 w-3" /> Pro 플랜
          </Badge>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map(({ href, icon: Icon, label }) => {
          const active =
            pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
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
          {courses.length > 0 ? (
            courses.map((course) => {
              const href = `/course?courseId=${encodeURIComponent(course.id)}`;
              const active = pathname === "/course" && activeCourseId === course.id;
              return (
                <Link
                  key={course.id}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent",
                  )}
                >
                  <div
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: course.color }}
                  />
                  <span className="truncate">{course.name}</span>
                </Link>
              );
            })
          ) : (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              시간표에서 수업을 추가하세요.
            </p>
          )}
        </div>

        <div className="pt-4 pb-1">
          <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
            개인 과제
          </p>
          {personalStudies.length > 0 ? (
            personalStudies.map((study) => {
              const href = `/personal-study?studyId=${encodeURIComponent(study.id)}`;
              const active =
                pathname === "/personal-study" && activeStudyId === study.id;
              return (
                <Link
                  key={study.id}
                  href={href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent",
                  )}
                >
                  <Target className="h-3.5 w-3.5 shrink-0" style={{ color: study.color }} />
                  <span className="truncate">{study.title}</span>
                </Link>
              );
            })
          ) : (
            <p className="px-3 py-2 text-xs text-muted-foreground">
              시간표에서 개인 과제를 추가하세요.
            </p>
          )}
        </div>
      </nav>

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
          const active =
            pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              className={cn(
                "flex-1 flex flex-col items-center gap-1 py-3 text-xs font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
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
