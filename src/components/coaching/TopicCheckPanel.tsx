"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, ListChecks, RefreshCw } from "lucide-react";
import { getSupabaseBrowserClient } from "@/lib/supabase-client";
import { getStorageUser } from "@/lib/private-storage";
import { describeFunctionError } from "@/lib/supabase/function-error";

type Question = { id: number; prompt: string; options: string[] };
type Check = { id: string; status: string; questions: Question[]; created_at: string; error_message: string | null; evidence: { note_title: string; page: number } };
type Result = { question_id: number; selected_index: number; correct_index: number; is_correct: boolean; explanation: string; evidence_quote: string };
type Attempt = { id: string; correct_count: number; question_count: number; results: Result[]; created_at: string; voided_at: string | null };

export function TopicCheckPanel({ topicId, disabled, onPendingChange }: { topicId: string; disabled: boolean; onPendingChange?: (delta: number) => void }) {
  const [check, setCheck] = useState<Check | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState("");
  const [revision, setRevision] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const requestId = useRef<string | null>(null);
  const currentCheckId = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      const db = getSupabaseBrowserClient();
      const user = db ? (await db.auth.getUser()).data.user : null;
      if (!db || !user || getStorageUser() !== user.id) throw new Error("로그인 후 사용할 수 있습니다.");
      const row = await db.from("topic_checks").select("id,status,questions,evidence,created_at,error_message").eq("user_id", user.id).eq("topic_id", topicId)
        .order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle();
      if (row.error) throw new Error("확인 문제를 불러오지 못했습니다. 서비스 배포 상태를 확인해 주세요.");
      const result = row.data ? await db.from("topic_check_attempts").select("id,correct_count,question_count,results,created_at,voided_at").eq("user_id", user.id).eq("check_id", row.data.id).maybeSingle() : { data: null, error: null };
      if (result.error) throw new Error("채점 결과를 불러오지 못했습니다.");
      if (!active || getStorageUser() !== user.id) return;
      if (currentCheckId.current !== row.data?.id) setAnswers({});
      currentCheckId.current = row.data?.id ?? null;
      setCheck(row.data);
      setAttempt(result.data); setLoaded(true);
      setTimedOut(Boolean(row.data?.status === "processing" && Date.now() - Date.parse(row.data.created_at) > 120000));
      if (row.data?.status === "failed") requestId.current = null;
    }
    void load().catch((e) => { if (active) { setMessage(e.message); setLoaded(false); } });
    return () => { active = false; };
  }, [topicId, revision]);
  const processing = check?.status === "processing" && !timedOut;
  useEffect(() => {
    if (!processing) return;
    const timer = window.setInterval(() => setRevision((n) => n + 1), 3000);
    return () => window.clearInterval(timer);
  }, [processing]);

  async function act(kind: "generate" | "submit" | "void") {
    if (busy || disabled || !loaded) return;
    setBusy(true); setMessage(""); onPendingChange?.(1);
    try {
      const db = getSupabaseBrowserClient();
      const user = db ? (await db.auth.getUser()).data.user : null;
      if (!db || !user || getStorageUser() !== user.id) throw new Error("다시 로그인해 주세요.");
      if (kind === "generate") {
        if (timedOut) requestId.current = null;
        requestId.current ??= crypto.randomUUID();
        const r = await db.functions.invoke("topic-check", { body: { topicId, requestId: requestId.current, consent } });
        if (r.error) throw new Error(await describeFunctionError(r.error, "문제를 생성하지 못했습니다."));
        requestId.current = null;
      } else if (kind === "void") {
        if (!check || !attempt) return;
        const r = await db.rpc("void_topic_check", { p_check: check.id });
        if (r.error) throw new Error(r.error.message);
        if (getStorageUser() === user.id) setMessage("문항 오류를 신고한 결과는 코칭 근거에서 제외했습니다.");
      } else {
        if (!check || check.questions.some((q) => answers[q.id] === undefined)) throw new Error("세 문항에 모두 답해 주세요.");
        const r = await db.rpc("submit_topic_check", { p_check: check.id, p_answers: check.questions.map((q) => answers[q.id]) });
        if (r.error) throw new Error(r.error.message);
        if (getStorageUser() === user.id) setMessage("채점 결과를 저장했습니다. 다음 AI 계획에 반영됩니다.");
      }
      if (getStorageUser() === user.id) setRevision((n) => n + 1);
    } catch (e) { if (getStorageUser()) setMessage(e instanceof Error ? e.message : "요청하지 못했습니다."); }
    finally { setBusy(false); onPendingChange?.(-1); }
  }
  return <section className="border-t pt-3" aria-label="주제 확인 문제">
    <h5 className="flex items-center gap-2 text-sm font-semibold"><ListChecks size={16} />이해도 확인</h5>
    {check?.status === "ready" && <>
      <p className="mt-2 text-xs text-muted-foreground">{check.evidence.note_title} · {check.evidence.page}쪽 근거</p>
      <fieldset disabled={busy || disabled || !!attempt} className="mt-3 space-y-4">
        {check.questions.map((q) => { const result = attempt?.results.find((r) => r.question_id === q.id); return <div key={q.id} className="space-y-2">
          <p className="break-words text-sm font-medium">{q.id}. {q.prompt}</p>
          <div className="space-y-1">{q.options.map((option, i) => <label key={i} style={{ flexDirection: "row", alignItems: "flex-start", minWidth: 0 }} className={`flex cursor-pointer items-start gap-2 rounded border p-2 text-xs ${answers[q.id] === i || result?.selected_index === i ? "border-emerald-600 bg-emerald-50" : "bg-white"}`}>
            <input type="radio" name={`check-${check.id}-${q.id}`} checked={(result?.selected_index ?? answers[q.id]) === i} onChange={() => setAnswers((a) => ({ ...a, [q.id]: i }))} className="mt-0.5 h-4 w-4 shrink-0" style={{ width: 16, height: 16, flex: "0 0 16px", padding: 0 }} />
            <span className="min-w-0 break-words">{i + 1}. {option}</span>
          </label>)}</div>
          {result && <div className="space-y-1 text-xs"><p className={result.is_correct ? "text-emerald-800" : "text-red-700"}>{result.is_correct ? "정답" : `오답 · 정답 ${result.correct_index + 1}번`}</p><p className="break-words">{result.explanation}</p><blockquote className="break-words border-l-2 pl-2 text-muted-foreground">{result.evidence_quote}</blockquote></div>}
        </div>; })}
      </fieldset>
      {!attempt && <button type="button" className="mt-3 inline-flex items-center gap-2 rounded bg-primary px-3 py-2 text-xs text-primary-foreground disabled:opacity-50" disabled={busy || disabled || check.questions.some((q) => answers[q.id] === undefined)} onClick={() => void act("submit")}><CheckCircle2 size={14} />{busy ? "저장 중" : "제출하고 채점"}</button>}
    </>}
    {attempt && <div className="mt-3 space-y-2"><p className="text-sm font-medium">문제풀이 {attempt.correct_count}/{attempt.question_count} · {new Date(attempt.created_at).toLocaleString("ko-KR")}{attempt.voided_at ? " · 코칭 반영 제외" : ""}</p>
      {!attempt.voided_at && <button type="button" className="text-xs text-red-700 underline disabled:opacity-50" disabled={busy || disabled} onClick={() => void act("void")}>문항 오류로 코칭 반영 제외</button>}</div>}
    {check?.status === "failed" && <p role="alert" className="mt-2 text-xs text-red-700">{check.error_message}</p>}
    {processing && <p role="status" className="mt-2 text-xs">문제를 생성하고 있습니다.</p>}
    {timedOut && <p className="mt-2 text-xs">생성이 지연되거나 중단되었습니다. 다시 시도해 주세요.</p>}
    {(!check || attempt || check.status === "failed" || timedOut) && <div className="mt-3 space-y-2">
      <label className="flex items-start gap-2 text-xs" style={{ flexDirection: "row", alignItems: "flex-start" }}><input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} disabled={busy || disabled} className="h-4 w-4 shrink-0" style={{ width: 16, height: 16, flex: "0 0 16px", padding: 0 }} /><span>주제와 저장된 노트 근거를 OpenAI에 전송하는 데 동의합니다.</span></label>
      <button type="button" className="inline-flex items-center gap-2 rounded border px-3 py-2 text-xs disabled:opacity-50" disabled={!loaded || busy || disabled || !consent} onClick={() => void act("generate")}><RefreshCw size={14} />{busy ? "시작 중" : attempt ? "새 확인 문제" : "확인 문제 3개 생성"}</button>
    </div>}
    <p className="mt-2 text-xs text-muted-foreground">AI 생성 연습문제 결과이며 자기평가와 별도로 기록됩니다. 문항 범위 밖의 이해도를 보장하지 않습니다.</p>
    <p role="status" className="mt-2 text-xs">{message}</p>
  </section>;
}
