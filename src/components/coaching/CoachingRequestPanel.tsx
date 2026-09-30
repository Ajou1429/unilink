"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-client";
import { describeFunctionError } from "@/lib/supabase/function-error";
import { flushP0Changes } from "@/lib/p0-sync";
import { getStorageUser } from "@/lib/private-storage";
import styles from "@/app/(dashboard)/ai-coaching/workspace.module.css";

type Goal = { id: string; title: string };
type Method = { code: string; display_name: string };
type Day = { date: string; minutes: number; start: string; end: string };
type Item = { goal_id: string; topic_id: string | null; method_code: string; title: string; planned_date: string; start_time: string; planned_minutes: number; reason: string };
type Proposal = { summary: string; items: Item[]; deferred_goals: { goal_id: string; reason: string; reconsider_on: string }[] };
type Result = { schema_version: number; proposal: Proposal; persisted: boolean };

const intents = [
  ["weekly_plan", "이번 주 계획"], ["daily_plan", "오늘 계획"], ["exam_prep", "시험 대비"],
  ["topic_review", "단원 복습"], ["progress_check", "학습 상태 점검"],
] as const;
const coachingEnabled = process.env.NEXT_PUBLIC_COACHING_ENABLED === "true";

function dateRange(start: string, end: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return [];
  const first = Date.parse(`${start}T00:00:00Z`);
  const last = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(first) || !Number.isFinite(last) || last < first || last - first > 13 * 86_400_000) return [];
  return Array.from({ length: (last - first) / 86_400_000 + 1 }, (_, i) => new Date(first + i * 86_400_000).toISOString().slice(0, 10));
}

