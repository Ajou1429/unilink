"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Plus, Redo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { getStorageUser } from "@/lib/private-storage";
import { flushP0Changes } from "@/lib/p0-sync";
import { addWeeklyStudyPlan, postponeWeeklyStudyPlan } from "@/lib/study-storage";
import type { Course, StudyPlan } from "@/lib/types";

type PlanItem = {
  id: string;
  title: string;
  scheduled_start: string | null;
  scheduled_end: string | null;
  planned_minutes: number;
  metadata: Record<string, unknown> | null;
};

type Row = {
  id: string;
  title: string;
  label: string;
  postponed: number;
  postpone: () => Promise<void> | void;
};

const DAY_MS = 86400000;

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return date.toISOString().slice(0, 10);
}

function formatDateLabel(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const weekday = new Intl.DateTimeFormat("ko-KR", { weekday: "short", timeZone: "UTC" }).format(
    new Date(Date.UTC(year, month - 1, day)),
  );
  return `${month}월 ${day}일 (${weekday})`;
}

function postponeCountOf(metadata: PlanItem["metadata"]) {
  const value = Number(metadata?.postpone_count ?? 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function AddPlanDialog({ open, onOpenChange, date, courses }: { open: boolean; onOpenChange: (open: boolean) => void; date: string; courses: Course[] }) {
  const [title, setTitle] = useState("");
  const [courseId, setCourseId] = useState("");
  const [dueDate, setDueDate] = useState(date);
  function submit() {
    const course = courses.find((item) => item.id === courseId);
    addWeeklyStudyPlan({ title, dueDate, courseId: course?.id, courseName: course?.name });
    onOpenChange(false);
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader><DialogTitle>계획 추가</DialogTitle></DialogHeader>
        <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); if (title.trim() && dueDate) submit(); }}>
          <div className="space-y-1.5">
            <Label>할 일</Label>
            <Input autoFocus aria-label="할 일" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>과목</Label>
              <select aria-label="과목" className="h-8 w-full rounded-lg border bg-white px-2 text-sm" value={courseId} onChange={(event) => setCourseId(event.target.value)}>
                <option value="">개인 학습</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>날짜</Label>
              <Input type="date" aria-label="날짜" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={!title.trim() || !dueDate}>추가</Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function TodayPlans({ date: today, plans, courses }: { date: string; plans: StudyPlan[]; courses: Course[] }) {
  const [adding, setAdding] = useState(false);
  // 오늘 기준 며칠 앞/뒤를 보고 있는지. 자정이 지나면 자연히 새 오늘 기준이 된다.
  const [offset, setOffset] = useState(0);
  const date = shiftDateKey(today, offset);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [message, setMessage] = useState("계획을 불러오는 중입니다.");
  const [reload, setReload] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function load() {
      const db = getSupabaseBrowserClient();
      const user = db ? (await db.auth.getUser()).data.user : null;
      if (!db || !user || getStorageUser() !== user.id) {
        if (active) { setItems([]); setMessage(""); }
        return;
      }
      await flushP0Changes();
      const start = new Date(`${date}T00:00:00+09:00`);
      const end = new Date(start.getTime() + DAY_MS);
      const result = await db.from("study_plan_items")
        .select("id,title,scheduled_start,scheduled_end,planned_minutes,metadata,study_plans!inner(source_type,status)")
        .eq("user_id", user.id).eq("study_plans.source_type", "ai")
        .in("study_plans.status", ["approved", "active", "completed"])
        .in("status", ["planned", "in_progress"])
        .gte("scheduled_start", start.toISOString()).lt("scheduled_start", end.toISOString()).order("scheduled_start");
      if (!active || getStorageUser() !== user.id) return;
      if (result.error) throw new Error("AI 계획을 불러오지 못했습니다.");
      setItems((result.data ?? []) as PlanItem[]); setMessage("");
    }
    void load().catch(() => { if (active) { setItems([]); setMessage("AI 계획을 불러오지 못했습니다."); } });
    return () => { active = false; };
  }, [date, plans, reload]);

  async function postponeAiItem(item: PlanItem) {
    const db = getSupabaseBrowserClient();
    if (!db || !item.scheduled_start || !item.scheduled_end) return;
    const user = (await db.auth.getUser()).data.user;
    if (!user || getStorageUser() !== user.id) throw new Error("다시 로그인해 주세요.");
    await flushP0Changes();
    if (getStorageUser() !== user.id) throw new Error("계정이 변경됐습니다.");
    const { error } = await db.rpc("postpone_coaching_plan_item", {
      p_item: item.id, p_expected_start: item.scheduled_start, p_request: crypto.randomUUID(),
    });
    if (error) throw new Error(error.code === "PGRST202" ? "일정 검증 DB 업데이트(0037)가 필요합니다." : error.message);
    setReload((value) => value + 1);
    window.dispatchEvent(new Event("unilink:studyPlansChanged"));
  }

  async function run(row: Row) {
    if (busyId) return;
    setBusyId(row.id);
    try { await row.postpone(); }
    catch (error) { setMessage(error instanceof Error ? error.message : "미루지 못했습니다. 잠시 후 다시 시도해 주세요."); }
    finally { setBusyId(null); }
  }

  const time = (value: string) => new Intl.DateTimeFormat("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
  const rows: Row[] = [
    ...items.map((item) => ({
      id: `ai-${item.id}`,
      title: item.title,
      label: `${item.scheduled_start ? time(item.scheduled_start) + " · " : ""}${item.planned_minutes}분`,
      postponed: postponeCountOf(item.metadata),
      postpone: () => postponeAiItem(item),
    })),
    ...plans.filter((plan) => !plan.isCompleted && plan.dueDate.slice(0, 10) === date)
      .map((plan) => ({
        id: `plan-${plan.id}`,
        title: plan.title,
        label: plan.courseName,
        postponed: plan.postponedCount ?? 0,
        postpone: () => { postponeWeeklyStudyPlan(plan.id, plans); },
      })),
  ];

  return <Card className="flex min-h-0 min-w-0 flex-col border-0 shadow-sm">
    <CardHeader className="pb-3">
      <div className="flex items-center justify-between gap-2">
        <CardTitle className="text-base">{offset === 0 ? "오늘 계획" : "계획"}</CardTitle>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" aria-label="계획 추가" title="계획 추가" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" aria-label="이전 날" onClick={() => setOffset((value) => value - 1)}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <button
            type="button"
            onClick={() => setOffset(0)}
            title="오늘로 이동"
            className={`min-w-24 rounded-md px-1 text-center text-sm font-medium hover:bg-accent ${offset === 0 ? "" : "text-muted-foreground"}`}
          >
            {formatDateLabel(date)}
          </button>
          <Button variant="ghost" size="icon-sm" aria-label="다음 날" onClick={() => setOffset((value) => value + 1)}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </CardHeader>
    <CardContent className="min-h-0 flex-1 overflow-y-auto space-y-3">
      {rows.map((row) => <div key={row.id} className="flex items-start gap-2 rounded-lg border bg-muted/30 p-3">
        <Link href="/study" className="min-w-0 flex-1 hover:underline">
          <p className="break-words text-sm font-medium">{row.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {row.label}
            {row.postponed > 0 && <span className="ml-1.5 font-medium text-amber-600">{row.postponed}회 미룸</span>}
          </p>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 gap-1 px-2 text-xs"
          disabled={busyId === row.id}
          onClick={() => void run(row)}
          aria-label={`${row.title} 다음날로 미루기`}
        >
          <Redo2 className="h-3.5 w-3.5" /> 미루기
        </Button>
      </div>)}
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
      {!rows.length && !message && <p className="py-6 text-center text-sm text-muted-foreground">예정된 계획이 없어요.</p>}
    </CardContent>
    {adding && <AddPlanDialog open={adding} onOpenChange={setAdding} date={date} courses={courses} />}
  </Card>;
}
