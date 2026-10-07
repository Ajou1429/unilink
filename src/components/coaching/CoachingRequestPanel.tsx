"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-client";
import { describeFunctionError } from "@/lib/supabase/function-error";
import { flushP0Changes } from "@/lib/p0-sync";
import { getStorageUser } from "@/lib/private-storage";
import styles from "@/app/(dashboard)/ai-coaching/workspace.module.css";

type Goal = { id: string; title: string };
type Item = { goal_id: string; topic_id: string | null; method_code: string; title: string; planned_date: string; start_time: string; planned_minutes: number; reason: string };
type Proposal = { summary: string; items: Item[]; deferred_goals: { goal_id: string; reason: string; reconsider_on: string }[] };
type Result = { schema_version: number; proposal: Proposal; persisted: boolean; proposal_run_id?: string; proposal_persisted?: boolean };

const intents = [
  ["weekly_plan", "이번 주 계획"], ["daily_plan", "오늘 계획"], ["exam_prep", "시험 대비"],
  ["topic_review", "단원 복습"], ["progress_check", "학습 상태 점검"],
] as const;
const coachingEnabled = process.env.NEXT_PUBLIC_COACHING_ENABLED === "true";

function localDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function planDates(intent: (typeof intents)[number][0]): string[] {
  const length = intent === "daily_plan" ? 1 : intent === "exam_prep" ? 14 : 7;
  const today = new Date();
  return Array.from({ length }, (_, offset) => {
    const date = new Date(today);
    date.setDate(today.getDate() + offset);
    return localDate(date);
  });
}

