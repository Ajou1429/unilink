"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Settings, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { compareLabels } from "@/lib/problem-bank-labels";
import { splitSourceFile, type ProblemBankProblem } from "@/lib/problem-bank-storage";
import type { CourseSessionProgress, PaceLevel } from "@/lib/timetable-storage";
import {
  archiveTopic, deleteOneProblem, deletePlan, deleteSession, listMaterials, listPlans, listSessions, loadCourseProblems, loadMidtermDate,
  loadTopics, saveTopicState, setProblemLevel, updatePlan, updateSession,
  type CoursePlan, type Material, type TopicRow, type TopicStatus,
} from "@/lib/course-overview/data";
import { getPeriodOverrides, PERIOD_LABELS, resolvePeriod, setPeriodOverride, type ExamPeriod } from "@/lib/course-overview/period";
import { COURSE_DATA_CHANGED_EVENT } from "./CourseOverview";

const TABS = [
  { id: "topics", label: "주제별 이해도" },
  { id: "sessions", label: "수업 진도" },
  { id: "problems", label: "문제 이해도" },
  { id: "plans", label: "계획" },
  { id: "materials", label: "강의자료" },
] as const;
type Tab = typeof TABS[number]["id"];

const STATUS_LABELS: Record<TopicStatus, string> = { not_started: "미학습", in_progress: "학습 중", needs_review: "복습 필요", understood: "이해함" };
const LEVELS: PaceLevel[] = ["상", "중", "하"];
const control = "rounded-md border bg-white px-2 py-1 text-sm outline-none focus:border-primary";
const changed = () => window.dispatchEvent(new Event(COURSE_DATA_CHANGED_EVENT));
const shortDate = (value: string) => {
  const [y, m, d] = value.slice(0, 10).split("-").map(Number);
  return y ? `${m}/${d}(${"일월화수목금토"[new Date(y, m - 1, d).getDay()]})` : "";
};

