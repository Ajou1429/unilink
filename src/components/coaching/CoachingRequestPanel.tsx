"use client";

import { useEffect, useMemo, useState } from "react";
import { Sparkles } from "lucide-react";
import { TopicLearningPanel } from "./TopicLearningPanel";
import { CourseKnowledgePanel } from "./CourseKnowledgePanel";
import { courseKnowledgeEnabled, prepareCourseKnowledge, requestCourseKnowledge, type KnowledgeStatus } from "@/lib/course-knowledge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getSupabaseBrowserClient, isSupabaseConfigured } from "@/lib/supabase-client";
import { describeFunctionError } from "@/lib/supabase/function-error";
import { flushP0Changes } from "@/lib/p0-sync";
import { getStorageUser } from "@/lib/private-storage";
import styles from "@/app/(dashboard)/ai-coaching/workspace.module.css";

type Goal = { id: string; title: string };
type DailySource = { id: string; kind: "event" | "plan"; goal_id: string; title: string; deadline: string | null };
type ExamInput = { scope: string; exam_at: string; priority: number; difficulty: number };
type Item = { goal_id: string; topic_id: string | null; method_code: string; title: string; planned_date: string; start_time: string; planned_minutes: number; reason: string };
type Proposal = { summary: string; items: Item[]; deferred_goals: { goal_id: string; reason: string; reconsider_on: string }[] };
type Usage = { model: string; attempt_count: number; pricing_version: string; totals: {
  input_tokens: number; cached_input_tokens: number; output_tokens: number; reasoning_tokens: number;
  total_tokens: number; estimated_cost_usd: number | null;
} };
type Result = { schema_version: number; proposal: Proposal; persisted: boolean; proposal_run_id?: string; proposal_persisted?: boolean; usage?: Usage };

const intents = [
  ["weekly_plan", "이번 주 계획"], ["daily_plan", "오늘 계획"], ["exam_prep", "시험 대비"],
  ["topic_review", "단원 복습"],
] as const;
const coachingEnabled = process.env.NEXT_PUBLIC_COACHING_ENABLED === "true";
const preferenceHours = Array.from({ length: 10 }, (_, index) => index + 13);
const defaultStudyWindow = [{ start: "13:00", end: "23:00" }];

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

function hoursToWindows(hours: number[]): { start: string; end: string }[] {
  const sorted = [...new Set(hours)].sort((a, b) => a - b);
  if (!sorted.length) return defaultStudyWindow;
  const windows: { start: string; end: string }[] = [];
  let start = sorted[0];
  let previous = sorted[0];
  for (const hour of sorted.slice(1)) {
    if (hour === previous + 1) { previous = hour; continue; }
    windows.push({ start: `${String(start).padStart(2, "0")}:00`, end: `${String(previous + 1).padStart(2, "0")}:00` });
    start = hour;
    previous = hour;
  }
  windows.push({ start: `${String(start).padStart(2, "0")}:00`, end: `${String(previous + 1).padStart(2, "0")}:00` });
  return windows;
}

const koreanWeekdays = ["일", "월", "화", "수", "목", "금", "토"];

function itemStartMinutes(item: Item): number {
  const [hour, minute] = item.start_time.split(":").map(Number);
  return hour * 60 + minute;
}

