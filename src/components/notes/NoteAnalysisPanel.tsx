"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { getStorageUser } from "@/lib/private-storage";
import { flushP0Changes } from "@/lib/p0-sync";
import { describeFunctionError } from "@/lib/supabase/function-error";
import type { MyNote } from "@/lib/my-notes-storage";

type Analysis = { id: string; status: string; summary: string; error_message: string | null; note_version: number; note_updated_at: string; created_at: string };
type Candidate = { id: string; kind: string; title: string; description: string; exam_scope: string; date_text: string; status: string };
type Goal = { id: string; title: string; course_id: string | null; metadata: { legacy_record?: { courseId?: string } } };
const labels: Record<string, string> = { topic: "강의 내용", assignment: "과제", exam: "시험" };

function CandidateEditor({ candidate, goalId, disabled, onSaved }: { candidate: Candidate; goalId: string; disabled: boolean; onSaved: () => void }) {
  const [title, setTitle] = useState(candidate.title);
  const [description, setDescription] = useState(candidate.description);
  const [scope, setScope] = useState(candidate.exam_scope);
  const [at, setAt] = useState("");
  const [end, setEnd] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  async function confirm(reject: boolean) {
    if (busy || disabled) return;
    if (!reject && (!goalId || !title.trim() || (candidate.kind !== "topic" && !at) || (candidate.kind === "exam" && (!end || end <= at)))) {
      setMessage("목표와 제목, 필요한 시작·마감 및 종료 시간을 확인해 주세요."); return;
    }
    setBusy(true); setMessage("");
    try {
      const db = getSupabaseBrowserClient();
      const user = db ? (await db.auth.getUser()).data.user : null;
      if (!db || !user || getStorageUser() !== user.id) throw new Error("다시 로그인해 주세요.");
      const result = await db.rpc("confirm_note_candidate", { p_candidate: candidate.id, p_goal: goalId || null,
        p_title: title, p_description: description, p_scope: scope,
        p_at: at ? new Date(at).toISOString() : null, p_end: end ? new Date(end).toISOString() : null, p_reject: reject });
      if (result.error) throw result.error;
      if (getStorageUser() !== user.id) return;
      setMessage(reject ? "제외했습니다." : "등록했습니다. 이 목표의 AI 계획에서 활용됩니다.");
      window.dispatchEvent(new Event("unilink:courseEventsChanged"));
      onSaved();
    } catch (error) { setMessage(error instanceof Error ? error.message : "등록하지 못했습니다."); }
    finally { setBusy(false); }
  }
  const control = "mt-1 w-full rounded border bg-white p-2 text-sm";
  return <article className="space-y-3 rounded-lg border p-4">
    <div className="flex items-start justify-between gap-3">
      <h5 className="text-sm font-semibold">{title}</h5>
      <span className="shrink-0 text-xs text-muted-foreground">{candidate.status === "accepted" ? "등록됨" : candidate.status === "rejected" ? "제외됨" : "검토 필요"}</span>
    </div>
    {candidate.status === "pending" && <fieldset disabled={disabled || busy} className="space-y-3">
      <details className="space-y-2"><summary className="cursor-pointer text-xs text-muted-foreground">내용 수정</summary>
        <label className="block text-sm">소제목<input className={control} maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="block text-sm">등록할 내용<textarea className={control} maxLength={3000} value={description} onChange={(e) => setDescription(e.target.value)} /></label>
        {candidate.kind === "exam" && <label className="block text-sm">시험 범위<textarea className={control} maxLength={2000} value={scope} onChange={(e) => setScope(e.target.value)} /></label>}
      </details>
      {candidate.kind !== "topic" && <>
        <p className="text-sm">문서의 날짜 표현: {candidate.date_text || "확인되지 않음"}</p>
        <label className="block text-sm">{candidate.kind === "assignment" ? "확인한 제출 마감" : "확인한 시험 시작"}<input className={control} type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} /></label>
        {candidate.kind === "exam" && <label className="block text-sm">확인한 시험 종료<input className={control} type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} /></label>}
        <p className="text-xs text-muted-foreground">연도·날짜·시간을 직접 확인해 입력하세요. 현재 기기의 시간대를 사용합니다.</p>
      </>}
      <div className="flex gap-4 text-sm"><button type="button" disabled={!goalId} className="rounded bg-primary px-3 py-2 text-primary-foreground disabled:opacity-50" onClick={() => void confirm(false)}>확인하고 등록</button>
        <button type="button" onClick={() => void confirm(true)}>제외</button></div>
    </fieldset>}
    <p role="status" className="text-sm">{message}</p>
  </article>;
}

