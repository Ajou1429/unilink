"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Award,
  BookMarked,
  CalendarDays,
  ChevronDown,
  GraduationCap,
  LogOut,
  PanelLeft,
  Pin,
  PinOff,
  Plus,
  Settings,
  Target,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { Course } from "@/lib/types";
import { COURSES_CHANGED_EVENT, getActiveTermCourses } from "@/lib/course-storage";
import {
  formatPersonalStudyDday,
  getPersonalStudies,
  PERSONAL_STUDIES_CHANGED_EVENT,
  type PersonalStudy,
} from "@/lib/personal-study-storage";
import { AUTH_CHANGED_EVENT, getCurrentUser, logout, type CurrentUser } from "@/lib/auth-storage";
import { useSidebar } from "./SidebarContext";

/** 홈(대시보드)에서 새 채팅을 시작하라는 신호 */
export const NEW_CHAT_EVENT = "unilink:newChat";

const navItems = [
  { href: "/timetable", icon: CalendarDays, label: "시간표" },
  { href: "/problem-bank", icon: BookMarked, label: "문제은행" },
  { href: "/records", icon: Award, label: "성적 및 스펙" },
];

function useSidebarData() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [studies, setStudies] = useState<PersonalStudy[]>([]);
  const [user, setUser] = useState<CurrentUser | null>(null);

  useEffect(() => {
    function sync() {
      setCourses(getActiveTermCourses().courses);
      setStudies(getPersonalStudies().filter((study) => (study.status ?? "active") === "active"));
      setUser(getCurrentUser());
    }
    sync();
    const events = [COURSES_CHANGED_EVENT, PERSONAL_STUDIES_CHANGED_EVENT, AUTH_CHANGED_EVENT, "storage"];
    events.forEach((event) => window.addEventListener(event, sync));
    return () => events.forEach((event) => window.removeEventListener(event, sync));
  }, []);

  return { courses, studies, user };
}

/** 왼쪽 위 목록 열기/닫기 버튼 (사이드바 안과, 접혔을 때 각 화면 상단에서 같이 쓴다) */
export function SidebarToggle({ className }: { className?: string }) {
  const { toggle, open } = useSidebar();
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={open ? "목록 닫기" : "목록 열기"}
      title={open ? "목록 닫기" : "목록 열기"}
      className={cn("flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground", className)}
    >
      <PanelLeft className="h-[18px] w-[18px]" />
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="pt-4">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 rounded-md px-3 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        {title}
        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", open ? "" : "-rotate-90")} />
      </button>
      {open && <div className="mt-1 space-y-0.5">{children}</div>}
    </div>
  );
}