function ProposalTimetable({ items, goals }: { items: Item[]; goals: Goal[] }) {
  const sorted = [...items].sort((a, b) =>
    `${a.planned_date} ${a.start_time}`.localeCompare(`${b.planned_date} ${b.start_time}`),
  );
  const dates = [...new Set(sorted.map((item) => item.planned_date))];
  const earliest = Math.min(...sorted.map(itemStartMinutes));
  const latest = Math.max(...sorted.map((item) => itemStartMinutes(item) + item.planned_minutes));
  const startHour = Math.max(0, Math.floor(earliest / 60));
  const endHour = Math.min(24, Math.max(startHour + 3, Math.ceil(latest / 60)));
  const hourHeight = 58;
  const timelineHeight = (endHour - startHour) * hourHeight;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, index) => startHour + index);

  return <div className={styles.timetableScroll}>
    <div className={styles.timetable} style={{
      minWidth: `${72 + Math.max(1, dates.length) * 150}px`,
      gridTemplateColumns: `72px repeat(${Math.max(1, dates.length)}, minmax(150px, 1fr))`,
    }}>
      <div className={styles.timeCorner}>시간</div>
      {dates.map((date) => {
        const localDate = new Date(`${date}T00:00:00`);
        return <div className={styles.dayHeader} key={date}>
          <strong>{koreanWeekdays[localDate.getDay()]}요일</strong>
          <span>{date.slice(5).replace("-", ".")}</span>
        </div>;
      })}
      <div className={styles.timeAxis} style={{ height: timelineHeight }}>
        {hours.map((hour, index) => <span key={hour} style={{ top: Math.min(index * hourHeight, timelineHeight - 1) }}>
          {String(hour).padStart(2, "0")}:00
        </span>)}
      </div>
      {dates.map((date) => <div className={styles.dayColumn} style={{ height: timelineHeight }} key={date}>
        {hours.slice(0, -1).map((hour) => <span className={styles.hourLine} style={{ top: (hour - startHour) * hourHeight }} key={hour} />)}
        {sorted.filter((item) => item.planned_date === date).map((item, index) => {
          const top = ((itemStartMinutes(item) - startHour * 60) / 60) * hourHeight;
          const height = Math.max(38, (item.planned_minutes / 60) * hourHeight);
          return <article className={styles.planBlock} style={{ top, height }} key={`${date}-${item.start_time}-${index}`}>
            <strong>{item.start_time} · {item.planned_minutes}분</strong>
            <span>{item.title}</span>
            <small>{goals.find((goal) => goal.id === item.goal_id)?.title ?? "학습 목표"}</small>
          </article>;
        })}
      </div>)}
    </div>
  </div>;
}

function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 4, maximumFractionDigits: 6 }).format(value);
}