export function NoteAnalysisPanel({ note }: { note: MyNote }) {
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalId, setGoalId] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    let active = true;
    const db = getSupabaseBrowserClient();
    async function load() {
      if (!db) return;
      const user = (await db.auth.getUser()).data.user;
      if (!user || getStorageUser() !== user.id) return;
      const [result, available] = await Promise.all([
        db.from("note_analyses").select("id,status,summary,error_message,note_version,note_updated_at,created_at").eq("note_id", note.id).eq("user_id", user.id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        db.from("learning_goals").select("id,title,course_id,metadata").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }).limit(100),
      ]);
      if (!active || getStorageUser() !== user.id) return;
      if (result.error || available.error) throw new Error("분석 결과를 불러오지 못했습니다.");
      setAnalysis(result.data); setGoals(available.data ?? []);
      setTimedOut(Boolean(result.data && Date.now() - Date.parse(result.data.created_at) >= 240000));
      setGoalId((current) => current || available.data?.find((g) => g.id === note.linkedId || g.course_id === note.linkedId || g.metadata?.legacy_record?.courseId === note.linkedId)?.id || "");
      if (result.data?.status === "completed") {
        const rows = await db.from("note_analysis_candidates").select("id,kind,title,description,exam_scope,date_text,status").eq("analysis_id", result.data.id).eq("user_id", user.id).order("page");
        if (rows.error) throw new Error("추출 후보를 불러오지 못했습니다.");
        if (active && getStorageUser() === user.id) setCandidates(rows.data ?? []);
      } else setCandidates([]);
    }
    void load().catch((error) => { if (active) setMessage(error.message); });
    return () => { active = false; };
  }, [note.id, note.linkedId, revision]);
  const processing = analysis?.status === "processing" && !timedOut;
  useEffect(() => {
    if (!processing) return;
    const timer = window.setInterval(() => setRevision((n) => n + 1), 4000);
    return () => window.clearInterval(timer);
  }, [processing]);
  async function start() {
    if (busy) return;
    setBusy(true); setMessage("");
    try {
      const db = getSupabaseBrowserClient();
      if (!db) throw new Error("로그인이 필요합니다.");
      await flushP0Changes();
      const result = await db.functions.invoke("note-analyze", { body: { noteId: note.id, consent } });
      if (result.error) throw new Error(await describeFunctionError(result.error, "분석을 시작하지 못했습니다."));
      setRevision((n) => n + 1);
    } catch (error) { setMessage(error instanceof Error ? error.message : "분석을 시작하지 못했습니다."); }
    finally { setBusy(false); }
  }
  const stale = Boolean(analysis && (analysis.note_version !== note.version || Date.parse(analysis.note_updated_at) !== Date.parse(note.updatedAt)));
  return <section className="space-y-4 rounded-lg border p-4" aria-label="자료 분석 및 등록">
    <h3 className="font-semibold">자료에서 수업 주제·과제·시험 찾기</h3>
    <p className="text-xs text-muted-foreground">PDF 분석 · 최대 20MB / 50페이지 · 하루 최대 5회</p>
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />이 PDF를 OpenAI에 전송해 분석하는 데 동의합니다.</label>
    <button type="button" className="rounded bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50" disabled={busy || processing || !consent} onClick={() => void start()}>{busy ? "시작 중…" : processing ? "분석 중…" : "PDF 분석하기"}</button>
    <p role="status" className="text-sm">{message || (processing ? "분석 결과는 저장됩니다. 노트를 다시 열어도 진행 상태를 확인할 수 있습니다." : "")}</p>
    {stale && <p className="text-sm text-amber-700">자료가 변경되었습니다. 새로 분석한 결과를 확인해 주세요.</p>}
    {analysis?.status === "failed" && <p role="alert" className="text-sm text-red-700">{analysis.error_message}</p>}
    {analysis?.status === "processing" && !processing && <p className="text-sm">처리가 지연되거나 중단되었습니다. 분석을 다시 시도해 주세요.</p>}
    {analysis?.status === "completed" && <>
      <label className="block text-sm">등록할 수업·학습 목표<select className="ml-2 rounded border p-2" value={goalId} onChange={(e) => setGoalId(e.target.value)}><option value="">목표를 선택하세요</option>{goals.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select></label>
      {!candidates.length && <p className="text-sm">명확한 추출 후보가 없습니다. 필요한 내용을 수업에서 직접 등록해 주세요.</p>}
      {Object.entries(labels).map(([kind, label]) => {
        const items = candidates.filter((c) => c.kind === kind);
        if (!items.length) return null;
        return <section key={kind} aria-label={label} className="space-y-3">
          <h4 className="font-semibold">{label} <span className="text-xs font-normal text-muted-foreground">{items.length}</span></h4>
          {items.map((c) => <CandidateEditor key={c.id} candidate={c} goalId={goalId} disabled={stale} onSaved={() => setRevision((n) => n + 1)} />)}
        </section>;
      })}
    </>}
  </section>;
}
