"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { getStorageUser } from "@/lib/private-storage";
import { flushP0Changes } from "@/lib/p0-sync";

type CourseEvent = {
  id: string; title: string; event_type: string; description: string; exam_scope: string;
  starts_at: string | null; ends_at: string | null; due_at: string | null; status: string;
};
const kinds = { assignment: "과제", exam: "시험", quiz: "퀴즈", presentation: "발표", other: "기타 일정" };
const empty = { title: "", event_type: "assignment", description: "", exam_scope: "", date: "", end: "" };
function inputDate(value: string | null) {
  if (!value) return "";
  const d = new Date(value);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export function CourseEvents({ courseId }: { courseId: string }) {
  const [events, setEvents] = useState<CourseEvent[]>([]);
  const [goalId, setGoalId] = useState("");
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const db = getSupabaseBrowserClient();
        if (!db) throw new Error("로그인과 DB 연결이 필요합니다.");
        const user = (await db.auth.getUser()).data.user;
        if (!user || getStorageUser() !== user.id) throw new Error("로그인 후 사용할 수 있습니다.");
        await flushP0Changes();
        const goals = await db.from("learning_goals").select("id,course_id,metadata").eq("user_id", user.id).eq("goal_type", "course").eq("status", "active");
        if (goals.error) throw goals.error;
        const goal = goals.data?.find((row) => row.course_id === courseId || row.metadata?.legacy_record?.courseId === courseId);
        if (!goal) throw new Error("수업 동기화 후 다시 열어 주세요.");
        const rows = await db.from("calendar_events").select("id,title,event_type,description,exam_scope,starts_at,ends_at,due_at,status")
          .eq("user_id", user.id).eq("goal_id", goal.id).neq("status", "cancelled").order("created_at", { ascending: false });
        if (rows.error) throw rows.error;
        if (active && getStorageUser() === user.id) { setGoalId(goal.id); setEvents(rows.data ?? []); }
      } catch (error) { if (active) setMessage(error instanceof Error ? error.message : "일정을 불러오지 못했습니다."); }
    }
    void load();
    return () => { active = false; };
  }, [courseId]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !goalId) return;
    setBusy(true); setMessage("");
    try {
      const db = getSupabaseBrowserClient()!;
      const user = (await db.auth.getUser()).data.user;
      if (!user || getStorageUser() !== user.id) throw new Error("다시 로그인해 주세요.");
      const date = new Date(form.date).toISOString();
      const end = form.end ? new Date(form.end).toISOString() : null;
      const assignment = form.event_type === "assignment";
      if (!assignment && (!end || end <= date)) throw new Error("종료 시간은 시작 시간 이후로 설정해 주세요.");
      const payload = { user_id: user.id, goal_id: goalId, title: form.title.trim(), event_type: form.event_type,
        description: form.description.trim(), exam_scope: form.exam_scope.trim(),
        due_at: assignment ? date : null, starts_at: assignment ? null : date,
        ends_at: assignment ? null : end, is_blocking: !assignment, status: "scheduled" };
      const query = editing ? db.from("calendar_events").update(payload).eq("id", editing).eq("user_id", user.id).eq("goal_id", goalId)
        : db.from("calendar_events").insert({ ...payload, metadata: { schema_version: 1, source: "course-event" } });
      const result = await query.select("id,title,event_type,description,exam_scope,starts_at,ends_at,due_at,status").single();
      if (result.error) throw result.error;
      if (getStorageUser() !== user.id) return;
      setEvents((current) => [result.data, ...current.filter((row) => row.id !== result.data.id)]);
      setForm(empty); setEditing(null); setMessage("저장했습니다. 이 수업을 선택해 AI 계획을 만들면 과제 내용·시험 범위·일정이 반영됩니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  }

  async function changeStatus(row: CourseEvent, status: string) {
    if (busy) return;
    setBusy(true);
    try {
      const db = getSupabaseBrowserClient()!;
      const user = (await db.auth.getUser()).data.user;
      if (!user || getStorageUser() !== user.id) throw new Error("다시 로그인해 주세요.");
      const result = await db.from("calendar_events").update({ status }).eq("id", row.id).eq("goal_id", goalId).eq("user_id", user.id).select("id").single();
      if (result.error) throw result.error;
      if (getStorageUser() !== user.id) return;
      setEvents((current) => status === "cancelled" ? current.filter((item) => item.id !== row.id) : current.map((item) => item.id === row.id ? { ...item, status } : item));
      if (editing === row.id) { setEditing(null); setForm(empty); }
      setMessage("변경했습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "변경하지 못했습니다."); }
    finally { setBusy(false); }
  }
  const control = "w-full rounded-md border bg-white p-2 text-sm";
  return <div className="grid gap-6 lg:grid-cols-2">
    <form onSubmit={(event) => void save(event)} className="space-y-4 rounded-xl border bg-white p-5">
      <h2 className="font-semibold">{editing ? "과제·시험·일정 수정" : "과제·시험·일정 추가"}</h2>
      <label className="block text-sm">종류<select className={control} value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })}>
        {Object.entries(kinds).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label className="block text-sm">제목<input className={control} required maxLength={200} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <label className="block text-sm">과제 내용·일정 설명<textarea className={control} rows={4} maxLength={10000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
      {(form.event_type === "exam" || form.event_type === "quiz") && <label className="block text-sm">시험 범위<textarea className={control} rows={3} maxLength={5000} placeholder="예: 3~5장, 프로세스 동기화와 교착상태" value={form.exam_scope} onChange={(e) => setForm({ ...form, exam_scope: e.target.value })} /></label>}
      <label className="block text-sm">{form.event_type === "assignment" ? "제출 마감" : "시작 일시"}<input className={control} type="datetime-local" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></label>
      {form.event_type !== "assignment" && <label className="block text-sm">종료 일시<input className={control} type="datetime-local" required value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></label>}
      <p className="text-xs text-muted-foreground">과제는 마감 전 학습에, 시험·일정은 준비 계획과 시간 충돌 방지에 사용됩니다. 날짜는 현재 기기의 시간대 기준입니다.</p>
      <button className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={busy || !goalId}>{busy ? "처리 중…" : "저장"}</button>
      {editing && <button type="button" className="ml-3 text-sm" onClick={() => { setEditing(null); setForm(empty); }}>수정 취소</button>}
      <p role="status" className="text-sm">{message}</p>
    </form>
    <div className="space-y-3">
      {!events.length && <p className="p-5 text-sm text-muted-foreground">등록한 과제·시험·일정이 없습니다.</p>}
      {events.map((row) => <article key={row.id} className="space-y-2 rounded-xl border bg-white p-5">
        <p className="text-xs text-muted-foreground">{kinds[row.event_type as keyof typeof kinds] ?? "일정"} · {row.status === "completed" ? "완료" : "예정"}</p>
        <h3 className="font-semibold">{row.title}</h3>
        <p className="text-sm">{new Date((row.due_at ?? row.starts_at)!).toLocaleString("ko-KR")}{row.ends_at && ` ~ ${new Date(row.ends_at).toLocaleString("ko-KR")}`}</p>
        <p className="whitespace-pre-wrap text-sm">{row.description}</p>
        {row.exam_scope && <p className="whitespace-pre-wrap text-sm"><strong>시험 범위: </strong>{row.exam_scope}</p>}
        <div className="flex gap-4 text-sm">
          <button type="button" disabled={busy} onClick={() => { setEditing(row.id); setForm({ title: row.title, event_type: row.event_type, description: row.description, exam_scope: row.exam_scope, date: inputDate(row.due_at ?? row.starts_at), end: inputDate(row.ends_at) }); }}>수정</button>
          <button type="button" disabled={busy} onClick={() => void changeStatus(row, row.status === "completed" ? "scheduled" : "completed")}>{row.status === "completed" ? "완료 취소" : "완료"}</button>
          <button type="button" disabled={busy} onClick={() => void changeStatus(row, "cancelled")}>삭제</button>
        </div>
      </article>)}
    </div>
  </div>;
}