function ItemRow({
  href,
  active,
  pinned,
  onPin,
  icon,
  label,
  trailing,
  onNavigate,
}: {
  href: string;
  active: boolean;
  pinned: boolean;
  onPin: () => void;
  icon: React.ReactNode;
  label: string;
  trailing?: React.ReactNode;
  onNavigate: () => void;
}) {
  return (
    <div className={cn("group relative flex items-center rounded-lg", active ? "bg-accent" : "hover:bg-accent/70")}>
      <Link href={href} onClick={onNavigate} className="flex min-w-0 flex-1 items-center gap-2.5 px-3 py-1.5 text-sm">
        {icon}
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {trailing && <span className="shrink-0 group-hover:hidden">{trailing}</span>}
      </Link>
      <button
        type="button"
        onClick={onPin}
        aria-label={pinned ? `${label} 고정 해제` : `${label} 고정`}
        title={pinned ? "고정 해제" : "고정"}
        className="absolute right-1.5 hidden size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground group-hover:flex focus-visible:flex"
      >
        {pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
      </button>
    </div>
  );
}

function SidebarBody({ onNavigate }: { onNavigate: () => void }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { pins, togglePin } = useSidebar();
  const { courses, studies, user } = useSidebarData();
  const [logoutError, setLogoutError] = useState("");
  const activeCourseId = pathname === "/course" ? searchParams.get("courseId") : null;
  const activeStudyId = pathname === "/personal-study" ? searchParams.get("studyId") : null;

  const displayName = user?.displayName || user?.username || "게스트";
  const courseRow = (course: Course) => {
    const key = `course:${course.id}`;
    return (
      <ItemRow
        key={key}
        href={`/course?courseId=${encodeURIComponent(course.id)}`}
        active={activeCourseId === course.id}
        pinned={pins.includes(key)}
        onPin={() => togglePin(key)}
        onNavigate={onNavigate}
        icon={<span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: course.color }} />}
        label={course.name}
      />
    );
  };
  const studyRow = (study: PersonalStudy) => {
    const key = `study:${study.id}`;
    return (
      <ItemRow
        key={key}
        href={`/personal-study?studyId=${encodeURIComponent(study.id)}`}
        active={activeStudyId === study.id}
        pinned={pins.includes(key)}
        onPin={() => togglePin(key)}
        onNavigate={onNavigate}
        icon={<Target className="h-3.5 w-3.5 shrink-0" style={{ color: study.color }} />}
        label={study.title}
        trailing={study.targetDate ? <span className="text-[10px] font-semibold text-primary">{formatPersonalStudyDday(study.targetDate)}</span> : undefined}
      />
    );
  };
  const pinnedRows = pins.flatMap((key) => {
    const [type, id] = [key.slice(0, key.indexOf(":")), key.slice(key.indexOf(":") + 1)];
    if (type === "course") {
      const course = courses.find((item) => item.id === id);
      return course ? [courseRow(course)] : [];
    }
    const study = studies.find((item) => item.id === id);
    return study ? [studyRow(study)] : [];
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-2 px-3">
        <SidebarToggle />
        <Link href="/dashboard" onClick={onNavigate} className="flex items-center gap-1.5 font-bold text-primary">
          <GraduationCap className="h-5 w-5" /> UniLink
        </Link>
      </div>

      <nav aria-label="주 메뉴" className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
        <Link
          href="/dashboard"
          onClick={() => { window.dispatchEvent(new Event(NEW_CHAT_EVENT)); onNavigate(); }}
          className="flex items-center gap-2.5 rounded-lg bg-accent/80 px-3 py-2 text-sm font-medium hover:bg-accent"
        >
          <Plus className="h-4 w-4" /> 새 채팅
        </Link>
        <div className="mt-2 space-y-0.5">
          {navItems.map(({ href, icon: Icon, label }) => (
            <Link
              key={href}
              href={href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm",
                pathname.startsWith(href) ? "bg-accent font-medium" : "hover:bg-accent/70",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" /> {label}
            </Link>
          ))}
        </div>

        {pinnedRows.length > 0 && <Section title="고정됨">{pinnedRows}</Section>}

        <Section title="내 수업">
          {courses.filter((course) => !pins.includes(`course:${course.id}`)).map(courseRow)}
          {courses.length === 0 && <p className="px-3 py-1.5 text-xs text-muted-foreground">시간표에서 수업을 추가하세요.</p>}
        </Section>

        <Section title="개인 학습">
          {studies.filter((study) => !pins.includes(`study:${study.id}`)).map(studyRow)}
          {studies.length === 0 && <p className="px-3 py-1.5 text-xs text-muted-foreground">시간표에서 개인 학습을 추가하세요.</p>}
        </Section>
      </nav>

      <div className="flex shrink-0 items-center gap-2 border-t px-3 py-2.5">
        <Avatar className="h-8 w-8">
          <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{displayName.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{displayName}</p>
          <p className="truncate text-[11px] text-muted-foreground">{user?.department || "Pro"}</p>
        </div>
        <Link href="/settings" onClick={onNavigate} aria-label="설정" title="설정" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
          <Settings className="h-4 w-4" />
        </Link>
        <button
          type="button"
          aria-label="로그아웃"
          title="로그아웃"
          onClick={async () => {
            try { await logout(); router.push("/login"); }
            catch (error) { setLogoutError(error instanceof Error ? error.message : "로그아웃에 실패했습니다."); }
          }}
          className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <LogOut className="h-4 w-4" />
        </button>
      </div>
      {logoutError && <p role="alert" className="px-3 pb-2 text-xs text-destructive">{logoutError}</p>}
    </div>
  );
}

/** 왼쪽 목록. 넓은 화면에서는 본문 옆에 붙어 있고(접기 가능), 좁은 화면에서는 위에 띄운다. */
export function Sidebar() {
  const { open, mobileOpen, setMobileOpen } = useSidebar();
  return (
    <>
      <aside
        aria-label="목록"
        className={cn(
          "sticky top-0 hidden h-[calc(100dvh-var(--app-top,0px))] shrink-0 overflow-hidden border-r bg-[#f7f6f3] transition-[width] duration-200 ease-out lg:block",
          open ? "w-72" : "w-0 border-r-0",
        )}
      >
        <div className="h-full w-72">
          <SidebarBody onNavigate={() => undefined} />
        </div>
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left" showCloseButton={false} className="w-72 max-w-[calc(100vw-2rem)] gap-0 bg-[#f7f6f3] p-0 lg:hidden">
          <SheetTitle className="sr-only">전체 메뉴</SheetTitle>
          <SidebarBody onNavigate={() => setMobileOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