export function CoachingRequestPanel() {
  const [open, setOpen] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [intent, setIntent] = useState<(typeof intents)[number][0]>("weekly_plan");
  const [dailyMinutes, setDailyMinutes] = useState(120);
  const [preferredHours, setPreferredHours] = useState<Record<string, number[]>>({});
  const [requestNote, setRequestNote] = useState("");
  const [dailySources, setDailySources] = useState<DailySource[]>([]);
  const [chosenSources, setChosenSources] = useState<string[]>([]);
  const [examInputs, setExamInputs] = useState<Record<string, ExamInput>>({});
  const [status, setStatus] = useState(isSupabaseConfigured() ? "DB 목표를 불러오는 중입니다." : "Supabase 연결 설정이 필요합니다.");
  const [busy, setBusy] = useState(false);
  const [learningPending, setLearningPending] = useState(0);
  const [approving, setApproving] = useState(false);
  const [approvedPlanId, setApprovedPlanId] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [knowledgeConsent, setKnowledgeConsent] = useState(false);
  const [researchConsent, setResearchConsent] = useState(false);
  const [knowledgeStatuses, setKnowledgeStatuses] = useState<Record<string, KnowledgeStatus>>({});
  const dates = useMemo(() => planDates(intent), [intent]);
  const learningGoalIds = intent === "daily_plan" ? [...new Set(dailySources.filter((s) => chosenSources.includes(`${s.kind}:${s.id}`)).map((s) => s.goal_id))] : selected;
  useEffect(() => {
    if (!open) return;
    const db = getSupabaseBrowserClient();
    if (!db) return;
    let active = true;
    async function load() {
      const user = (await db!.auth.getUser()).data.user;
      if (!active) return;
      if (!user || getStorageUser() !== user.id) { setStatus("로그인 후 코칭 제안을 받을 수 있습니다."); return; }
      await flushP0Changes();
      const goalResult = await db!.from("learning_goals").select("id,title").eq("user_id", user.id).eq("status", "active").order("created_at", { ascending: false }).limit(100);
      if (!active) return;
      if (goalResult.error) { setStatus("DB 목표를 불러오지 못했습니다. 새로고침 후 다시 시도해 주세요."); return; }
      setGoals(goalResult.data ?? []);
      const [events, tasks] = await Promise.all([
        db!.from("calendar_events").select("id,goal_id,title,due_at,starts_at,event_type,exam_scope").eq("user_id", user.id).eq("status", "scheduled").order("due_at", { nullsFirst: false }).limit(100),
        db!.from("study_plan_items").select("id,goal_id,title,scheduled_start,scheduled_end,metadata").eq("user_id", user.id).eq("status", "planned").order("scheduled_end", { nullsFirst: false }).limit(100),
      ]);
      if (!active || getStorageUser() !== user.id) return;
      if (events.error || tasks.error) { setStatus("과제·기존 계획을 불러오지 못했습니다. 다시 열어 주세요."); return; }
      setDailySources([
        ...(events.data ?? []).filter((e) => e.goal_id).map((e) => ({ id: e.id, kind: "event" as const, goal_id: e.goal_id!, title: e.title, deadline: e.due_at ?? e.starts_at })),
        ...(tasks.data ?? []).map((e) => { const due = e.metadata?.legacy_record?.dueDate; return { id: e.id, kind: "plan" as const, goal_id: e.goal_id, title: e.title, deadline: typeof due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(due) ? `${due}T23:59:00+09:00` : e.scheduled_end ?? e.scheduled_start }; }),
      ].filter((s) => goalResult.data?.some((g) => g.id === s.goal_id)).sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999")));
      const defaults: Record<string, ExamInput> = {};
      for (const e of [...(events.data ?? [])].filter((e) => e.event_type === "exam" && e.goal_id && e.starts_at && Date.parse(e.starts_at) > Date.now()).sort((a, b) => a.starts_at!.localeCompare(b.starts_at!))) {
        if (!defaults[e.goal_id!]) {
          const d = new Date(e.starts_at!);
          defaults[e.goal_id!] = { scope: e.exam_scope ?? "", exam_at: `${localDate(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`, priority: 3, difficulty: 3 };
        }
      }
      setExamInputs(defaults);
      setStatus(!coachingEnabled ? "AI 코칭 기능 설정을 기다리고 있습니다." :
        goalResult.data?.length ? "목표를 선택하면 일정에 맞춰 계획을 만듭니다." : "먼저 과목이나 학습 목표를 추가해 주세요.");
    }
    void load().catch(() => { if (active) setStatus("과제와 학습 계획을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요."); });
    return () => { active = false; };
  }, [open]);

  function togglePreferredHour(date: string, hour: number) {
    setPreferredHours((current) => {
      const selectedHours = current[date] ?? [];
      const nextHours = selectedHours.includes(hour)
        ? selectedHours.filter((selectedHour) => selectedHour !== hour)
        : [...selectedHours, hour].sort((a, b) => a - b);
      const next = { ...current };
      if (nextHours.length) next[date] = nextHours;
      else delete next[date];
      return next;
    });
    setResult(null);
  }

  async function generate() {
    const db = getSupabaseBrowserClient();
    if (!db || busy || learningPending > 0) return;
    setResult(null);
    setApprovedPlanId(null);
    const picked = dailySources.filter((s) => chosenSources.includes(`${s.kind}:${s.id}`));
    const goalIds = intent === "daily_plan" ? [...new Set(picked.map((s) => s.goal_id))] : selected;
    if (!goalIds.length || goalIds.length > 5) { setStatus("학습 목표를 1~5개 선택해 주세요. 오늘 계획은 작업을 선택해 주세요."); return; }
    if (intent === "exam_prep" && goalIds.some((id) => !examInputs[id]?.scope.trim() || !examInputs[id]?.exam_at || Date.parse(examInputs[id].exam_at) <= Date.now())) { setStatus("각 과목의 시험 범위와 미래 시험 일시를 입력해 주세요."); return; }
    if (!Number.isInteger(dailyMinutes) || dailyMinutes < 15 || dailyMinutes > 480) { setStatus("하루 학습 시간은 15~480분으로 입력해 주세요."); return; }
    const requestDates = dates.length ? dates : planDates(intent);
    setBusy(true);
    setStatus("일정을 확인하고 AI 계획을 만드는 중입니다…");
    try {
      const user = (await db.auth.getUser()).data.user;
      if (!user || getStorageUser() !== user.id) throw new Error("로그인 상태가 변경됐습니다. 다시 로그인해 주세요.");
      await flushP0Changes();
      await prepareCourseKnowledge(goalIds, requestDates[0], user.id, knowledgeConsent, researchConsent,
        (row) => { setKnowledgeStatuses((current) => ({ ...current, [row.goal_id]: row }));
          setStatus(`${row.title}: 자료 구조 ${row.pdf_ready}/${row.pdf_count}, 남은 분석 ${row.pending_steps}단계`); });
      setStatus("저장된 과목 지식과 학습 기록으로 계획을 만드는 중입니다…");
      const { data, error } = await db.functions.invoke<Result>("coaching-propose", { body: {
        request_key: crypto.randomUUID(),
        goal_ids: goalIds, intent, period_start: requestDates[0], period_end: requestDates.at(-1),
        ...(intent === "daily_plan" ? { daily_sources: picked.map(({ kind, id }) => ({ kind, id })) } : {}),
        ...(intent === "exam_prep" ? { exam_inputs: goalIds.map((goal_id) => ({ goal_id, ...examInputs[goal_id], exam_at: new Date(examInputs[goal_id].exam_at).toISOString() })) } : {}),
        day_budgets: requestDates.map((date) => { const windows = hoursToWindows(preferredHours[date] ?? []); return { date, minutes: Math.min(dailyMinutes, windows.reduce((total, w) => total + Number(w.end.slice(0, 2)) * 60 - Number(w.start.slice(0, 2)) * 60, 0)), windows }; }),
        desired_outcome: "", constraints: requestNote.slice(0, 1000),
        rules: { transition_minutes: 10, break_minutes: 10, break_after_minutes: 90,
          method_minimums: {}, max_focus_goals: Math.min(3, goalIds.length), carryover: true },
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

  async function resumeKnowledge(goalId?: string, noteId?: string) {
    const db = getSupabaseBrowserClient();
    if (!db || busy || learningPending > 0) return;
    setBusy(true); setResult(null);
    try {
      const user = (await db.auth.getUser()).data.user;
      if (!user || getStorageUser() !== user.id) throw new Error("로그인 후 다시 시도해 주세요.");
      await flushP0Changes();
      if (goalId && noteId) await requestCourseKnowledge(goalId, dates[0], { action: "refresh", note_id: noteId, consent: knowledgeConsent, refresh_request_id: crypto.randomUUID() });
      await prepareCourseKnowledge(goalId ? [goalId] : learningGoalIds, dates[0], user.id, knowledgeConsent, researchConsent,
        (row) => setKnowledgeStatuses((current) => ({ ...current, [row.goal_id]: row })), true);
      setStatus("분석 상태를 갱신했습니다. 준비된 자료로 AI 계획을 만들 수 있습니다.");
    } catch (error) { setStatus(error instanceof Error ? error.message : "분석을 이어가지 못했습니다."); }
    finally { setBusy(false); }
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

  return <>
    <button type="button" className={styles.recommendButton} onClick={() => setOpen(true)}>
      <Sparkles size={17} /> 계획 추천
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className={styles.coachingDialog}>
        <DialogHeader className={styles.dialogHeader}>
          <DialogTitle className={styles.dialogTitle}><Sparkles size={21} /> AI 학습 계획 추천</DialogTitle>
          <DialogDescription>학습 목표와 가능한 시간을 알려주면 현재 일정에 맞는 실행 계획을 제안합니다.</DialogDescription>
        </DialogHeader>
        <div className={styles.dialogBody}>
          <section className={styles.request} aria-label="계획 추천 설정">
            <div className={styles.requestTitle}><h2>추천 조건 설정</h2><span className={styles.pill}>1단계</span></div>
            <div className={styles.coachingForm}>
              {intent !== "daily_plan" && <fieldset className={styles.goalChoices}><legend>학습 목표 (최대 5개)</legend>
                {goals.map((goal) => <label key={goal.id}><input type="checkbox" checked={selected.includes(goal.id)}
                  disabled={!selected.includes(goal.id) && selected.length >= 5}
                  onChange={(event) => { setSelected((current) => event.target.checked ? [...current, goal.id] : current.filter((id) => id !== goal.id)); setResult(null); }} /><span>{goal.title}</span></label>)}
                {!goals.length && <p>활성 목표가 없습니다.</p>}
              </fieldset>}
              <div className={styles.coachingGrid}>
                <label>요청 종류<select value={intent} onChange={(event) => {
                  setIntent(event.target.value as typeof intent); setResult(null);
                }}>
                  {intents.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select></label>
                <label>하루 목표 순공시간 (분)<input type="number" min={15} max={480} step={15} value={dailyMinutes}
                  onChange={(event) => { setDailyMinutes(Number(event.target.value)); setResult(null); }} /></label>
              </div>
              {intent === "daily_plan" && <fieldset className={styles.goalChoices} style={{ maxHeight: 280 }}><legend>오늘 할 작업 · 마감 임박 순</legend>
                <p>진행 중인 과제와 기존 학습 계획에서 선택하세요. 선택한 과목은 최대 5개입니다.</p>
                {dailySources.map((source) => { const key = `${source.kind}:${source.id}`; return <label key={key}>
                  <input type="checkbox" checked={chosenSources.includes(key)} onChange={(e) => { setChosenSources((current) => e.target.checked ? [...current, key] : current.filter((id) => id !== key)); setResult(null); }} />
                  <span>{source.kind === "event" ? "과제·일정" : "기존 계획"} · {source.title}<br /><small>{source.deadline ? new Date(source.deadline).toLocaleString("ko-KR") : "마감 미지정"}</small></span>
                </label>; })}
                {!dailySources.length && <p>진행 중인 과제나 계획이 없습니다. 수업에서 과제·시험·일정을 먼저 등록해 주세요.</p>}
              </fieldset>}
              {intent === "exam_prep" && selected.map((id) => {
                const exam = examInputs[id] ?? { scope: "", exam_at: "", priority: 3, difficulty: 3 };
                const update = (patch: Partial<ExamInput>) => { setExamInputs((current) => ({ ...current, [id]: { ...exam, ...patch } })); setResult(null); };
                return <fieldset className={styles.dayBudgets} key={id}><legend>{goals.find((g) => g.id === id)?.title}</legend>
                  <label>시험 범위<textarea maxLength={2000} value={exam.scope} onChange={(e) => update({ scope: e.target.value })} /></label>
                  <label>시험 일시<input type="datetime-local" value={exam.exam_at} onChange={(e) => update({ exam_at: e.target.value })} /></label>
                  <div className={styles.coachingGrid}>{(["priority", "difficulty"] as const).map((field) => <label key={field}>{field === "priority" ? "우선도" : "난이도"}<select value={exam[field]} onChange={(e) => update({ [field]: Number(e.target.value) })}>
                    {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} · {field === "priority" ? ["매우 낮음", "낮음", "보통", "높음", "매우 높음"][n - 1] : ["매우 쉬움", "쉬움", "보통", "어려움", "매우 어려움"][n - 1]}</option>)}
                  </select></label>)}</div>
                </fieldset>;
              })}
              {intent === "exam_prep" && <p className={styles.autoPlanNotice}>등록된 가까운 시험 정보를 불러옵니다. 앞으로 14일 안에서 시험 일시·우선도·난이도를 반영합니다. 수정한 시험 정보는 이번 추천 요청에 적용됩니다.</p>}
              {intent === "topic_review" && <p className={styles.autoPlanNotice}>기존 학습 계획을 기준으로 빈 시간에 복습을 추가합니다. 가능한 경우 수업이 끝난 당일에 해당 과목을 복습합니다.</p>}
              {learningGoalIds.length > 0 && <details><summary className="cursor-pointer text-sm font-semibold">계획 전 진도·이해도 확인</summary>
                <div className="mt-3"><TopicLearningPanel goalIds={learningGoalIds} disabled={busy} onPendingChange={(delta) => { setLearningPending((current) => Math.max(0, current + delta)); setResult(null); }} /></div>
              </details>}
              {courseKnowledgeEnabled && learningGoalIds.length > 0 && <>
                <CourseKnowledgePanel goalIds={learningGoalIds} asOf={dates[0]} live={knowledgeStatuses} busy={busy} onResume={() => void resumeKnowledge()} onRefresh={(goalId, noteId) => void resumeKnowledge(goalId, noteId)} />
                <label style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <input type="checkbox" style={{ width: 16, height: 16, flex: "0 0 16px", marginTop: 3 }} checked={knowledgeConsent} disabled={busy} onChange={(e) => setKnowledgeConsent(e.target.checked)} />
                  <span>선택한 목표에 연결된 PDF를 OpenAI로 전송하여 분석하는 데 동의합니다.</span>
                </label>
                <label style={{ display: "flex", flexDirection: "row", alignItems: "flex-start", gap: 8 }}>
                  <input type="checkbox" style={{ width: 16, height: 16, flex: "0 0 16px", marginTop: 3 }} checked={researchConsent} disabled={busy} onChange={(e) => setResearchConsent(e.target.checked)} />
                  <span>추출된 주제·요구 수준으로 외부 자료를 검색하는 데 동의합니다. (선택, 별도 검색 비용)</span>
                </label>
              </>}
              <fieldset className={styles.preferencePicker}>
                <legend>공통 선호 학습 시간 <span className={styles.optional}>(선택)</span></legend>
                <p>모든 요청 종류에 공통 적용하며, 선택한 시간 안에서 공부 계획을 배치합니다. 휴식은 학습 사이의 빈 간격으로 확보합니다. 선택하지 않은 날은 오후 1시~밤 11시에 배치합니다.</p>
                <div className={styles.preferenceScroll}>
                  <div className={styles.preferenceGrid} style={{ gridTemplateColumns: `62px repeat(${Math.max(1, dates.length)}, minmax(68px, 1fr))` }}>
                    <div className={styles.preferenceCorner}>시간</div>
                    {dates.map((date) => {
                      const day = new Date(`${date}T00:00:00`);
                      return <div className={styles.preferenceDay} key={date}>
                        <strong>{koreanWeekdays[day.getDay()]}요일</strong><span>{date.slice(5).replace("-", ".")}</span>
                      </div>;
                    })}
                    {preferenceHours.map((hour) => <div className={styles.preferenceRow} key={hour} style={{ gridColumn: `1 / span ${dates.length + 1}` }}>
                      <span>{String(hour).padStart(2, "0")}:00</span>
                      {dates.map((date) => {
                        const chosen = preferredHours[date]?.includes(hour) ?? false;
                        return <button type="button" key={date} aria-pressed={chosen}
                          aria-label={`${date} ${hour}시부터 ${hour + 1}시까지 선호 시간`}
                          onClick={() => togglePreferredHour(date, hour)}>{chosen ? "선택" : ""}</button>;
                      })}
                    </div>)}
                  </div>
                </div>
                {Object.keys(preferredHours).length > 0 && <button type="button" className={styles.clearPreference}
                  onClick={() => { setPreferredHours({}); setResult(null); }}>선택 초기화</button>}
              </fieldset>
              <label>추가 요청 <span className={styles.optional}>(선택)</span><textarea maxLength={1000} rows={4}
                placeholder="예: 수요일은 가볍게 계획해줘" value={requestNote} onChange={(event) => { setRequestNote(event.target.value); setResult(null); }} /></label>
              <p className={styles.autoPlanNotice}>순공시간은 휴식·이동을 제외한 목표 공부시간입니다. 휴식·이동은 시간 계산에 반영하지만 별도 계획으로 표시하지 않습니다. 선택 시간 안에 목표량을 채우기 어려우면 가능한 분량만 추천합니다.</p>
              <button type="button" className={styles.save} disabled={busy || learningPending > 0 || !goals.length || !coachingEnabled} onClick={() => void generate()}><Sparkles size={16} />{learningPending > 0 ? "학습 상태 저장 중…" : busy ? "계획 생성 중…" : coachingEnabled ? "AI 계획 만들기" : "AI 기능 설정 후 사용 가능"}</button>
              <p role="status" className={styles.notice}>{status}</p>
            </div>
          </section>
          <section className={styles.resultPane} aria-label="계획 추천 결과">
            <div className={styles.requestTitle}><h2>추천 결과</h2><span className={styles.pill}>2단계</span></div>
            {!result && <div className={styles.resultEmpty}>
              <Sparkles size={30} />
              <h3>조건을 설정하고 계획을 만들어 보세요</h3>
              <p>추천 결과를 확인한 뒤에만 실제 학습 계획으로 저장됩니다.</p>
            </div>}
            {result && <div className={styles.proposal}>
              <h3>검토할 계획 제안</h3><p>{result.proposal.summary}</p>
              <ProposalTimetable items={result.proposal.items} goals={goals} />
              {result.usage?.totals && <div className={styles.usageSummary} aria-label="이번 요청 API 사용량">
                <div><span>사용 모델</span><strong>{result.usage.model}</strong></div>
                <div><span>API 호출</span><strong>{result.usage.attempt_count}회</strong></div>
                <div><span>입력 토큰</span><strong>{result.usage.totals.input_tokens.toLocaleString()}</strong></div>
                <div><span>출력 토큰</span><strong>{result.usage.totals.output_tokens.toLocaleString()}</strong></div>
                <div><span>추정 비용</span><strong>{result.usage.totals.estimated_cost_usd === null
                  ? "단가 미등록" : formatUsd(result.usage.totals.estimated_cost_usd)}</strong></div>
                <p>캐시 입력 {result.usage.totals.cached_input_tokens.toLocaleString()} · 추론 토큰 {result.usage.totals.reasoning_tokens.toLocaleString()} · {result.usage.pricing_version}</p>
              </div>}
              <details className={styles.planDetails}><summary>추천 이유 자세히 보기</summary><ul>
                {result.proposal.items.map((item, index) => <li key={`${item.planned_date}-${item.start_time}-${index}`}>
                  <strong>{item.planned_date} {item.start_time} · {item.planned_minutes}분</strong><br />
                  {item.title} · {item.reason}</li>)}
              </ul></details>
              {!!result.proposal.deferred_goals.length && <><h4>다음으로 이월</h4><ul>{result.proposal.deferred_goals.map((goal) => <li key={goal.goal_id}>
                {goals.find((item) => item.id === goal.goal_id)?.title ?? "목표"}: {goal.reason} ({goal.reconsider_on} 재검토)</li>)}</ul></>}
              <button type="button" className={styles.save} disabled={approving || Boolean(approvedPlanId) || !result.proposal_run_id}
                onClick={() => void approve()}>{approving ? "저장 중…" : approvedPlanId ? "저장 완료" : "이 계획 사용하기"}</button>
              <p>{approvedPlanId ? "승인된 계획은 DB에 저장되며 다시 눌러도 중복 생성되지 않습니다." : "확인 후 승인하면 실행할 학습 계획으로 저장됩니다."}</p>
            </div>}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}