export function CoachingRequestPanel() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [methods, setMethods] = useState<Method[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [days, setDays] = useState<Record<string, Day>>({});
  const [intent, setIntent] = useState<(typeof intents)[number][0]>("weekly_plan");
  const [outcome, setOutcome] = useState("");
  const [constraints, setConstraints] = useState("");
  const [transition, setTransition] = useState(10);
  const [breakMinutes, setBreakMinutes] = useState(10);
  const [breakAfter, setBreakAfter] = useState(90);
  const [maxFocus, setMaxFocus] = useState(3);
  const [methodMinimums, setMethodMinimums] = useState<Record<string, number>>({});
  const [bulk, setBulk] = useState({ minutes: 60, start: "", end: "" });
  const [status, setStatus] = useState(isSupabaseConfigured() ? "DB 목표를 불러오는 중입니다." : "Supabase 연결 설정이 필요합니다.");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const range = useMemo(() => dateRange(start, end), [start, end]);

  useEffect(() => {
    const db = getSupabaseBrowserClient();
    if (!db) return;
    let active = true;
    async function load() {
      const user = (await db!.auth.getUser()).data.user;
      if (!active) return;
      if (!user || getStorageUser() !== user.id) { setStatus("로그인 후 코칭 제안을 받을 수 있습니다."); return; }
      const [goalResult, methodResult] = await Promise.all([
        db!.from("learning_goals").select("id,title").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }).limit(100),
        db!.from("study_methods").select("code,display_name").eq("active", true).order("code"),
      ]);
      if (!active) return;
      if (goalResult.error || methodResult.error) { setStatus("DB 목표를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요."); return; }
      setGoals(goalResult.data ?? []);
      setMethods(methodResult.data ?? []);
      setStatus(!coachingEnabled ? "GPT API 키 연결을 기다리고 있습니다. 요청 설정은 미리 확인할 수 있습니다." :
        goalResult.data?.length ? "시간 창을 확인한 뒤 계획을 요청하세요." : "먼저 과목이나 학습 목표를 추가해 주세요.");
    }
    void load();
    return () => { active = false; };
  }, []);

  function updateDay(date: string, patch: Partial<Day>) {
    setDays((current) => ({ ...current, [date]: { ...(current[date] ?? { date, minutes: 0, start: "", end: "" }), ...patch } }));
    setResult(null);
  }

  async function generate() {
    const db = getSupabaseBrowserClient();
    if (!db || busy) return;
    setResult(null);
    if (!selected.length || selected.length > 5 || !range.length) { setStatus("목표 1~5개와 1~14일의 기간을 선택해 주세요."); return; }
    const budgets = range.map((date) => days[date] ?? { date, minutes: 0, start: "", end: "" });
    if (budgets.some((day) => !day.start || !day.end || day.start >= day.end || day.minutes < 0 || day.minutes > 480) ||
      !budgets.some((day) => day.minutes >= 15)) { setStatus("각 날짜의 시간 창과 학습 가능 시간을 확인해 주세요."); return; }
    setBusy(true);
    setStatus("DB 동기화와 GPT 계획 생성 중입니다…");
    try {
      const user = (await db.auth.getUser()).data.user;
      if (!user || getStorageUser() !== user.id) throw new Error("로그인 상태가 변경됐습니다. 다시 로그인해 주세요.");
      await flushP0Changes();
      const { data, error } = await db.functions.invoke<Result>("coaching-propose", { body: {
        goal_ids: selected, intent, period_start: start, period_end: end,
        day_budgets: budgets.map((day) => ({ date: day.date, minutes: day.minutes, windows: [{ start: day.start, end: day.end }] })),
        desired_outcome: outcome.slice(0, 1000), constraints: constraints.slice(0, 1000),
        rules: { transition_minutes: transition, break_minutes: breakMinutes, break_after_minutes: breakAfter,
          method_minimums: methodMinimums, max_focus_goals: maxFocus, carryover: true },
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

  return <aside id="coaching-request" className={styles.request} aria-label="코칭 요청">
    <div className={styles.requestTitle}><Sparkles size={20} /><h2>GPT 학습 코칭</h2><span className={styles.pill}>제안</span></div>
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
      <div className={styles.coachingGrid}><label>시작일<input type="date" value={start} onChange={(event) => { setStart(event.target.value); setResult(null); }} /></label>
        <label>종료일<input type="date" min={start || undefined} value={end} onChange={(event) => { setEnd(event.target.value); setResult(null); }} /></label></div>
      {start && end && !range.length && <p role="alert" className={styles.error}>계획 기간은 1~14일이어야 합니다.</p>}
      {!!range.length && <div className={styles.dayBudgets}><strong>날짜별 학습 가능 시간</strong>
        <p>수업·약속·이동을 제외한 실제 가용 시간 창을 입력해 주세요.</p>
        <div className={styles.coachingGrid}><label>일괄 시작<input aria-label="일괄 시작" type="time" value={bulk.start} onChange={(e) => setBulk({ ...bulk, start: e.target.value })} /></label>
          <label>일괄 종료<input aria-label="일괄 종료" type="time" value={bulk.end} onChange={(e) => setBulk({ ...bulk, end: e.target.value })} /></label>
          <label>일괄 학습 분<input aria-label="일괄 학습 분" type="number" min={0} max={480} value={bulk.minutes} onChange={(e) => setBulk({ ...bulk, minutes: Number(e.target.value) })} /></label></div>
        <button type="button" className={styles.save} onClick={() => { if (!bulk.start || !bulk.end || bulk.start >= bulk.end) { setStatus("일괄 시간 창을 먼저 확인해 주세요."); return; }
          setDays(Object.fromEntries(range.map((date) => [date, { date, ...bulk }]))); setResult(null); }}>기간에 적용</button>
        {range.map((date) => { const day = days[date] ?? { date, minutes: 0, start: "", end: "" }; return <div key={date} className={styles.dayRow}>
          <strong>{date}</strong><input aria-label={`${date} 시작`} type="time" value={day.start} onChange={(e) => updateDay(date, { start: e.target.value })} />
          <input aria-label={`${date} 종료`} type="time" value={day.end} onChange={(e) => updateDay(date, { end: e.target.value })} />
          <input aria-label={`${date} 학습 분`} type="number" min={0} max={480} value={day.minutes} onChange={(e) => updateDay(date, { minutes: Number(e.target.value) })} /></div>; })}
      </div>}
      <label>달성하고 싶은 목표<textarea maxLength={1000} rows={2} value={outcome} onChange={(e) => setOutcome(e.target.value)} /></label>
      <label>추가 조건<textarea maxLength={1000} rows={2} value={constraints} onChange={(e) => setConstraints(e.target.value)} /></label>
      <div className={styles.coachingGrid}>
        <label>일정 전후 여유 (분)<input type="number" min={0} max={60} value={transition} onChange={(e) => setTransition(Number(e.target.value))} /></label>
        <label>휴식 (분)<input type="number" min={0} max={60} value={breakMinutes} onChange={(e) => setBreakMinutes(Number(e.target.value))} /></label>
        <label>연속 학습 상한 (분)<input type="number" min={30} max={240} value={breakAfter} onChange={(e) => setBreakAfter(Number(e.target.value))} /></label>
        <label>집중 목표 수<input type="number" min={1} max={5} value={maxFocus} onChange={(e) => setMaxFocus(Number(e.target.value))} /></label>
      </div>
      <details><summary>방법별 최소 연속 학습 시간</summary><div className={styles.methodRules}>
        {methods.map((method) => <label key={method.code}>{method.display_name}<input aria-label={`${method.display_name} 최소 분`} type="number" min={15} max={Math.min(180, breakAfter)}
          value={methodMinimums[method.code] ?? 15} onChange={(e) => setMethodMinimums((current) => ({ ...current, [method.code]: Number(e.target.value) }))} /></label>)}
      </div></details>
      <button type="button" className={styles.save} disabled={busy || !goals.length || !coachingEnabled} onClick={() => void generate()}><Sparkles size={16} />{busy ? "계획 생성 중…" : coachingEnabled ? "GPT 계획 제안 받기" : "API 키 설정 후 사용 가능"}</button>
      <p role="status" className={styles.notice}>{status}</p>
    </div>
    {result && <section className={styles.proposal} aria-label="코칭 제안">
      <h3>검토할 계획 제안</h3><p>{result.proposal.summary}</p>
      <ul>{result.proposal.items.map((item, index) => <li key={`${item.planned_date}-${item.start_time}-${index}`}>
        <strong>{item.planned_date} {item.start_time} · {item.planned_minutes}분</strong><br />
        {item.title} · {item.reason}</li>)}</ul>
      {!!result.proposal.deferred_goals.length && <><h4>다음으로 이월</h4><ul>{result.proposal.deferred_goals.map((goal) => <li key={goal.goal_id}>
        {goals.find((item) => item.id === goal.goal_id)?.title ?? "목표"}: {goal.reason} ({goal.reconsider_on} 재검토)</li>)}</ul></>}
      <p>이 결과는 미리보기입니다. 계획 저장·승인 기능은 아직 연결되지 않았습니다.</p>
    </section>}
  </aside>;
}
