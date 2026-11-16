"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { BookMarked, CalendarCheck, ChevronRight, Circle, CircleCheck, FileText, Loader2, Sparkles, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { NoteViewerDialog } from "@/components/notes/NoteViewerDialog";
import { ProblemDetail } from "@/components/problem-bank/ProblemDetail";
import { MY_NOTES_CHANGED_EVENT } from "@/lib/my-notes-storage";
import { compareLabels, understandingPercent } from "@/lib/problem-bank-labels";
import { splitSourceFile, type ProblemBankProblem } from "@/lib/problem-bank-storage";
import {
  deleteMaterial, deletePlan, sortMaterials, type MaterialSort, deleteProblemFile, linkedProblemFiles, listMaterials, listPlans, loadCourseProblems, loadMidtermDate,
  type CoursePlan, type Material,
} from "@/lib/course-overview/data";
import { getPeriodOverrides, PERIOD_LABELS, PERIODS_CHANGED_EVENT, resolvePeriod, type ExamPeriod } from "@/lib/course-overview/period";

/** 설정에서 무언가 고치거나 지우면 보내는 신호 → 과목 화면을 다시 읽는다 */
export const COURSE_DATA_CHANGED_EVENT = "unilink:courseDataChanged";

const LEVEL_COLORS = ["#CBD3DD", "#9DBF9E", "#7FB682", "#57A866", "#37984D", "#1E8B39"];
const shortDate = (value: string) => {
  const [, m, d] = value.slice(0, 10).split("-").map(Number);
  return m && d ? `${m}/${d}` : "";
};

interface Pending { title: string; detail: string; run: () => Promise<void> }

function Column({ icon, title, count, actions, children }: { icon: React.ReactNode; title: string; count: number; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex min-h-[18rem] flex-col rounded-2xl border bg-white lg:min-h-0" aria-label={title}>
      <header className="flex items-center gap-2 border-b px-4 py-3">
        <span className="text-muted-foreground">{icon}</span>
        <h3 className="text-sm font-semibold">{title}</h3>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs tabular-nums text-muted-foreground">{count}</span>
        <span className="ml-auto flex items-center gap-1">{actions}</span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-2">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="px-3 py-8 text-center text-sm text-muted-foreground">{text}</p>;
}

function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-label={`${label} 삭제`} title="삭제"
      className="flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-rose-50 hover:text-rose-600 lg:opacity-0 lg:focus-visible:opacity-100 lg:group-hover:opacity-100">
      <Trash2 className="h-3.5 w-3.5" />
    </button>
  );
}

function MaterialRow({ material, onDelete }: { material: Material; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="group rounded-lg hover:bg-muted/60">
      <div className="flex items-center gap-2 px-2 py-2">
        <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          {material.kind === "legacy" ? (
            <button type="button" onClick={() => setOpen((v) => !v)} className="block w-full truncate text-left text-sm">{material.title}</button>
          ) : <p className="truncate text-sm">{material.title}</p>}
          <p className="text-xs text-muted-foreground">{material.label} · {shortDate(material.date)}</p>
        </div>
        {material.kind === "note" && <span className="shrink-0 [&_button]:h-7 [&_button]:px-2 [&_button]:text-xs"><NoteViewerDialog note={material.note} triggerLabel="열기" /></span>}
        <DeleteButton label={material.title} onClick={onDelete} />
      </div>
      {open && material.kind === "legacy" && <p className="whitespace-pre-wrap px-8 pb-3 text-sm text-muted-foreground">{material.content || "내용 없음"}</p>}
    </li>
  );
}

