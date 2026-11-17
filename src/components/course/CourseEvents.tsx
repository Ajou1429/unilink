"use client";

import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { CalendarDays, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { captureStorageScope, getStorageUser } from "@/lib/private-storage";
import { flushP0Changes } from "@/lib/p0-sync";
import { COURSE_EVENTS_CHANGED_EVENT } from "@/lib/course-events";

type CourseEvent = {
  id: string; title: string; event_type: string; description: string; exam_scope: string;
  starts_at: string | null; ends_at: string | null; due_at: string | null; status: string;
};
const columns = "id,title,event_type,description,exam_scope,starts_at,ends_at,due_at,status";
const kinds = { assignment: "과제", exam: "시험", quiz: "퀴즈", presentation: "발표", other: "기타 일정" };
const empty = { title: "", event_type: "assignment", description: "", exam_scope: "", date: "", end: "" };
function inputDate(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
function eventTime(row: CourseEvent) {
  const value = row.due_at ?? row.starts_at;
  if (!value) return "일시 미지정";
  const start = new Date(value);
  const date = new Intl.DateTimeFormat("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
  if (!row.ends_at) return date.format(start);
  const end = new Date(row.ends_at);
  const sameDay = start.toDateString() === end.toDateString();
  const endLabel = sameDay
    ? new Intl.DateTimeFormat("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(end)
    : date.format(end);
  return `${date.format(start)} ~ ${endLabel}`;
}

function isPastExam(row: CourseEvent, now: number) {
  return ["exam", "quiz"].includes(row.event_type) && Date.parse(row.ends_at ?? row.starts_at ?? "") <= now;
}

export function CourseEvents({ courseId }: { courseId: string }) {
  const [events, setEvents] = useState<CourseEvent[]>([]);
  const [goalId, setGoalId] = useState("");
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [showCompleted, setShowCompleted] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const completedId = useId();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");
  const busyRef = useRef(false);
  const lifecycle = useRef({ version: 0 });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const state = lifecycle.current;
    const version = ++state.version;
    let request = 0;
    async function load() {
      const revision = ++request;
      try {
        const db = getSupabaseBrowserClient();
        const userId = getStorageUser();
        if (!db || !userId) throw new Error("로그인 후 사용할 수 있습니다.");
        const assertCurrent = captureStorageScope(userId);
        await flushP0Changes();
        assertCurrent();
        if (version !== lifecycle.current.version || revision !== request) return;
        const goals = await db.from("learning_goals").select("id,course_id,metadata")
          .eq("user_id", userId).eq("goal_type", "course").eq("status", "active");
        if (goals.error) throw goals.error;
        assertCurrent();
        const goal = goals.data?.find(row => row.course_id === courseId || row.metadata?.legacy_record?.courseId === courseId);
        if (!goal) throw new Error("수업 동기화 후 다시 열어 주세요.");
        const rows = await db.from("calendar_events").select(columns)
          .eq("user_id", userId).eq("goal_id", goal.id).neq("status", "cancelled").order("created_at", { ascending: false });
        if (rows.error) throw rows.error;
        assertCurrent();
        if (version !== lifecycle.current.version || revision !== request) return;
        setGoalId(goal.id); setEvents(rows.data ?? []); setMessage("");
      } catch (error) {
        if (version === lifecycle.current.version && revision === request) setMessage(error instanceof Error ? error.message : "일정을 불러오지 못했습니다.");
      }
    }
    void load();
    window.addEventListener(COURSE_EVENTS_CHANGED_EVENT, load);
    return () => { state.version++; window.removeEventListener(COURSE_EVENTS_CHANGED_EVENT, load); };
  }, [courseId]);

  function edit(row?: CourseEvent) {
    setEditing(row?.id ?? null);
    setFormError("");
    if (row) {
      setForm({ title: row.title, event_type: row.event_type, description: row.description ?? "", exam_scope: row.exam_scope ?? "", date: inputDate(row.due_at ?? row.starts_at), end: inputDate(row.ends_at) });
    } else {
      const due = new Date(); due.setHours(23, 59, 0, 0);
      setForm({ ...empty, date: inputDate(due.toISOString()) });
    }
    setOpen(true);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busyRef.current || !goalId) return;
    busyRef.current = true; setBusy(true); setFormError("");
    const version = lifecycle.current.version;
    const scope = captureStorageScope();
    const assertCurrent = () => {
      scope();
      if (version !== lifecycle.current.version) throw new Error("수업 화면이 변경되었습니다. 다시 시도해 주세요.");
    };
    try {
      const db = getSupabaseBrowserClient();
      if (!db) throw new Error("다시 로그인해 주세요.");
      const { data, error } = await db.auth.getUser();
      assertCurrent();
      if (error || !data.user || getStorageUser() !== data.user.id) throw new Error("로그인 상태를 확인하지 못했습니다. 다시 시도해 주세요.");
      const title = form.title.trim();
      if (!title) throw new Error("제목을 입력해 주세요.");
      if (!form.date || Number.isNaN(Date.parse(form.date))) throw new Error("일시를 입력해 주세요.");
      const date = new Date(form.date).toISOString();
      const assignment = form.event_type === "assignment";
      const end = form.end ? new Date(form.end).toISOString() : null;
      if (!assignment && (!end || end <= date)) throw new Error("종료 시간은 시작 시간 이후로 설정해 주세요.");
      const payload = { user_id: data.user.id, goal_id: goalId, title, event_type: form.event_type,
        description: form.description.trim(), exam_scope: assignment ? "" : form.exam_scope.trim(),
        due_at: assignment ? date : null, starts_at: assignment ? null : date,
        ends_at: assignment ? null : end, is_blocking: !assignment,
        status: events.find(row => row.id === editing)?.status ?? "scheduled" };
      const query = editing
        ? db.from("calendar_events").update(payload).eq("id", editing).eq("user_id", data.user.id).eq("goal_id", goalId)
        : db.from("calendar_events").insert({ ...payload, metadata: { schema_version: 1, source: "course-event" } });
      const result = await query.select(columns).single();
      if (result.error) throw result.error;
      assertCurrent();
      setEvents(current => [result.data, ...current.filter(row => row.id !== result.data.id)]);
      setOpen(false); setMessage("저장했습니다.");
      window.dispatchEvent(new Event(COURSE_EVENTS_CHANGED_EVENT));
    } catch (error) {
      if (version === lifecycle.current.version) setFormError(error instanceof Error ? error.message : "저장하지 못했습니다.");
    } finally {
      busyRef.current = false;
      if (version === lifecycle.current.version) setBusy(false);
    }
  }

  async function changeStatus(row: CourseEvent, status: string) {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(true); setFormError("");
    const version = lifecycle.current.version;
    const assertCurrent = captureStorageScope();
    try {
      const db = getSupabaseBrowserClient();
      if (!db) throw new Error("다시 로그인해 주세요.");
      const { data, error } = await db.auth.getUser();
      assertCurrent();
      if (version !== lifecycle.current.version) return;
      if (error || !data.user || getStorageUser() !== data.user.id) throw new Error("다시 로그인해 주세요.");
      const result = await db.from("calendar_events").update({ status }).eq("id", row.id).eq("goal_id", goalId).eq("user_id", data.user.id).select("id").single();
      if (result.error) throw result.error;
      assertCurrent();
      if (version !== lifecycle.current.version) return;
      setEvents(current => status === "cancelled" ? current.filter(item => item.id !== row.id) : current.map(item => item.id === row.id ? { ...item, status } : item));
      if (status === "cancelled") setOpen(false);
      setMessage(status === "completed" ? "완료로 기록했습니다." : "변경했습니다.");
      window.dispatchEvent(new Event(COURSE_EVENTS_CHANGED_EVENT));
    } catch (error) {
      if (version === lifecycle.current.version) setFormError(error instanceof Error ? error.message : "변경하지 못했습니다.");
    } finally {
      busyRef.current = false;
      if (version === lifecycle.current.version) setBusy(false);
    }
  }

  const current = events.find(row => row.id === editing);
  const control = "mt-1.5 w-full rounded-lg border bg-white px-3 py-2.5 text-sm";
  const sorted = [...events].sort((a, b) => (a.due_at ?? a.starts_at ?? "9999").localeCompare(b.due_at ?? b.starts_at ?? "9999"));
  const completedEvents = sorted.filter(row => row.status === "completed" || isPastExam(row, now));
  const visibleEvents = sorted.filter(row => row.status !== "completed" && !isPastExam(row, now));

  function eventRow(row: CourseEvent) {
    return <div key={row.id} className="flex items-start gap-2.5 rounded-lg border p-2.5 hover:bg-muted/50">
      {row.event_type === "assignment" && <input
        type="checkbox"
        aria-label={`${row.title} 완료`}
        checked={row.status === "completed"}
        disabled={busy}
        onChange={event => void changeStatus(row, event.target.checked ? "completed" : "scheduled")}
        className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
      />}
      <button type="button" onClick={() => edit(row)} className="min-w-0 flex-1 space-y-0.5 text-left">
        <span className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 text-xs text-muted-foreground">{kinds[row.event_type as keyof typeof kinds] ?? "일정"}</span>
          <span className={`min-w-0 flex-1 truncate text-sm font-medium${row.status === "completed" ? " text-muted-foreground line-through" : ""}`}>{row.title}</span>
          {(row.status === "completed" || isPastExam(row, now)) && <span className="shrink-0 text-xs text-muted-foreground">{row.status === "completed" ? "완료" : "종료"}</span>}
        </span>
        <span className="block text-xs text-muted-foreground">{eventTime(row)}</span>
      </button>
    </div>;
  }

  return <section aria-label="과제·시험 일정" className="space-y-3 rounded-2xl border bg-white p-4">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="flex items-center gap-2 font-semibold"><CalendarDays className="h-4 w-4" />과제·시험 일정</h2>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" aria-expanded={showCompleted} aria-controls={completedId} onClick={() => setShowCompleted(value => !value)}>완료 일정 {completedEvents.length}</Button>
        <Button variant="outline" disabled={!goalId} onClick={() => edit()}><Plus className="h-4 w-4" />일정 추가</Button>
      </div>
    </header>
    {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
    {!open && formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
    {!visibleEvents.length && <p className="py-4 text-center text-sm text-muted-foreground">예정된 과제·시험 일정이 없어요.</p>}
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{visibleEvents.map(eventRow)}</div>
    {showCompleted && <section id={completedId} aria-label="완료 일정" className="space-y-3 border-t pt-4">
      <h3 className="text-sm font-medium">완료·지난 일정</h3>
      {completedEvents.length
        ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{completedEvents.map(eventRow)}</div>
        : <p className="py-3 text-sm text-muted-foreground">완료하거나 종료된 일정이 없어요.</p>}
    </section>}
    <Dialog open={open} onOpenChange={value => { if (!busyRef.current) setOpen(value); }}>
      <DialogContent size="form">
        <DialogHeader><DialogTitle>{editing ? "과제·시험·일정 상세" : "과제·시험·일정 추가"}</DialogTitle></DialogHeader>
        <form onSubmit={event => void save(event)} className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
            <label className="block text-sm">종류<select className={control} value={form.event_type} disabled={busy} onChange={event => setForm({ ...form, event_type: event.target.value })}>
              {Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
            <label className="block text-sm">제목<input className={control} required maxLength={200} disabled={busy} value={form.title} onChange={event => setForm({ ...form, title: event.target.value })} /></label>
          </div>
          <label className="block text-sm">과제 내용·일정 설명<textarea className={control} rows={5} maxLength={10000} disabled={busy} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></label>
          {(form.event_type === "exam" || form.event_type === "quiz") && <label className="block text-sm">시험 범위<textarea className={control} rows={4} maxLength={5000} disabled={busy} value={form.exam_scope} onChange={event => setForm({ ...form, exam_scope: event.target.value })} /></label>}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm">{form.event_type === "assignment" ? "제출 마감" : "시작 일시"}<input className={control} type="datetime-local" required disabled={busy} value={form.date} onChange={event => setForm({ ...form, date: event.target.value })} /></label>
            {form.event_type !== "assignment" && <label className="block text-sm">종료 일시<input className={control} type="datetime-local" required disabled={busy} value={form.end} onChange={event => setForm({ ...form, end: event.target.value })} /></label>}
          </div>
          {current && <label className="flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm font-medium">
            <input type="checkbox" className="size-5 accent-primary" checked={current.status === "completed"} disabled={busy}
              onChange={event => void changeStatus(current, event.target.checked ? "completed" : "scheduled")} />
            {current.event_type === "assignment" ? "과제 완료" : "일정 완료"}
          </label>}
          {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            {current && <>
              <Button type="button" variant="ghost" disabled={busy} onClick={() => void changeStatus(current, "cancelled")}>삭제</Button>

            </>}
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>닫기</Button>
            <Button type="submit" disabled={busy || !goalId}>{busy ? "저장 중…" : "저장"}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </section>;
}
