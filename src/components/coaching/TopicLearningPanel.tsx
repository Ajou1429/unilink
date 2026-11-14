"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { getStorageUser } from "@/lib/private-storage";
import { flushP0Changes } from "@/lib/p0-sync";
import { TopicCheckPanel } from "./TopicCheckPanel";
import { SELF_RATING_NAMES } from "../../../supabase/functions/_shared/learningScales.ts";

type Goal = { id: string; title: string; course_id: string | null; metadata: { legacy_record?: { courseId?: string } } };
type Topic = { id: string; goal_id: string; title: string };
type Observation = { id: string; topic_id: string; learning_status: string; self_rating: number | null; memo: string; observed_at: string; note_id: string | null; session_id: string | null; page_start: number | null; page_end: number | null };
type Session = { id: string; course_id: string; session_date: string; memo: string | null };
type Note = { id: string; title: string };
const statusLabels: Record<string, string> = { not_started: "미학습", in_progress: "학습 중", needs_review: "복습 필요", understood: "이해함" };

function TopicEditor({ topic, state, sessions, notes, onSaved, disabled, onPendingChange }: { topic: Topic; state?: Observation; sessions: Session[]; notes: Note[]; onSaved: () => void; disabled: boolean; onPendingChange?: (delta: number) => void }) {
  const [status, setStatus] = useState(state?.learning_status ?? "in_progress");
  const [rating, setRating] = useState(state?.self_rating ? String(state.self_rating) : "");
  const [memo, setMemo] = useState(state?.memo ?? "");
  const [sessionId, setSessionId] = useState(state?.session_id ?? "");
  const [noteId, setNoteId] = useState(state?.note_id ?? "");
  const [start, setStart] = useState(state?.page_start ? String(state.page_start) : "");
  const [end, setEnd] = useState(state?.page_end ? String(state.page_end) : "");
  const [observedAt, setObservedAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [expanded, setExpanded] = useState(false);
  const pendingRequest = useRef<{ signature: string; id: string; at: string } | null>(null);
  async function save() {
    if (busy || disabled) return;
    setBusy(true); setMessage(""); onPendingChange?.(1);
    try {
      const db = getSupabaseBrowserClient();
      const user = db ? (await db.auth.getUser()).data.user : null;
      if (!db || !user || getStorageUser() !== user.id) throw new Error("다시 로그인해 주세요.");
      const signature = JSON.stringify({ status, rating, memo, observedAt, sessionId, noteId, start, end });
      if (pendingRequest.current?.signature !== signature) pendingRequest.current = { signature, id: crypto.randomUUID(), at: observedAt ? new Date(observedAt).toISOString() : new Date().toISOString() };
      const result = await db.rpc("record_topic_observation", {
        p_topic: topic.id, p_status: status, p_rating: status === "not_started" || !rating ? null : Number(rating), p_memo: memo,
        p_observed_at: pendingRequest.current.at,
        p_session: sessionId || null, p_note: noteId || null,
        p_page_start: noteId && start ? Number(start) : null, p_page_end: noteId && end ? Number(end) : null, p_request: pendingRequest.current.id,
      });
      if (result.error) throw result.error;
      if (getStorageUser() !== user.id) return;
      pendingRequest.current = null;
      setMessage("학습 상태를 저장했습니다."); onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : "기록하지 못했습니다."); }
    finally { setBusy(false); onPendingChange?.(-1); }
  }
  const control = "mt-1 w-full rounded border bg-white px-2 py-1.5 text-xs";
  return <details className="rounded-lg border bg-white p-3" onToggle={(e) => setExpanded(e.currentTarget.open)}>
    <summary className="cursor-pointer text-sm"><strong>{topic.title}</strong><span className="ml-2 text-xs text-muted-foreground">{state ? statusLabels[state.learning_status] : "미입력"}{state?.self_rating ? ` · 자기평가 ${state.self_rating}/5` : ""}</span></summary>
    <fieldset disabled={busy || disabled} className="mt-3 space-y-3">
      {state && <p className="text-xs text-muted-foreground">마지막 관측: {new Date(state.observed_at).toLocaleString("ko-KR")} · 수정 기록은 새 이력으로 보존됩니다.</p>}
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs">학습 상태<select className={control} value={status} onChange={(e) => { setStatus(e.target.value); if (e.target.value === "not_started") setRating(""); }}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-xs">자기 이해도<select className={control} value={rating} disabled={status === "not_started"} onChange={(e) => setRating(e.target.value)}><option value="">미평가</option>{SELF_RATING_NAMES.map((label, index) => <option key={index} value={index + 1}>{index + 1} · {label}</option>)}</select></label>
      </div>
      <label className="block text-xs">학습 메모<textarea className={control} maxLength={1000} rows={2} value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="예: 개념은 이해했지만 계산 문제에서 막힘" /></label>
      <details><summary className="cursor-pointer text-xs text-muted-foreground">수업 회차·노트·페이지 연결 (선택)</summary>
        <div className="mt-2 space-y-2">
          {sessions.length > 0 && <label className="block text-xs">수업 회차<select className={control} value={sessionId} onChange={(e) => setSessionId(e.target.value)}><option value="">연결 안 함</option>{sessions.map((s) => <option key={s.id} value={s.id}>{s.session_date} · {s.memo?.slice(0, 50) || "수업"}</option>)}</select></label>}
          <label className="block text-xs">관련 노트<select className={control} value={noteId} onChange={(e) => { setNoteId(e.target.value); setStart(""); setEnd(""); }}><option value="">연결 안 함</option>{notes.map((n) => <option key={n.id} value={n.id}>{n.title}</option>)}</select></label>
          {noteId && <div className="grid grid-cols-2 gap-2"><label className="text-xs">시작 페이지<input className={control} type="number" min={1} step={1} value={start} onChange={(e) => setStart(e.target.value)} /></label><label className="text-xs">끝 페이지<input className={control} type="number" min={1} step={1} value={end} onChange={(e) => setEnd(e.target.value)} /></label></div>}
          <label className="block text-xs">기록 시각 (미입력 시 현재)<input className={control} type="datetime-local" value={observedAt} onChange={(e) => setObservedAt(e.target.value)} /></label>
        </div>
      </details>
      <button type="button" className="rounded bg-primary px-3 py-2 text-xs text-primary-foreground" onClick={() => void save()}>{busy ? "저장 중…" : "학습 상태 저장"}</button>
      <p role="status" className="text-xs">{message}</p>
    </fieldset>
    {expanded && <TopicCheckPanel topicId={topic.id} disabled={disabled || busy} onPendingChange={onPendingChange} />}
  </details>;
}

