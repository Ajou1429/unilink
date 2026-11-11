"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { COURSE_EVENTS_CHANGED_EVENT, createCourseEvent } from "@/lib/course-events";
import type { Course } from "@/lib/types";
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

function AddEventDialog({ open, onOpenChange, courses }: { open: boolean; onOpenChange: (open: boolean) => void; courses: Course[] }) {
  const [kind, setKind] = useState<"exam" | "assignment">("assignment");
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [at, setAt] = useState("");
  const [endTime, setEndTime] = useState("");
  const [scope, setScope] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true); setError("");
    try {
      const start = new Date(at);
      const end = kind === "exam" && endTime ? new Date(`${at.slice(0, 10)}T${endTime}`) : null;
      await createCourseEvent({ courseId, kind, title, at: start, end, examScope: scope });
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장하지 못했습니다.");
    } finally { setBusy(false); }
  }

  const control = "h-8 w-full rounded-lg border bg-white px-2 text-sm";
  return (
    <Dialog open={open} onOpenChange={(value) => !busy && onOpenChange(value)}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>시험·과제 추가</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void submit(); }}>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1" role="tablist" aria-label="종류">
            {(["assignment", "exam"] as const).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={kind === item} onClick={() => setKind(item)}
                className={`rounded-md py-1.5 text-sm font-medium ${kind === item ? "bg-white shadow-sm" : "text-muted-foreground"}`}>
                {item === "exam" ? "시험" : "과제"}
              </button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label>과목</Label>
            <select aria-label="과목" className={control} value={courseId} onChange={(event) => setCourseId(event.target.value)}>
              {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>제목</Label>
            <Input aria-label="제목" maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} placeholder={kind === "exam" ? "예: 중간고사" : "예: 과제 3"} />
          </div>
          <div className={kind === "exam" ? "grid grid-cols-[1fr_96px] gap-2" : ""}>
            <div className="space-y-1.5">
              <Label>{kind === "exam" ? "시작" : "마감"}</Label>
              <Input type="datetime-local" aria-label={kind === "exam" ? "시작" : "마감"} value={at} onChange={(event) => setAt(event.target.value)} />
            </div>
            {kind === "exam" && (
              <div className="space-y-1.5">
                <Label>종료</Label>
                <Input type="time" aria-label="종료" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
              </div>
            )}
          </div>
          {kind === "exam" && (
            <div className="space-y-1.5">
              <Label>시험 범위</Label>
              <Textarea rows={2} aria-label="시험 범위" maxLength={5000} value={scope} onChange={(event) => setScope(event.target.value)} />
            </div>
          )}
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={busy || !courseId || !title.trim() || !at}>{busy ? "저장 중…" : "추가"}</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExamAssignments({ now, courses }: { now: number; courses: Course[] }) {
  const [adding, setAdding] = useState(false);
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
    window.addEventListener(COURSE_EVENTS_CHANGED_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(AUTH_CHANGED_EVENT, load);
      window.removeEventListener(TIMETABLE_CHANGED_EVENT, load);
      window.removeEventListener(COURSE_EVENTS_CHANGED_EVENT, load);
    };
  }, [now]);

  const format = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: KOREA_TIME_ZONE, month: "long", day: "numeric", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
  return <Card className="min-w-0 border-0 shadow-sm">
    <CardHeader className="pb-3"><div className="flex items-center justify-between gap-3">
      <CardTitle className="text-base">시험·과제</CardTitle>
      <div className="flex items-center gap-1">
      <Button variant="ghost" size="icon-sm" aria-label="시험·과제 추가" title={courses.length ? "시험·과제 추가" : "시간표에 과목을 먼저 추가하세요"} disabled={!courses.length} onClick={() => setAdding(true)}>
        <Plus className="h-4 w-4" />
      </Button>
      <Button render={<Link href="/timetable" />} nativeButton={false} variant="ghost" size="sm" className="h-7 gap-1 text-xs text-primary">
        일정 <ArrowRight className="h-3 w-3" />
      </Button>
      </div>
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
    {adding && <AddEventDialog open={adding} onOpenChange={setAdding} courses={courses} />}
  </Card>;
}
