"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { getStorageUser } from "@/lib/private-storage";
import { flushP0Changes } from "@/lib/p0-sync";
import { AUTH_CHANGED_EVENT } from "@/lib/auth-storage";
import { TIMETABLE_CHANGED_EVENT } from "@/lib/timetable-storage";
import { KOREA_TIME_ZONE } from "@/lib/academic-term";

type EventRow = { id: string; goal_id: string | null; title: string; event_type: string; starts_at: string | null; due_at: string | null };
type Schedule = EventRow & { goalTitle: string; href: string; at: string };

const koreaDateKey = (value: number | string) =>
  new Intl.DateTimeFormat("sv-SE", { timeZone: KOREA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));

/** 한국 날짜 기준 남은 일수 (오늘 0, 내일 1, 지난 일정은 음수) */
export function daysUntil(at: string, now: number) {
  return Math.round((Date.parse(koreaDateKey(at)) - Date.parse(koreaDateKey(now))) / 86400000);
}

function dDayLabel(days: number) {
  if (days === 0) return "D-Day";
  return days > 0 ? `D-${days}` : `D+${-days}`;
}

/** D-1 이내(지난 일정 포함) 빨강, D-2 주황, D-3 이상 초록 */
function dDayClass(days: number) {
  if (days <= 1) return "bg-red-50 text-red-600 ring-red-200";
  if (days === 2) return "bg-orange-50 text-orange-600 ring-orange-200";
  return "bg-emerald-50 text-emerald-700 ring-emerald-200";
}

export function ExamAssignments({ now }: { now: number }) {
  const [rows, setRows] = useState<Schedule[]>([]);
  const [message, setMessage] = useState("일정을 불러오는 중입니다.");
  useEffect(() => {
    let active = true, request = 0;
    async function load() {
      const revision = ++request;
      try {
        const db = getSupabaseBrowserClient();
        const user = db ? (await db.auth.getUser()).data.user : null;
        if (!db || !user || getStorageUser() !== user.id) {
          if (active && revision === request) { setRows([]); setMessage("로그인하면 시험·과제 일정을 확인할 수 있습니다."); }
          return;
        }
        await flushP0Changes();
        const columns = "id,goal_id,title,event_type,starts_at,due_at";
        const [exams, assignments] = await Promise.all([
          db.from("calendar_events").select(columns).eq("user_id", user.id).eq("status", "scheduled")
            .eq("event_type", "exam").gte("starts_at", new Date(now).toISOString()).order("starts_at").limit(8),
          db.from("calendar_events").select(columns).eq("user_id", user.id).eq("status", "scheduled")
            .eq("event_type", "assignment").not("due_at", "is", null).order("due_at").limit(8),
        ]);
        if (exams.error || assignments.error) throw new Error("시험·과제 일정을 불러오지 못했습니다.");
        const events = [...(exams.data ?? []), ...(assignments.data ?? [])];
        const goalIds = [...new Set(events.flatMap((event) => event.goal_id ? [event.goal_id] : []))];
        const goals = goalIds.length ? await db.from("learning_goals").select("id,title,course_id,metadata")
          .eq("user_id", user.id).in("id", goalIds) : { data: [], error: null };
        if (goals.error) throw new Error("수업 정보를 불러오지 못했습니다.");
        if (!active || revision !== request || getStorageUser() !== user.id) return;
        setRows(events.flatMap((event) => {
          const at = event.event_type === "assignment" ? event.due_at : event.starts_at;
          if (!at) return [];
          const goal = goals.data?.find((goal) => goal.id === event.goal_id);
          const courseId = goal?.metadata?.legacy_record?.courseId ?? goal?.course_id;
          return [{ ...event, at, goalTitle: goal?.title ?? "", href: courseId ? `/course?courseId=${encodeURIComponent(courseId)}` : "/timetable" }];
        }).sort((a, b) => Date.parse(a.at) - Date.parse(b.at)));
        setMessage("");
      } catch { if (active && revision === request) { setRows([]); setMessage("시험·과제 일정을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요."); } }
    }
    void load();
    window.addEventListener(AUTH_CHANGED_EVENT, load);
    window.addEventListener(TIMETABLE_CHANGED_EVENT, load);
    return () => { active = false; window.removeEventListener(AUTH_CHANGED_EVENT, load); window.removeEventListener(TIMETABLE_CHANGED_EVENT, load); };
  }, [now]);

  const format = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: KOREA_TIME_ZONE, month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  return <Card className="min-w-0 border-0 shadow-sm">
    <CardHeader className="pb-3"><div className="flex items-center justify-between gap-3">
      <CardTitle className="text-base">시험·과제</CardTitle>
      <Button render={<Link href="/timetable" />} nativeButton={false} variant="ghost" size="sm" className="h-7 gap-1 text-xs text-primary">
        일정 <ArrowRight className="h-3 w-3" />
      </Button>
    </div></CardHeader>
    <CardContent className="space-y-2">
      {message ? <p role="status" className="py-4 text-center text-sm text-muted-foreground">{message}</p>
        : rows.length === 0 ? <p className="py-4 text-center text-sm text-muted-foreground">예정된 시험·과제가 없어요.</p>
        : rows.map((event) => {
          const days = daysUntil(event.at, now);
          return <Link key={event.id} href={event.href} className="flex items-start gap-3 rounded-lg p-2 -mx-2 transition-colors hover:bg-accent/50">
            <span className={`mt-0.5 w-14 shrink-0 rounded-md py-1 text-center text-xs font-bold ring-1 ring-inset ${dDayClass(days)}`}>{dDayLabel(days)}</span>
            <div className="min-w-0">
              <p className="break-words text-sm font-medium">{event.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {[event.event_type === "exam" ? "시험" : "과제", event.goalTitle, format(event.at)].filter(Boolean).join(" · ")}
              </p>
            </div>
          </Link>;
        })}
    </CardContent>
  </Card>;
}