export function TopicLearningPanel({ goalIds, courseId, disabled = false, onPendingChange }: { goalIds?: string[]; courseId?: string; disabled?: boolean; onPendingChange?: (delta: number) => void }) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [states, setStates] = useState<Observation[]>([]);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [newTopic, setNewTopic] = useState("");
  const [topicGoal, setTopicGoal] = useState("");
  const [saving, setSaving] = useState(false);
  const key = (goalIds ?? []).join(",");
  useEffect(() => {
    let active = true;
    async function load() {
      const db = getSupabaseBrowserClient();
      const user = db ? (await db.auth.getUser()).data.user : null;
      if (!db || !user || getStorageUser() !== user.id) throw new Error("로그인 후 사용할 수 있습니다.");
      await flushP0Changes();
      const available = await db.from("learning_goals").select("id,title,course_id,metadata").eq("user_id", user.id).eq("status", "active");
      if (available.error) throw available.error;
      const ids = key.split(",").filter(Boolean);
      const chosen: Goal[] = (available.data ?? []).filter((g) => courseId ? g.course_id === courseId || g.metadata?.legacy_record?.courseId === courseId : ids.includes(g.id));
      if (!active || getStorageUser() !== user.id) return;
      setGoals(chosen); setMessage("");
      if (!chosen.length) { setTopics([]); setStates([]); setNotes([]); setSessions([]); return; }
      const goalKeys = chosen.map((g) => g.id), courses = chosen.flatMap((g) => g.course_id ? [g.course_id] : []);
      const [topicRows, stateRows, noteRows, sessionRows] = await Promise.all([
        db.from("goal_topics").select("id,goal_id,title").eq("user_id", user.id).in("goal_id", goalKeys).eq("status", "confirmed").order("created_at").limit(201),
        db.from("topic_learning_states").select("id,topic_id,learning_status,self_rating,memo,observed_at,note_id,session_id,page_start,page_end").eq("user_id", user.id).in("goal_id", goalKeys).limit(201),
        db.from("notes").select("id,title").eq("user_id", user.id).order("updated_at", { ascending: false }).limit(100),
        courses.length ? db.from("active_course_sessions").select("id,course_id,session_date,memo").eq("user_id", user.id).in("course_id", courses).order("session_date", { ascending: false }).limit(100) : Promise.resolve({ data: [], error: null }),
      ]);
      if ([topicRows, stateRows, noteRows, sessionRows].some((r) => r.error)) throw new Error("학습 상태를 불러오지 못했습니다.");
      if (!active || getStorageUser() !== user.id) return;
      setTopics(topicRows.data ?? []); setStates(stateRows.data ?? []); setNotes(noteRows.data ?? []); setSessions(sessionRows.data ?? []);
      if ((topicRows.data?.length ?? 0) > 200) setMessage("주제가 많습니다. 과목을 나누어 확인해 주세요.");
    }
    void load().catch((e) => { if (active) setMessage(e.message); });
    return () => { active = false; };
  }, [key, courseId, revision]);
  async function addTopic() {
    const target = goals.some((g) => g.id === topicGoal) ? topicGoal : goals[0]?.id;
    if (!newTopic.trim() || !target || saving || disabled) return;
    setSaving(true); onPendingChange?.(1);
    try {
      const db = getSupabaseBrowserClient();
      const user = db ? (await db.auth.getUser()).data.user : null;
      if (!db || !user || getStorageUser() !== user.id) throw new Error("다시 로그인해 주세요.");
      const result = await db.from("goal_topics").insert({ user_id: user.id, goal_id: target, title: newTopic.trim(), source_type: "user", metadata: { schema_version: 1 } });
      if (result.error) throw result.error;
      if (getStorageUser() !== user.id) return;
      setNewTopic(""); setRevision((n) => n + 1);
    } catch (e) { setMessage(e instanceof Error ? e.message : "주제를 추가하지 못했습니다."); }
    finally { setSaving(false); onPendingChange?.(-1); }
  }
  return <section className="space-y-3 rounded-lg border p-4" aria-label="진도와 이해도">
    <h3 className="text-sm font-semibold">진도와 이해도</h3>
    <p className="text-xs text-muted-foreground">주제를 눌러 현재 상태를 기록하세요. 미입력은 미학습과 구분하며, 자기평가는 문제풀이 점수가 아닙니다.</p>
    {!goals.length && <p className="text-xs">수업·학습 목표를 선택하면 주제를 확인할 수 있습니다.</p>}
    {goals.map((goal) => <section key={goal.id} className="space-y-2">
      <h4 className="text-xs font-semibold">{goal.title}</h4>
      {topics.filter((t) => t.goal_id === goal.id).map((topic) => { const state = states.find((s) => s.topic_id === topic.id); return <TopicEditor key={`${topic.id}:${state?.id ?? "new"}`} topic={topic} state={state} sessions={sessions.filter((s) => s.course_id === goal.course_id)} notes={notes} disabled={disabled} onPendingChange={onPendingChange} onSaved={() => setRevision((n) => n + 1)} />; })}
      {!topics.some((t) => t.goal_id === goal.id) && <p className="text-xs text-muted-foreground">주제가 없습니다. PDF 분석 결과에서 주제를 등록하거나 아래에서 추가하세요.</p>}
    </section>)}
    {!!goals.length && <details><summary className="cursor-pointer text-xs">학습 주제 직접 추가</summary><div className="mt-2 flex flex-wrap gap-2">
      {goals.length > 1 && <select className="rounded border p-2 text-xs" value={topicGoal || goals[0].id} onChange={(e) => setTopicGoal(e.target.value)}>{goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select>}
      <input aria-label="새 학습 주제" className="min-w-0 flex-1 rounded border p-2 text-xs" value={newTopic} maxLength={200} onChange={(e) => setNewTopic(e.target.value)} placeholder="학습 주제" />
      <button type="button" className="text-xs" disabled={saving || disabled} onClick={() => void addTopic()}>추가</button>
    </div></details>}
    <p role="status" className="text-xs">{message}</p>
  </section>;
}