/** 한 줄 편집: 고치면 저장 버튼이 켜지고, 저장·삭제 중에는 잠근다 */
function useRow<T>(initial: T) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  async function run(task: () => Promise<void> | void) {
    setBusy(true); setError("");
    try { await task(); changed(); }
    catch (err) { setError(err instanceof Error ? err.message : "저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  return { value, setValue, busy, error, dirty, run };
}

function RowActions({ dirty, busy, onSave, onDelete, label }: { dirty: boolean; busy: boolean; onSave?: () => void; onDelete: () => void; label: string }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      {onSave && <button type="button" onClick={onSave} disabled={!dirty || busy} className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground disabled:opacity-30">저장</button>}
      <button type="button" onClick={onDelete} disabled={busy} aria-label={`${label} 삭제`} title="삭제"
        className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-rose-50 hover:text-rose-600 disabled:opacity-30">
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function TopicItem({ topic, onDone }: { topic: TopicRow; onDone: () => void }) {
  const row = useRow({ status: topic.state?.learning_status ?? "not_started", rating: topic.state?.self_rating ?? 0, memo: topic.state?.memo ?? "" });
  const v = row.value;
  return (
    <li className="space-y-2 py-3">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-sm font-medium">{topic.title}</p>
        <RowActions label={topic.title} dirty={row.dirty} busy={row.busy}
          onSave={() => void row.run(async () => { await saveTopicState(topic, { status: v.status, rating: v.rating || null, memo: v.memo }); onDone(); })}
          onDelete={() => { if (window.confirm(`「${topic.title}」 주제를 삭제할까요? 코칭과 채팅에서 더 이상 쓰지 않아요.`)) void row.run(async () => { await archiveTopic(topic); onDone(); }); }} />
      </div>
      <div className="flex flex-wrap gap-2">
        <select aria-label="학습 상태" className={control} value={v.status} onChange={(e) => row.setValue({ ...v, status: e.target.value as TopicStatus, rating: e.target.value === "not_started" ? 0 : v.rating })}>
          {Object.entries(STATUS_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <select aria-label="이해도" className={control} value={v.rating} disabled={v.status === "not_started"} onChange={(e) => row.setValue({ ...v, rating: Number(e.target.value) })}>
          <option value={0}>이해도 없음</option>
          {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>이해도 {n}/5</option>)}
        </select>
        <input aria-label="메모" className={cn(control, "min-w-48 flex-1")} value={v.memo} maxLength={1000} placeholder="메모" onChange={(e) => row.setValue({ ...v, memo: e.target.value })} />
      </div>
      {row.error && <p role="alert" className="text-xs text-rose-600">{row.error}</p>}
    </li>
  );
}

function SessionItem({ record, onDone }: { record: CourseSessionProgress; onDone: () => void }) {
  const row = useRow({ progressTitle: record.progressTitle, pageStart: record.pageStart, pageEnd: record.pageEnd, difficulty: record.difficulty, pace: record.pace });
  const v = row.value;
  return (
    <li className="flex flex-wrap items-center gap-2 py-3">
      <span className="w-20 shrink-0 text-sm font-medium">{shortDate(record.date)}</span>
      <input aria-label="진도" className={cn(control, "min-w-40 flex-1")} value={v.progressTitle} maxLength={100} placeholder="진도" onChange={(e) => row.setValue({ ...v, progressTitle: e.target.value })} />
      <input aria-label="시작 쪽" className={cn(control, "w-16")} inputMode="numeric" value={v.pageStart} placeholder="쪽" onChange={(e) => row.setValue({ ...v, pageStart: e.target.value.replace(/\D/g, "") })} />
      <span className="text-muted-foreground">–</span>
      <input aria-label="끝 쪽" className={cn(control, "w-16")} inputMode="numeric" value={v.pageEnd} placeholder="쪽" onChange={(e) => row.setValue({ ...v, pageEnd: e.target.value.replace(/\D/g, "") })} />
      <select aria-label="난이도" className={control} value={v.difficulty ?? ""} onChange={(e) => row.setValue({ ...v, difficulty: (e.target.value || null) as PaceLevel | null })}>
        <option value="">난이도 -</option>
        {LEVELS.map((l) => <option key={l} value={l}>난이도 {l}</option>)}
      </select>
      <select aria-label="빠르기" className={control} value={v.pace ?? ""} onChange={(e) => row.setValue({ ...v, pace: (e.target.value || null) as PaceLevel | null })}>
        <option value="">빠르기 -</option>
        {LEVELS.map((l) => <option key={l} value={l}>빠르기 {l}</option>)}
      </select>
      <RowActions label={`${shortDate(record.date)} 수업`} dirty={row.dirty} busy={row.busy}
        onSave={() => void row.run(() => { updateSession(record, v); onDone(); })}
        onDelete={() => { if (window.confirm(`${shortDate(record.date)} 수업 진도 기록을 삭제할까요?`)) void row.run(() => { deleteSession(record); onDone(); }); }} />
      {row.error && <p role="alert" className="w-full text-xs text-rose-600">{row.error}</p>}
    </li>
  );
}

function ProblemItem({ problem, onDone }: { problem: ProblemBankProblem; onDone: () => void }) {
  const row = useRow(problem.level);
  return (
    <li className="flex items-center gap-2 py-1.5">
      <span className="w-24 shrink-0 truncate font-mono text-sm font-semibold">{problem.label}</span>
      <select aria-label={`${problem.label} 이해도`} className={control} value={row.value} disabled={row.busy}
        onChange={(e) => { const level = Number(e.target.value); row.setValue(level); void row.run(async () => { await setProblemLevel(problem.id, level); }); }}>
        {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>이해도 {n}/5</option>)}
      </select>
      <span className="flex-1" />
      <RowActions label={`${problem.label}번`} dirty={false} busy={row.busy}
        onDelete={() => { if (window.confirm(`${problem.label}번 문제를 삭제할까요?`)) void row.run(async () => { await deleteOneProblem(problem); onDone(); }); }} />
      {row.error && <p role="alert" className="text-xs text-rose-600">{row.error}</p>}
    </li>
  );
}

function PeriodSelect({ value, onChange, label }: { value: ExamPeriod; onChange: (value: ExamPeriod) => void; label: string }) {
  return (
    <select aria-label={`${label} 시험 범위`} className={control} value={value} onChange={(e) => onChange(e.target.value as ExamPeriod)}>
      {(["midterm", "final"] as ExamPeriod[]).map((p) => <option key={p} value={p}>{PERIOD_LABELS[p]}</option>)}
    </select>
  );
}

function PlanItem({ plan, period, onDone }: { plan: CoursePlan; period: ExamPeriod; onDone: () => void }) {
  const row = useRow({ title: plan.title, date: plan.date.slice(0, 10), done: plan.done });
  const v = row.value;
  return (
    <li className="flex flex-wrap items-center gap-2 py-3">
      <input type="checkbox" aria-label="완료" checked={v.done} onChange={(e) => row.setValue({ ...v, done: e.target.checked })} className="h-4 w-4" />
      <input aria-label="계획 제목" className={cn(control, "min-w-48 flex-1")} value={v.title} maxLength={120} onChange={(e) => row.setValue({ ...v, title: e.target.value })} />
      <input type="date" aria-label="날짜" className={control} value={v.date} onChange={(e) => row.setValue({ ...v, date: e.target.value })} />
      {plan.kind === "ai" && <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] font-medium text-primary">AI 코칭</span>}
      <PeriodSelect label={plan.title} value={period} onChange={(p) => { setPeriodOverride(plan.key, p); onDone(); }} />
      <RowActions label={plan.title} dirty={row.dirty} busy={row.busy}
        onSave={() => void row.run(async () => { await updatePlan(plan, v); onDone(); })}
        onDelete={() => { if (window.confirm(`「${plan.title}」 계획을 삭제할까요?`)) void row.run(async () => { await deletePlan(plan); onDone(); }); }} />
      {row.error && <p role="alert" className="w-full text-xs text-rose-600">{row.error}</p>}
    </li>
  );
}

function Section({ courseId, tab }: { courseId: string; tab: Tab }) {
  const [data, setData] = useState<{
    topics?: TopicRow[] | null; sessions?: CourseSessionProgress[]; problems?: ProblemBankProblem[]; plans?: CoursePlan[]; materials?: Material[]; midterm?: string | null;
  } | null>(null);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((n) => n + 1), []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const midterm = tab === "plans" || tab === "materials" ? await loadMidtermDate(courseId) : null;
        const next = tab === "topics" ? { topics: await loadTopics(courseId) }
          : tab === "sessions" ? { sessions: listSessions(courseId) }
            : tab === "problems" ? { problems: (await loadCourseProblems(courseId)).problems }
              : tab === "plans" ? { plans: await listPlans(courseId), midterm }
                : { materials: await listMaterials(courseId), midterm };
        if (alive) { setData(next); setError(""); }
      } catch (err) {
        if (alive) { setData({}); setError(err instanceof Error ? err.message : "불러오지 못했습니다."); }
      }
    })();
    return () => { alive = false; };
  }, [courseId, tab, version]);

  if (!data) return <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (error) return <p role="alert" className="py-6 text-sm text-rose-600">{error}</p>;
  const empty = (text: string) => <p className="py-12 text-center text-sm text-muted-foreground">{text}</p>;
  const overrides = getPeriodOverrides();

  if (tab === "topics") {
    if (data.topics === null) return empty("로그인하면 채팅과 코칭에서 기록한 주제별 이해도를 볼 수 있어요.");
    return data.topics?.length ? <ul className="divide-y">{data.topics.map((t) => <TopicItem key={`${t.id}-${t.state?.observed_at}`} topic={t} onDone={reload} />)}</ul> : empty("기록된 주제가 없어요.");
  }
  if (tab === "sessions") {
    return data.sessions?.length ? <ul className="divide-y">{data.sessions.map((s) => <SessionItem key={`${s.id}-${s.updatedAt}`} record={s} onDone={reload} />)}</ul> : empty("기록된 수업 진도가 없어요.");
  }
  if (tab === "problems") {
    const groups = new Map<string, ProblemBankProblem[]>();
    for (const p of data.problems ?? []) groups.set(p.sourceFile, [...(groups.get(p.sourceFile) ?? []), p]);
    if (!groups.size) return empty("등록된 문제가 없어요.");
    return (
      <div className="space-y-5">
        {[...groups].map(([file, list]) => (
          <div key={file}>
            <p className="mb-1 text-xs font-medium text-muted-foreground">{PERIOD_LABELS[splitSourceFile(file).period]} · {splitSourceFile(file).name || "파일 정보 없음"}</p>
            <ul>{list.sort((a, b) => compareLabels(a.label, b.label)).map((p) => <ProblemItem key={`${p.id}-${p.level}`} problem={p} onDone={reload} />)}</ul>
          </div>
        ))}
      </div>
    );
  }
  if (tab === "plans") {
    return data.plans?.length ? (
      <ul className="divide-y">{data.plans.map((p) => <PlanItem key={`${p.key}-${p.title}-${p.date}-${p.done}`} plan={p} period={resolvePeriod(p.key, p.date, data.midterm ?? null, overrides)} onDone={reload} />)}</ul>
    ) : empty("등록된 계획이 없어요.");
  }
  return data.materials?.length ? (
    <ul className="divide-y">
      {data.materials.map((m) => (
        <li key={m.key} className="flex items-center gap-2 py-2.5">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{m.title}</p>
            <p className="text-xs text-muted-foreground">{m.label} · {shortDate(m.date)}</p>
          </div>
        </li>
      ))}
    </ul>
  ) : empty("등록된 강의자료가 없어요.");
}

/** 과목 설정: 채팅·코칭으로 저장된 기록을 보고 고치거나 지운다. 고친 내용은 원래 기능의 데이터에 그대로 반영된다. */
export function CourseSettingsDialog({ courseId, courseName }: { courseId: string; courseName: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("topics");
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="과목 설정" title="과목 설정"
        className="flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-accent hover:text-foreground">
        <Settings className="h-[18px] w-[18px]" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="form" className="flex max-h-[85dvh] flex-col gap-0 p-0 sm:max-w-3xl">
          <DialogHeader className="border-b px-5 pb-3 pt-5">
            <DialogTitle>{courseName} 설정</DialogTitle>
          </DialogHeader>
          <div role="tablist" aria-label="설정 항목" className="flex gap-1 overflow-x-auto border-b px-4 py-2">
            {TABS.map((item) => (
              <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} onClick={() => setTab(item.id)}
                className={cn("shrink-0 rounded-lg px-3 py-1.5 text-sm", tab === item.id ? "bg-accent font-medium" : "text-muted-foreground hover:text-foreground")}>
                {item.label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
            {open && <Section key={tab} courseId={courseId} tab={tab} />}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