function ProblemFile({ name, problems, onDelete }: { name: string; problems: ProblemBankProblem[]; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<string | null>(null);
  const sorted = [...problems].sort((a, b) => (a.content?.page ?? 0) - (b.content?.page ?? 0) || compareLabels(a.label, b.label));
  const lecture = problems.some((p) => p.content?.kind === "lecture");
  const percent = understandingPercent(problems);
  return (
    <li className="rounded-lg">
      <div className="group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/60">
        <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm">{name || "파일 정보 없음"}</span>
            <span className="text-xs text-muted-foreground">{lecture ? "강의노트 · " : ""}{problems.length}문항 · 이해도 {percent}%</span>
          </span>
        </button>
        <DeleteButton label={name} onClick={onDelete} />
      </div>
      {open && (
        <ul className="ml-6 border-l pl-2">
          {sorted.map((problem) => (
            <li key={problem.id}>
              <button type="button" onClick={() => setShown((id) => (id === problem.id ? null : problem.id))} aria-expanded={shown === problem.id}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted/60">
                <span className="font-mono text-[13px] font-semibold">{problem.label}</span>
                {problem.content?.check && <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-label="번호 확인 필요" />}
                <span className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-2 rounded-sm" style={{ backgroundColor: LEVEL_COLORS[problem.level] }} />{problem.level}/5
                </span>
              </button>
              {shown === problem.id && <div className="px-2 pb-2"><ProblemDetail content={problem.content} /></div>}
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/** 과목 화면 본문: 중간·기말 탭 + 강의자료 | 문제 | 계획 (보기 전용, 삭제만 가능) */
export function CourseOverview({ courseId }: { courseId: string }) {
  const [period, setPeriod] = useState<ExamPeriod>("midterm");
  const [materials, setMaterials] = useState<Material[] | null>(null);
  const [problems, setProblems] = useState<{ subjectId: string | null; problems: ProblemBankProblem[] }>({ subjectId: null, problems: [] });
  const [plans, setPlans] = useState<CoursePlan[]>([]);
  const [midterm, setMidterm] = useState<string | null>(null);
  const [overrides, setOverrides] = useState<Record<string, ExamPeriod>>({});
  const [error, setError] = useState("");
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [sort, setSort] = useState<MaterialSort>("modified");
  const [direction, setDirection] = useState<"asc" | "desc">("desc");

  const load = useCallback(async () => {
    try {
      const [m, p, pl, mid] = await Promise.all([
        listMaterials(courseId), loadCourseProblems(courseId), listPlans(courseId), loadMidtermDate(courseId),
      ]);
      setMaterials(m); setProblems(p); setPlans(pl); setMidterm(mid); setOverrides(getPeriodOverrides()); setError("");
    } catch (err) {
      setMaterials((prev) => prev ?? []);
      setError(err instanceof Error ? err.message : "과목 자료를 불러오지 못했습니다.");
    }
  }, [courseId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => void load(), 0);
    const reload = () => void load();
    const events = [COURSE_DATA_CHANGED_EVENT, PERIODS_CHANGED_EVENT, MY_NOTES_CHANGED_EVENT, "unilink:studyPlansChanged"];
    events.forEach((event) => window.addEventListener(event, reload));
    return () => { window.clearTimeout(timeout); events.forEach((event) => window.removeEventListener(event, reload)); };
  }, [load]);

  const inPeriod = useCallback((key: string, date: string) => resolvePeriod(key, date, midterm, overrides) === period, [midterm, overrides, period]);
  const shownMaterials = useMemo(() => sortMaterials((materials ?? []).filter((m) => inPeriod(m.key, m.date)), sort, direction), [materials, inPeriod, sort, direction]);
  const shownPlans = useMemo(() => plans.filter((p) => inPeriod(p.key, p.date)), [plans, inPeriod]);
  const files = useMemo(() => {
    const groups = new Map<string, ProblemBankProblem[]>();
    for (const problem of problems.problems) {
      if (splitSourceFile(problem.sourceFile).period !== period) continue;
      groups.set(problem.sourceFile, [...(groups.get(problem.sourceFile) ?? []), problem]);
    }
    return [...groups];
  }, [problems, period]);
  const counts = useMemo(() => ({
    midterm: (materials ?? []).filter((m) => resolvePeriod(m.key, m.date, midterm, overrides) === "midterm").length
      + problems.problems.filter((p) => splitSourceFile(p.sourceFile).period === "midterm").length
      + plans.filter((p) => resolvePeriod(p.key, p.date, midterm, overrides) === "midterm").length,
    final: (materials ?? []).filter((m) => resolvePeriod(m.key, m.date, midterm, overrides) === "final").length
      + problems.problems.filter((p) => splitSourceFile(p.sourceFile).period === "final").length
      + plans.filter((p) => resolvePeriod(p.key, p.date, midterm, overrides) === "final").length,
  }), [materials, problems, plans, midterm, overrides]);

  async function askMaterial(material: Material) {
    const linked = await linkedProblemFiles(courseId, material).catch(() => []);
    const problemCount = linked.reduce((n, f) => n + f.count, 0);
    setPending({
      title: `「${material.title}」을 삭제할까요?`,
      detail: [
        "나의 노트와 저장된 파일에서도 지워져요.",
        problemCount ? `이 자료에서 만든 문제 ${problemCount}개와 이해도 기록도 함께 지워져요.` : "",
        material.kind === "note" && material.note.driveFileId ? "Google Drive 원본은 남고, 다시 가져오지 않아요." : "",
      ].filter(Boolean).join(" "),
      run: () => deleteMaterial(courseId, material),
    });
  }

  async function confirm() {
    if (!pending) return;
    setBusy(true);
    try {
      await pending.run();
      setPending(null);
      window.dispatchEvent(new Event(COURSE_DATA_CHANGED_EVENT));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제하지 못했습니다.");
      setPending(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="시험 범위" className="inline-flex rounded-xl border bg-white p-1">
        {(["midterm", "final"] as ExamPeriod[]).map((value) => (
          <button key={value} type="button" role="tab" aria-selected={period === value} onClick={() => setPeriod(value)}
            className={cn("rounded-lg px-4 py-1.5 text-sm font-medium transition-colors",
              period === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}>
            {PERIOD_LABELS[value]}<span className="ml-1.5 text-xs opacity-60">{counts[value]}</span>
          </button>
        ))}
      </div>

      {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      {materials === null ? (
        <div className="flex justify-center py-16"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : (
        <div className="grid gap-4 lg:h-[calc(100dvh-var(--app-top,0px)-22rem)] lg:min-h-[26rem] lg:grid-cols-3">
          <Column icon={<FileText className="h-4 w-4" />} title="강의자료" count={shownMaterials.length} actions={<>
            <select aria-label="정렬" value={sort} onChange={(e) => setSort(e.target.value as MaterialSort)} className="rounded-md border-0 bg-transparent py-0.5 text-xs text-muted-foreground hover:bg-muted">
              <option value="modified">수정일</option><option value="name">이름</option><option value="type">종류</option>
            </select>
            <select aria-label="정렬 순서" value={direction} onChange={(e) => setDirection(e.target.value as "asc" | "desc")} className="rounded-md border-0 bg-transparent py-0.5 text-xs text-muted-foreground hover:bg-muted">
              <option value="desc">내림차순</option><option value="asc">오름차순</option>
            </select>
          </>}>
            {shownMaterials.length ? (
              <ul>{shownMaterials.map((m) => <MaterialRow key={m.key} material={m} onDelete={() => void askMaterial(m)} />)}</ul>
            ) : <Empty text="등록된 강의자료가 없어요" />}
          </Column>

          <Column icon={<BookMarked className="h-4 w-4" />} title="문제" count={files.reduce((n, [, list]) => n + list.length, 0)}>
            {files.length ? (
              <ul>{files.map(([file, list]) => (
                <ProblemFile key={file} name={splitSourceFile(file).name} problems={list} onDelete={() => setPending({
                  title: `「${splitSourceFile(file).name}」의 문제 ${list.length}개를 삭제할까요?`,
                  detail: "문제은행과 이해도 기록에서도 지워져요.",
                  run: () => deleteProblemFile(problems.subjectId!, file, problems.problems),
                })} />
              ))}</ul>
            ) : <Empty text="등록된 문제가 없어요" />}
          </Column>

          <Column icon={<CalendarCheck className="h-4 w-4" />} title="계획" count={shownPlans.length}>
            {shownPlans.length ? (
              <ul>{shownPlans.map((plan) => (
                <li key={plan.key} className="group flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/60">
                  {plan.done ? <CircleCheck className="h-4 w-4 shrink-0 text-emerald-600" aria-label="완료" /> : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" aria-label="미완료" />}
                  <div className="min-w-0 flex-1">
                    <p className={cn("truncate text-sm", plan.done && "text-muted-foreground line-through")}>{plan.title}</p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      {shortDate(plan.date)}{plan.kind === "ai" && <><span>·</span><Sparkles className="h-3 w-3" />AI 코칭</>}
                    </p>
                  </div>
                  <DeleteButton label={plan.title} onClick={() => setPending({
                    title: `「${plan.title}」 계획을 삭제할까요?`,
                    detail: plan.kind === "ai" ? "AI 코칭 계획에서 취소돼요." : "학습 계획·월간 계획·시간표 일정에서도 지워져요.",
                    run: () => deletePlan(plan),
                  })} />
                </li>
              ))}</ul>
            ) : <Empty text="등록된 계획이 없어요" />}
          </Column>
        </div>
      )}

      <Dialog open={pending !== null} onOpenChange={(open) => { if (!open && !busy) setPending(null); }}>
        <DialogContent showCloseButton={false} className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pending?.title}</DialogTitle>
            <DialogDescription>{pending?.detail}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button" onClick={() => setPending(null)} disabled={busy} className="rounded-lg border px-3 py-1.5 text-sm">취소</button>
            <button type="button" onClick={() => void confirm()} disabled={busy} className="flex items-center gap-1.5 rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60">
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" />}삭제
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