export function CoachingRequestPanel() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [intent, setIntent] = useState<(typeof intents)[number][0]>("weekly_plan");
  const [dailyMinutes, setDailyMinutes] = useState(120);
  const [requestNote, setRequestNote] = useState("");
  const [status, setStatus] = useState(isSupabaseConfigured() ? "DB 목표를 불러오는 중입니다." : "Supabase 연결 설정이 필요합니다.");
  const [busy, setBusy] = useState(false);
  const [approving, setApproving] = useState(false);
  const [approvedPlanId, setApprovedPlanId] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  useEffect(() => {
    const db = getSupabaseBrowserClient();
    if (!db) return;
    let active = true;
    async function load() {
      const user = (await db!.auth.getUser()).data.user;
      if (!active) return;
      if (!user || getStorageUser() !== user.id) { setStatus("로그인 후 코칭 제안을 받을 수 있습니다."); return; }
      const goalResult = await db!.from("learning_goals").select("id,title").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }).limit(100);
      if (!active) return;
      if (goalResult.error) { setStatus("DB 목표를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요."); return; }
      setGoals(goalResult.data ?? []);
      setStatus(!coachingEnabled ? "AI 코칭 기능 설정을 기다리고 있습니다." :
        goalResult.data?.length ? "목표를 선택하면 일정에 맞춰 계획을 만듭니다." : "먼저 과목이나 학습 목표를 추가해 주세요.");
    }
    void load();
    return () => { active = false; };
  }, []);

  async function generate() {
    const db = getSupabaseBrowserClient();
    if (!db || busy) return;
    setResult(null);
    setApprovedPlanId(null);
    if (!selected.length || selected.length > 5) { setStatus("학습 목표를 1~5개 선택해 주세요."); return; }
    if (!Number.isInteger(dailyMinutes) || dailyMinutes < 15 || dailyMinutes > 480) { setStatus("하루 학습 시간은 15~480분으로 입력해 주세요."); return; }
    const dates = planDates(intent);
    setBusy(true);
    setStatus("일정을 확인하고 AI 계획을 만드는 중입니다…");
    try {
      const user = (await db.auth.getUser()).data.user;
      if (!user || getStorageUser() !== user.id) throw new Error("로그인 상태가 변경됐습니다. 다시 로그인해 주세요.");
      await flushP0Changes();
      const { data, error } = await db.functions.invoke<Result>("coaching-propose", { body: {
        request_key: crypto.randomUUID(),
        goal_ids: selected, intent, period_start: dates[0], period_end: dates.at(-1),
        day_budgets: dates.map((date) => ({ date, minutes: dailyMinutes,
          windows: [{ start: "06:00", end: "23:00" }] })),
        desired_outcome: "", constraints: requestNote.slice(0, 1000),
        rules: { transition_minutes: 10, break_minutes: 10, break_after_minutes: 90,
          method_minimums: {}, max_focus_goals: Math.min(3, selected.length), carryover: true },
      } });
      if (error) throw new Error(await describeFunctionError(error, "코칭 제안을 생성하지 못했습니다."));
      if (!data || data.schema_version !== 2 || !data.proposal || data.persisted !== false) throw new Error("코칭 응답 형식이 예상과 다릅니다.");
      if (getStorageUser() !== user.id) throw new Error("계정이 변경됐습니다. 다시 요청해 주세요.");
      setResult(data);
      setStatus("제안이 생성됐습니다. 아직 DB 계획으로 저장되지는 않았습니다.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "코칭 제안을 생성하지 못했습니다.");
    } finally { setBusy(false); }
  }

  async function approve() {
    const db = getSupabaseBrowserClient();
    if (!db || !result?.proposal_run_id || approving) return;
    setApproving(true);
    setStatus("AI 계획을 저장하는 중입니다…");
    try {
      const user = (await db.auth.getUser()).data.user;
      if (!user || getStorageUser() !== user.id) throw new Error("로그인 상태가 변경됐습니다. 다시 로그인해 주세요.");
      const { data, error } = await db.rpc("approve_coaching_proposal", { p_run_id: result.proposal_run_id });
      if (error) throw error;
      if (typeof data !== "string") throw new Error("저장된 계획을 확인하지 못했습니다.");
      setApprovedPlanId(data);
      setStatus("AI 계획을 저장했습니다. 실행 계획에서 확인할 수 있습니다.");
      window.dispatchEvent(new Event("unilink:studyPlansChanged"));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "AI 계획을 저장하지 못했습니다.");
    } finally { setApproving(false); }
  }

  return <aside id="coaching-request" className={styles.request} aria-label="코칭 요청">
    <div className={styles.requestTitle}><Sparkles size={20} /><h2>AI 학습코칭</h2><span className={styles.pill}>제안</span></div>
    <div className={styles.coachingForm}>
      <fieldset className={styles.goalChoices}><legend>학습 목표 (최대 5개)</legend>
        {goals.map((goal) => <label key={goal.id}><input type="checkbox" checked={selected.includes(goal.id)}
          disabled={!selected.includes(goal.id) && selected.length >= 5}
          onChange={(event) => { setSelected((current) => event.target.checked ? [...current, goal.id] : current.filter((id) => id !== goal.id)); setResult(null); }} />{goal.title}</label>)}
        {!goals.length && <p>활성 목표가 없습니다.</p>}
      </fieldset>
      <label>요청 종류<select value={intent} onChange={(event) => setIntent(event.target.value as typeof intent)}>
        {intents.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>하루 학습 가능 시간 (분)<input type="number" min={15} max={480} step={15} value={dailyMinutes}
        onChange={(event) => { setDailyMinutes(Number(event.target.value)); setResult(null); }} /></label>
      <label>추가 요청 <span className={styles.optional}>(선택)</span><textarea maxLength={1000} rows={2}
        placeholder="예: 수요일은 가볍게 계획해줘" value={requestNote} onChange={(event) => { setRequestNote(event.target.value); setResult(null); }} /></label>
      <p className={styles.autoPlanNotice}>기간, 수업 충돌, 이동·휴식 시간은 자동으로 반영합니다.</p>
      <button type="button" className={styles.save} disabled={busy || !goals.length || !coachingEnabled} onClick={() => void generate()}><Sparkles size={16} />{busy ? "계획 생성 중…" : coachingEnabled ? "AI 계획 만들기" : "AI 기능 설정 후 사용 가능"}</button>
      <p role="status" className={styles.notice}>{status}</p>
    </div>
    {result && <section className={styles.proposal} aria-label="코칭 제안">
      <h3>검토할 계획 제안</h3><p>{result.proposal.summary}</p>
      <ul>{result.proposal.items.map((item, index) => <li key={`${item.planned_date}-${item.start_time}-${index}`}>
        <strong>{item.planned_date} {item.start_time} · {item.planned_minutes}분</strong><br />
        {item.title} · {item.reason}</li>)}</ul>
      {!!result.proposal.deferred_goals.length && <><h4>다음으로 이월</h4><ul>{result.proposal.deferred_goals.map((goal) => <li key={goal.goal_id}>
        {goals.find((item) => item.id === goal.goal_id)?.title ?? "목표"}: {goal.reason} ({goal.reconsider_on} 재검토)</li>)}</ul></>}
      <button type="button" className={styles.save} disabled={approving || Boolean(approvedPlanId) || !result.proposal_run_id}
        onClick={() => void approve()}>{approving ? "저장 중…" : approvedPlanId ? "저장 완료" : "이 계획 사용하기"}</button>
      <p>{approvedPlanId ? "승인된 계획은 DB에 저장되며 다시 눌러도 중복 생성되지 않습니다." : "확인 후 승인하면 실행할 학습 계획으로 저장됩니다."}</p>
    </section>}
  </aside>;
}
