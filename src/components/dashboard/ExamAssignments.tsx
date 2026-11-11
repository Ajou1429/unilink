"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { getStorageUser } from "@/lib/private-storage";
import { flushP0Changes } from "@/lib/p0-sync";
import { AUTH_CHANGED_EVENT } from "@/lib/auth-storage";
import { TIMETABLE_CHANGED_EVENT } from "@/lib/timetable-storage";

type EventRow = { id: string; goal_id: string | null; title: string; event_type: string; starts_at: string | null; due_at: string | null };
type Schedule = EventRow & { goalTitle: string; href: string };

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
          if (active && revision === request) { setRows([]); setMessage("로그인하면 시험·과제 제출 일정을 확인할 수 있습니다."); }
          return;
        }
        await flushP0Changes();
        const columns = "id,goal_id,title,event_type,starts_at,due_at";
        const [exams, assignments] = await Promise.all([
          db.from("calendar_events").select(columns).eq("user_id", user.id).eq("status", "scheduled")
            .eq("event_type", "exam").gte("starts_at", new Date(now).toISOString()).order("starts_at").limit(6),
          db.from("calendar_events").select(columns).eq("user_id", user.id).eq("status", "scheduled")
            .eq("event_type", "assignment").not("due_at", "is", null).order("due_at").limit(6),
        ]);
        if (exams.error || assignments.error) throw new Error("시험·과제 일정을 불러오지 못했습니다.");
        const events = [...(exams.data ?? []), ...(assignments.data ?? [])];
        const goalIds = [...new Set(events.flatMap((event) => event.goal_id ? [event.goal_id] : []))];
        const goals = goalIds.length ? await db.from("learning_goals").select("id,title,course_id,metadata")
          .eq("user_id", user.id).in("id", goalIds) : { data: [], error: null };
        if (goals.error) throw new Error("수업 정보를 불러오지 못했습니다.");
        if (!active || revision !== request || getStorageUser() !== user.id) return;
        setRows(events.map((event) => {
          const goal = goals.data?.find((goal) => goal.id === event.goal_id);
          const courseId = goal?.metadata?.legacy_record?.courseId ?? goal?.course_id;
          return { ...event, goalTitle: goal?.title ?? "기타 일정", href: courseId ? `/course?courseId=${encodeURIComponent(courseId)}` : "/timetable" };
        }));
        setMessage("");
      } catch { if (active && revision === request) { setRows([]); setMessage("시험·과제 일정을 불러오지 못했습니다. 잠시 후 다시 확인해 주세요."); } }
    }
    void load();
    window.addEventListener(AUTH_CHANGED_EVENT, load);
    window.addEventListener(TIMETABLE_CHANGED_EVENT, load);
    return () => { active = false; window.removeEventListener(AUTH_CHANGED_EVENT, load); window.removeEventListener(TIMETABLE_CHANGED_EVENT, load); };
  }, [now]);

  const format = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  return <Card className="border-0 shadow-sm">
    <CardHeader className="pb-3"><div className="flex items-center justify-between gap-3">
      <CardTitle className="flex items-center gap-2 text-base"><CalendarDays className="h-4 w-4" />예정 일정</CardTitle>
      <Link href="/timetable" className="shrink-0 text-xs text-primary hover:underline">전체 일정</Link>
    </div></CardHeader>
    <CardContent>
      {message ? <p role="status" className="py-4 text-center text-sm text-muted-foreground">{message}</p> :
        <div className="grid gap-6 md:grid-cols-2">{(["exam", "assignment"] as const).map((kind) => {
          const events = rows.filter((row) => row.event_type === kind);
          return <section key={kind} className="min-w-0 space-y-3">
            <h3 className="text-sm font-semibold">{kind === "exam" ? "예정된 시험" : "과제 제출"}</h3>
            {events.map((event) => { const at = event.due_at ?? event.starts_at;
              return <Link key={event.id} href={event.href} className="block rounded-lg border p-3 transition-colors hover:bg-accent/50">
                <div className="flex items-start justify-between gap-2"><p className="break-words text-sm font-medium">{event.title}</p>
                  {kind === "assignment" && at && Date.parse(at) < now && <Badge variant="destructive" className="shrink-0 text-[10px]">기한 지남</Badge>}
                </div><p className="mt-1 text-xs text-muted-foreground">{event.goalTitle}</p>
                {at && <p className="mt-1 text-xs text-muted-foreground">{format(at)}{kind === "assignment" ? " 마감" : ""}</p>}
              </Link>;
            })}
            {!events.length && <p className="py-4 text-sm text-muted-foreground">{kind === "exam" ? "예정된 시험이 없어요." : "제출할 과제가 없어요."}</p>}
          </section>;
        })}</div>}
    </CardContent>
  </Card>;
}
