"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Upload,
  Plus,
  Loader2,
  Trash2,
  FileText,
  X,
  ChevronRight,
  ImageOff,
  PencilLine,
  CheckCircle2,
} from "lucide-react";
import { Header } from "@/components/layout/Header";
import { getActiveTermCourses } from "@/lib/course-storage";
import {
  createSubject,
  deleteFile,
  deleteSubject,
  EXAM_PERIODS,
  joinSourceFile,
  splitSourceFile,
  syncSubjectsWithCourses,
  type ExamPeriod,
  deleteProblem,
  listProblems,
  listSubjects,
  renameProblem,
  saveProblems,
  setProblemContent,
  setProblemLevel,
  ProblemBankProblem,
  ProblemBankSubject,
} from "@/lib/problem-bank-storage";
import { compareLabels, expandLabels, understandingPercent } from "@/lib/problem-bank-labels";
import { ProblemExtractionError } from "@/lib/problem-bank-pdf";
import {
  analyzeProblemPdf, getProblemConsent, problemAiAvailable, saveAnalyzedProblems, setProblemConsent,
  type AnalysisResult, type ProblemConsent,
} from "@/lib/problem-bank/analyze";
import { removeCrops } from "@/lib/problem-bank/images";
import { ProblemDetail } from "@/components/problem-bank/ProblemDetail";

// 원본: eugenepark0404/AJOUBuild-problembank의 frontend/src/App.jsx.
// PDF -> (브라우저에서 문항 번호 인식) -> 사용자 확인·수정 -> 업로드. 목록은 파일 단위로 보여준다.
// mastery scale (0–5)
const LEVELS = [
  { v: 0, name: "미학습", desc: "아직 공부 안 함" },
  { v: 1, name: "읽음", desc: "문제만 읽어봄" },
  { v: 2, name: "답안풀이", desc: "답안 보고 풂" },
  { v: 3, name: "이해", desc: "답안 이해함" },
  { v: 4, name: "자력시도", desc: "답안 없이 혼자 풀기" },
  { v: 5, name: "마스터", desc: "문제 마스터" },
];
const RAMP = ["#CBD3DD", "#9DBF9E", "#7FB682", "#57A866", "#37984D", "#1E8B39"];
const EMPTY_SEG = "#EBEFF4";
const INK = "#1B2333";
const ACCENT = "#4F46E5";
const RANGE_HINT = "예: 1~10, 2.1~2.5, 3(a~c), 4";

const rampFor = (percent: number) => RAMP[Math.round((percent / 100) * 5)];
const messageOf = (err: unknown, fallback: string) => (err instanceof Error ? err.message : fallback);

interface ReviewState {
  fileName: string;
  labels: string[];
}

interface FailureState {
  fileName: string;
  message: string;
  image: boolean;
}

function Meter({ level, onSet }: { level: number; onSet: (level: number) => void }) {
  return (
    <div className="flex items-center gap-[3px]">
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const filled = i <= level;
        const active = i === level;
        return (
          <button
            key={i}
            onClick={() => onSet(i)}
            title={`${i} · ${LEVELS[i].name}`}
            className="h-6 w-6 rounded-[5px] flex items-center justify-center text-[11px] font-semibold transition-all"
            style={{
              backgroundColor: filled ? RAMP[level] : EMPTY_SEG,
              color: filled ? (level >= 1 ? "#fff" : "#5B6472") : "#AEB6C2",
              boxShadow: active
                ? `0 0 0 2px #fff, 0 0 0 3.5px ${level >= 1 ? RAMP[level] : "#94A0B0"}`
                : "none",
            }}
          >
            {i}
          </button>
        );
      })}
    </div>
  );
}

function PercentBar({ percent }: { percent: number }) {
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 overflow-hidden rounded-full" style={{ backgroundColor: EMPTY_SEG }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${percent}%`, backgroundColor: rampFor(percent) }}
        />
      </div>
      <span
        className="w-10 text-right text-[13px] font-semibold tabular-nums"
        style={{ color: percent ? rampFor(percent) : "#8A94A3" }}
      >
        {percent}%
      </span>
    </div>
  );
}

// 입력한 범위를 Enter로 문항 번호 목록으로 펼친다
function LabelAdder({
  onAdd,
  autoFocus,
  compact,
}: {
  onAdd: (labels: string[]) => void;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const [text, setText] = useState("");
  const submit = () => {
    const labels = expandLabels(text);
    if (!labels.length) return;
    onAdd(labels);
    setText("");
  };
  const size = compact ? "py-1.5 text-[12px]" : "py-2 text-[13px]";
  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus={autoFocus}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder={`문항 번호 추가 (${RANGE_HINT})`}
        className={`min-w-0 flex-1 rounded-lg border bg-white px-3 outline-none focus:border-indigo-400 ${size}`}
        style={{ borderColor: "#DDE3EC" }}
      />
      <button
        onClick={submit}
        disabled={!text.trim()}
        className={`flex shrink-0 items-center gap-1 rounded-lg px-3 font-medium text-white disabled:opacity-40 ${size}`}
        style={{ backgroundColor: ACCENT }}
      >
        <Plus size={14} /> 추가
      </button>
    </div>
  );
}

// ── 업로드 전 확인: 번호 수정·삭제·추가 후 업로드 ──
interface DraftItem {
  id: number;
  value: string;
}
let draftId = 0;
const toDraft = (labels: string[]): DraftItem[] => labels.map((value) => ({ id: ++draftId, value }));

function ReviewPanel({
  initial,
  existingFiles,
  onCancel,
  onSubmit,
}: {
  initial: ReviewState;
  existingFiles: Map<string, ProblemBankProblem[]>;
  onCancel: () => void;
  onSubmit: (fileName: string, labels: string[]) => Promise<void>;
}) {
  const [fileName, setFileName] = useState(initial.fileName);
  const [items, setItems] = useState(() => toDraft(initial.labels));
  const [saving, setSaving] = useState(false);
  const manual = initial.labels.length === 0;

  const existing = existingFiles.get(fileName.trim());
  const existingLabels = useMemo(() => new Set((existing ?? []).map((p) => p.label)), [existing]);
  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.value.trim(), (counts.get(it.value.trim()) ?? 0) + 1);
  const invalid = items.some((it) => !it.value.trim() || (counts.get(it.value.trim()) ?? 0) > 1);
  const newCount = new Set(items.map((it) => it.value.trim()).filter((v) => v && !existingLabels.has(v))).size;
  const canSave = Boolean(fileName.trim()) && items.length > 0 && !invalid && newCount > 0 && !saving;

  const add = (labels: string[]) => {
    const present = new Set(items.map((it) => it.value.trim()));
    setItems((prev) => [...prev, ...toDraft(labels.filter((l) => !present.has(l)))]);
  };
  const update = (id: number, value: string) =>
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, value } : it)));
  const remove = (id: number) => setItems((prev) => prev.filter((it) => it.id !== id));

  const submit = async () => {
    setSaving(true);
    try {
      await onSubmit(fileName.trim(), items.map((it) => it.value.trim()));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-5 rounded-2xl border bg-white p-5" style={{ borderColor: "#C7CBF5" }}>
      <div className="flex items-start gap-2.5">
        {manual ? (
          <PencilLine size={18} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />
        ) : (
          <CheckCircle2 size={18} className="mt-0.5 shrink-0" style={{ color: ACCENT }} />
        )}
        <p className="text-[13px] leading-relaxed text-slate-600">
          {manual ? (
            <>
              <b style={{ color: INK }}>문항 번호를 직접 입력해 주세요.</b> 쉼표나 줄바꿈으로 여러 개를 한 번에 넣을
              수 있어요.
            </>
          ) : (
            <>
              <b style={{ color: INK }}>{initial.labels.length}개 문항을 인식했어요.</b> 소문항이나 문제 번호가 틀렸을 수
              있으니, 확인하고 고친 뒤 업로드해 주세요.
            </>
          )}
        </p>
      </div>

      <label className="mt-4 block text-[12px] font-medium text-slate-500">파일 이름</label>
      <input
        value={fileName}
        onChange={(e) => setFileName(e.target.value)}
        placeholder="예: 전자장론 과제1"
        maxLength={180}
        className="mt-1 w-full rounded-lg border px-3 py-2 text-[14px] font-medium outline-none focus:border-indigo-400"
        style={{ borderColor: "#DDE3EC", color: INK }}
      />
      {existing && (
        <p className="mt-1 text-[12px] text-amber-700">
          같은 이름의 파일이 이미 있어요. 이미 있는 문항은 건너뛰고 새 문항만 추가돼요.
        </p>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className="text-[12px] font-medium text-slate-500">
          문항 {items.length}개{existing ? ` · 새 문항 ${newCount}개` : ""}
        </span>
        {items.length > 0 && (
          <button onClick={() => setItems([])} className="text-[12px] text-slate-400 hover:text-rose-500">
            모두 지우기
          </button>
        )}
      </div>
      {items.length > 0 && (
        <div
          className="mt-2 flex max-h-72 flex-wrap gap-1.5 overflow-y-auto rounded-xl p-2"
          style={{ backgroundColor: "#F6F7FA" }}
        >
          {items.map((it) => {
            const v = it.value.trim();
            const bad = !v || (counts.get(v) ?? 0) > 1;
            const skipped = !bad && existingLabels.has(v);
            return (
              <div
                key={it.id}
                className="flex items-center rounded-md border bg-white pl-2 pr-0.5"
                style={{
                  borderColor: bad ? "#F43F5E" : skipped ? "#E4E9F0" : "#DDE3EC",
                  opacity: skipped ? 0.5 : 1,
                }}
                title={bad ? (v ? "중복된 번호예요" : "비어 있어요") : skipped ? "이미 있는 문항이라 건너뛰어요" : undefined}
              >
                <input
                  value={it.value}
                  onChange={(e) => update(it.id, e.target.value)}
                  size={Math.max(3, it.value.length)}
                  maxLength={40}
                  className="bg-transparent py-1 font-mono text-[13px] font-semibold outline-none"
                  style={{ color: INK }}
                />
                <button
                  onClick={() => remove(it.id)}
                  aria-label={`${it.value} 삭제`}
                  className="rounded p-0.5 text-slate-300 hover:text-rose-500"
                >
                  <X size={13} />
                </button>
              </div>
            );
          })}
        </div>
      )}
      {invalid && (
        <p className="mt-1.5 text-[12px] text-rose-600">빨간 칸은 비어 있거나 중복된 번호예요. 고치거나 지워 주세요.</p>
      )}

      <div className="mt-3">
        <LabelAdder onAdd={add} autoFocus={manual} />
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-xl px-4 py-2.5 text-[14px] font-medium text-slate-500 hover:bg-slate-100"
        >
          취소
        </button>
        <button
          onClick={submit}
          disabled={!canSave}
          className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-40"
          style={{ backgroundColor: ACCENT }}
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          {newCount}문항 업로드
        </button>
      </div>
    </div>
  );
}

// ── 인식 실패: 이유를 알리고 직접 입력을 제안 ──
function FailurePrompt({
  failure,
  onManual,
  onCancel,
}: {
  failure: FailureState;
  onManual: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="mt-5 rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start gap-2.5">
        <ImageOff size={18} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="text-[13px] leading-relaxed text-amber-900">
          <p className="font-semibold">
            {failure.image
              ? "PDF의 문제가 이미지로 되어 있어 인식하지 못했어요."
              : "PDF에서 문항 번호를 인식하지 못했어요."}
          </p>
          <p className="mt-0.5 text-amber-800">{failure.message}</p>
          <p className="mt-3 font-medium" style={{ color: INK }}>
            「{failure.fileName}」의 문항 번호를 직접 추가하시겠습니까?
          </p>
        </div>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="rounded-xl px-4 py-2 text-[14px] font-medium text-slate-500 hover:bg-amber-100"
        >
          아니요
        </button>
        <button
          onClick={onManual}
          className="flex items-center gap-1.5 rounded-xl px-4 py-2 text-[14px] font-semibold text-white"
          style={{ backgroundColor: ACCENT }}
        >
          <PencilLine size={15} /> 직접 입력하기
        </button>
      </div>
    </div>
  );
}

// 번호를 누르면 문제가 펼쳐지고, 연필 버튼으로 번호를 고친다
function EditableLabel({
  label,
  open,
  check,
  onOpen,
  onRename,
}: {
  label: string;
  open: boolean;
  check: boolean;
  onOpen: () => void;
  onRename: (label: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(label);
  const finish = (save: boolean) => {
    setEditing(false);
    const next = value.trim();
    if (save && next && next !== label) onRename(next);
    else setValue(label);
  };
  if (!editing) {
    return (
      <div className="flex w-32 shrink-0 items-center">
        <button
          onClick={onOpen}
          aria-expanded={open}
          title="문제 보기"
          className="-mx-1 flex min-w-0 items-center gap-1 rounded px-1 text-left font-mono text-[14px] font-semibold hover:bg-slate-100"
          style={{ color: INK }}
        >
          <ChevronRight size={13} className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`} />
          <span className="truncate">{label}</span>
          {check && <span className="ml-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-label="확인 필요" />}
        </button>
        <button
          onClick={() => {
            setValue(label);
            setEditing(true);
          }}
          title="번호 수정"
          aria-label={`${label} 번호 수정`}
          className="ml-0.5 shrink-0 rounded p-1 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-slate-600"
        >
          <PencilLine size={12} />
        </button>
      </div>
    );
  }
  return (
    <input
      autoFocus
      value={value}
      maxLength={40}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => finish(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") finish(true);
        if (e.key === "Escape") finish(false);
      }}
      className="-mx-1 w-28 shrink-0 rounded border px-1 font-mono text-[14px] font-semibold outline-none"
      style={{ borderColor: ACCENT, color: INK }}
    />
  );
}

// ── 업로드한 파일 하나: 이름 + 이해도 %, 누르면 문항 목록이 펼쳐진다 ──
function FileGroup({
  name,
  problems,
  open,
  onToggle,
  onLevel,
  onRename,
  onRemove,
  onAdd,
  onRemoveFile,
  onConfirm,
}: {
  name: string;
  problems: ProblemBankProblem[];
  open: boolean;
  onToggle: () => void;
  onLevel: (id: string, level: number) => void;
  onRename: (id: string, label: string) => void;
  onRemove: (id: string) => void;
  onAdd: (labels: string[]) => void;
  onRemoveFile: () => void;
  onConfirm: (id: string) => void;
}) {
  const percent = understandingPercent(problems);
  const sorted = [...problems].sort((a, b) =>
    (a.content?.page ?? 0) - (b.content?.page ?? 0) || compareLabels(a.label, b.label));
  const [shown, setShown] = useState<Set<string>>(() => new Set());
  const lecture = problems.some((p) => p.content?.kind === "lecture");
  const checks = problems.filter((p) => p.content?.check).length;
  const toggleShown = (id: string) =>
    setShown((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <div className="border-t first:border-t-0" style={{ borderColor: "#EEF1F6" }}>
      <button
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50"
      >
        <ChevronRight
          size={16}
          className={`shrink-0 text-slate-400 transition-transform ${open ? "rotate-90" : ""}`}
        />
        <FileText size={17} className="shrink-0" style={{ color: ACCENT }} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {lecture && (
              <span className="shrink-0 rounded bg-indigo-50 px-1.5 py-0.5 text-[11px] font-medium" style={{ color: ACCENT }}>
                강의노트
              </span>
            )}
            <span className="truncate text-[14px] font-semibold" style={{ color: INK }}>
              {name || "파일 정보 없음"}
            </span>
          </div>
          <div className="text-[12px] text-slate-400">
            {problems.length}문항
            {checks > 0 && <span className="ml-1.5 text-amber-600">확인 필요 {checks}</span>}
          </div>
        </div>
        <PercentBar percent={percent} />
      </button>

      {open && (
        <div className="border-t pb-3" style={{ borderColor: "#EEF1F6", backgroundColor: "#FBFCFD" }}>
          {sorted.map((p) => (
            <div key={p.id}>
            <div className="group flex items-center gap-3 py-2 pl-12 pr-4">
              <EditableLabel
                label={p.label}
                open={shown.has(p.id)}
                check={Boolean(p.content?.check)}
                onOpen={() => toggleShown(p.id)}
                onRename={(label) => onRename(p.id, label)}
              />
              <div className="flex-1">
                <Meter level={p.level} onSet={(l) => onLevel(p.id, l)} />
              </div>
              <div
                className="hidden w-20 shrink-0 text-right text-[12px] sm:block"
                style={{ color: RAMP[p.level] }}
              >
                {LEVELS[p.level].name}
              </div>
              <button
                onClick={() => onRemove(p.id)}
                title="문항 삭제"
                className="shrink-0 rounded-md p-1.5 text-slate-300 opacity-0 transition group-hover:opacity-100 hover:bg-slate-100 hover:text-rose-500"
              >
                <Trash2 size={15} />
              </button>
            </div>
            {shown.has(p.id) && (
              <div className="pb-2 pl-[3.25rem] pr-4">
                <ProblemDetail content={p.content} onConfirm={() => onConfirm(p.id)} onRemove={() => onRemove(p.id)} />
              </div>
            )}
            </div>
          ))}
          <div className="mt-2 flex items-center gap-3 pl-12 pr-4">
            <div className="flex-1">
              <LabelAdder compact onAdd={onAdd} />
            </div>
            <button
              onClick={onRemoveFile}
              className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] text-slate-400 hover:bg-rose-50 hover:text-rose-600"
            >
              <Trash2 size={13} /> 파일 삭제
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ProblemBankPage() {
  const [subjects, setSubjects] = useState<ProblemBankSubject[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [problems, setProblems] = useState<ProblemBankProblem[]>([]);
  const [ready, setReady] = useState(false);
  const [newSubject, setNewSubject] = useState("");
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [review, setReview] = useState<ReviewState | null>(null);
  const [failure, setFailure] = useState<FailureState | null>(null);
  const [openFiles, setOpenFiles] = useState<Set<string>>(() => new Set());
  const [period, setPeriod] = useState<ExamPeriod>("midterm");
  const fileRef = useRef<HTMLInputElement>(null);
  // 문제 내용 AI 분석: 로그인 계정에서만, 처음 한 번 동의를 받는다
  const [aiAvailable, setAiAvailable] = useState(false);
  const [consent, setConsent] = useState<ProblemConsent>(null);
  const [askFile, setAskFile] = useState<File | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  // AI 없이 규칙으로만 읽은 결과: 사용자가 번호를 확인한 뒤 크롭 그림을 붙인다
  const pendingAnalysis = useRef<AnalysisResult | null>(null);

  useEffect(() => {
    void problemAiAvailable().then(setAiAvailable);
    const timeout = window.setTimeout(() => setConsent(getProblemConsent()), 0);
    return () => window.clearTimeout(timeout);
  }, []);

  const loadSubjects = async () => {
    const subs = await listSubjects();
    setSubjects(subs);
    return subs;
  };

  const reloadProblems = async () => {
    if (activeId) setProblems(await listProblems(activeId));
  };

  useEffect(() => {
    (async () => {
      try {
        // 이번 학기 시간표 과목을 문제은행 과목으로 자동 연동 (실패해도 기존 목록은 보여준다)
        await syncSubjectsWithCourses(getActiveTermCourses().courses.map(({ id, name }) => ({ id, name })))
          .catch((err) => setError(messageOf(err, "시간표 과목을 연동하지 못했습니다.")));
        const subs = await loadSubjects();
        if (subs.length) setActiveId(subs[0].id);
      } catch (err) {
        setError(messageOf(err, "과목을 불러오지 못했습니다."));
      } finally {
        setReady(true);
      }
    })();
  }, []);

  useEffect(() => {
    const task = activeId ? listProblems(activeId) : Promise.resolve([]);
    task
      .then(setProblems)
      .catch((err) => setError(messageOf(err, "문제를 불러오지 못했습니다.")));
  }, [activeId]);

  const active = subjects.find((s) => s.id === activeId) || null;

  // 선택한 시험 범위의 문항만 파일별로 묶고, 최근에 올린 파일을 위로. 키는 저장된 source_file 그대로.
  const periodProblems = useMemo(
    () => problems.filter((p) => splitSourceFile(p.sourceFile).period === period),
    [problems, period],
  );
  const files = useMemo(() => {
    const groups = new Map<string, ProblemBankProblem[]>();
    for (const p of periodProblems) {
      const list = groups.get(p.sourceFile);
      if (list) list.push(p);
      else groups.set(p.sourceFile, [p]);
    }
    return groups;
  }, [periodProblems]);
  const filesByName = useMemo(
    () => new Map([...files].map(([raw, list]) => [splitSourceFile(raw).name, list])),
    [files],
  );
  const rawFor = (name: string) =>
    [...files.keys()].find((raw) => splitSourceFile(raw).name === name) ?? joinSourceFile(period, name);
  const periodCount = (value: ExamPeriod) =>
    problems.filter((p) => splitSourceFile(p.sourceFile).period === value).length;
  const fileOrder = useMemo(() => {
    const firstSeen = (list: ProblemBankProblem[]) =>
      list.reduce((min, p) => (p.createdAt < min ? p.createdAt : min), list[0].createdAt);
    return [...files.entries()]
      .sort((a, b) => firstSeen(b[1]).localeCompare(firstSeen(a[1])))
      .map(([name]) => name);
  }, [files]);

  const addSubject = async () => {
    const name = newSubject.trim();
    if (!name) return;
    try {
      const created = await createSubject(name);
      await loadSubjects();
      selectSubject(created.id);
      setNewSubject("");
      setAdding(false);
    } catch (err) {
      setError(messageOf(err, "과목을 추가하지 못했습니다."));
    }
  };

  const removeSubject = async () => {
    if (!active) return;
    const message = active.count
      ? `「${active.name}」 과목과 ${active.count}문항의 이해도 기록을 모두 삭제할까요?`
      : `「${active.name}」 과목을 삭제할까요?`;
    if (!window.confirm(message)) return;
    try {
      await deleteSubject(active);
      const subs = await loadSubjects();
      selectSubject(subs[0]?.id ?? "");
    } catch (err) {
      setError(messageOf(err, "과목을 삭제하지 못했습니다."));
    }
  };

  const selectSubject = (id: string) => {
    setActiveId(id || null);
    setError("");
    setNotice("");
    setReview(null);
    setFailure(null);
    setOpenFiles(new Set());
  };

  const toggleFile = (name: string) =>
    setOpenFiles((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const setLevel = async (pid: string, lvl: number) => {
    setProblems((prev) => prev.map((p) => (p.id === pid ? { ...p, level: lvl } : p)));
    try {
      await setProblemLevel(pid, lvl);
    } catch (err) {
      setError(messageOf(err, "이해도를 저장하지 못했습니다."));
      reloadProblems();
    }
  };

  const rename = async (pid: string, label: string) => {
    setError("");
    try {
      const updated = await renameProblem(pid, label);
      setProblems((prev) => prev.map((p) => (p.id === pid ? updated : p)));
    } catch (err) {
      setError(messageOf(err, "문항 번호를 바꾸지 못했습니다."));
    }
  };

  const confirmProblem = async (pid: string) => {
    const target = problems.find((p) => p.id === pid);
    if (!target?.content) return;
    const content = { ...target.content, check: false };
    setProblems((prev) => prev.map((p) => (p.id === pid ? { ...p, content } : p)));
    try {
      await setProblemContent(pid, content);
    } catch (err) {
      setError(messageOf(err, "확인 상태를 저장하지 못했습니다."));
      reloadProblems();
    }
  };

  const removeProblem = async (pid: string) => {
    const prevProblems = problems;
    const images = problems.find((p) => p.id === pid)?.content?.images.map((image) => image.src) ?? [];
    setProblems((prev) => prev.filter((p) => p.id !== pid));
    try {
      await deleteProblem(pid);
      void removeCrops(images);
      setSubjects((prev) =>
        prev.map((s) => (s.id === activeId ? { ...s, count: Math.max(0, s.count - 1) } : s)),
      );
    } catch (err) {
      setError(messageOf(err, "문제를 삭제하지 못했습니다."));
      setProblems(prevProblems);
    }
  };

  const removeFile = async (name: string) => {
    if (!activeId) return;
    const count = files.get(name)?.length ?? 0;
    const label = splitSourceFile(name).name || "파일 정보 없음";
    if (!window.confirm(`「${label}」의 ${count}문항과 기록한 이해도를 모두 삭제할까요?`)) return;
    try {
      const images = (files.get(name) ?? []).flatMap((p) => p.content?.images.map((image) => image.src) ?? []);
      await deleteFile(activeId, name);
      void removeCrops(images);
      await reloadProblems();
      await loadSubjects();
    } catch (err) {
      setError(messageOf(err, "파일을 삭제하지 못했습니다."));
    }
  };

  const addToFile = async (name: string, labels: string[]) => {
    if (!activeId) return;
    setError("");
    try {
      const result = await saveProblems(activeId, name, labels);
      await reloadProblems();
      await loadSubjects();
      if (result.skippedCount) setNotice(`이미 있는 ${result.skippedCount}문항은 건너뛰었어요.`);
    } catch (err) {
      setError(messageOf(err, "문항을 추가하지 못했습니다."));
    }
  };

  // 1) PDF를 브라우저에서 읽는다. 처음이면 AI 분석 동의를 먼저 묻는다.
  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !active) return;
    setError("");
    setNotice("");
    setReview(null);
    setFailure(null);
    if (aiAvailable && consent === null) {
      setAskFile(file);
      return;
    }
    await analyze(file, aiAvailable && consent === "granted");
  };

  const answerConsent = async (value: "granted" | "declined") => {
    setProblemConsent(value);
    setConsent(value);
    const file = askFile;
    setAskFile(null);
    if (file) await analyze(file, aiAvailable && value === "granted");
  };

  // 2) AI로 읽었으면 규칙과 AI가 같이 찾은 번호는 바로 저장하고 다른 번호는 "확인 필요"로 표시한다.
  //    AI 없이 규칙으로만 읽었으면 지금처럼 번호 목록을 확인받은 뒤 저장한다(그림 크롭은 함께 붙인다).
  const analyze = async (file: File, useAi: boolean) => {
    if (!active) return;
    setBusy(true);
    setProgress(null);
    pendingAnalysis.current = null;
    try {
      const result = await analyzeProblemPdf(file, { mode: "problems", useAi, onProgress: (done, total) => setProgress({ done, total }) });
      if (!result.aiUsed) {
        pendingAnalysis.current = result;
        setReview({ fileName: file.name, labels: result.problems.map((p) => p.label) });
        if (result.aiError) setNotice(`AI 분석을 하지 못해 번호만 찾았어요. (${result.aiError})`);
        return;
      }
      const raw = rawFor(file.name);
      const saved = await saveAnalyzedProblems(active.id, raw, result.problems, "problem");
      await reloadProblems();
      await loadSubjects();
      setOpenFiles((prev) => new Set(prev).add(raw));
      setNotice(
        `「${file.name}」에서 ${result.problems.length}문항을 찾았어요.` +
          (saved.addedCount < result.problems.length ? ` 새 문항 ${saved.addedCount}개, 기존 문항 ${result.problems.length - saved.addedCount}개는 내용만 채웠어요.` : "") +
          (saved.check ? ` 번호 확인이 필요한 문항이 ${saved.check}개 있어요.` : "") +
          (result.aiError ? ` 일부 페이지는 AI로 보지 못했어요. (${result.aiError})` : ""),
      );
    } catch (err) {
      if (err instanceof ProblemExtractionError && (err.code === "NO_TEXT" || err.code === "NO_PROBLEMS")) {
        setFailure({ fileName: file.name, message: err.message, image: err.code === "NO_TEXT" });
      } else {
        setError(messageOf(err, "PDF를 읽지 못했어요. 다른 파일로 다시 시도해 주세요."));
      }
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  // 3) 사용자가 확인한 목록만 저장
  const saveReview = async (fileName: string, labels: string[]) => {
    if (!active) return;
    setError("");
    try {
      const raw = rawFor(fileName);
      const result = await saveProblems(active.id, raw, labels);
      const pending = pendingAnalysis.current;
      pendingAnalysis.current = null;
      if (pending) {
        const keep = new Set(labels);
        await saveAnalyzedProblems(active.id, raw, pending.problems.filter((p) => keep.has(p.label)), "problem");
      }
      setReview(null);
      await reloadProblems();
      await loadSubjects();
      setOpenFiles((prev) => new Set(prev).add(raw));
      setNotice(
        `「${fileName}」에 ${result.addedCount}문항을 업로드했어요.` +
          (result.skippedCount ? ` 이미 있던 ${result.skippedCount}문항은 건너뛰었어요.` : ""),
      );
    } catch (err) {
      setError(messageOf(err, "문항을 업로드하지 못했습니다."));
    }
  };

  const stats = (() => {
    if (!active || periodProblems.length === 0) return null;
    const mastered = periodProblems.filter((p) => p.level === 5).length;
    return { n: periodProblems.length, files: files.size, percent: understandingPercent(periodProblems), mastered };
  })();

  return (
    <div className="flex min-h-screen flex-col">
      <Header title="문제은행" />
      <main className="w-full flex-1 font-sans" style={{ backgroundColor: "#F6F7FA", color: INK }}>
        <div className="mx-auto max-w-3xl px-5 py-8">
          <h1 className="text-[26px] font-bold leading-tight">문제은행</h1>

          {!ready ? null : (
            <>
              <div className="mt-6 flex flex-wrap items-center gap-2">
                {subjects.map((s) => {
                  const on = s.id === activeId;
                  return (
                    <button
                      key={s.id}
                      onClick={() => selectSubject(s.id)}
                      className="rounded-full px-3.5 py-1.5 text-[13px] font-medium transition-all border"
                      style={
                        on
                          ? { backgroundColor: INK, color: "#fff", borderColor: INK }
                          : { backgroundColor: "#fff", color: "#42506A", borderColor: "#DDE3EC" }
                      }
                    >
                      {s.name}
                      <span className="ml-1.5 opacity-60">{s.count}</span>
                    </button>
                  );
                })}
                {adding ? (
                  <div
                    className="flex items-center gap-1 rounded-full border bg-white pl-3 pr-1 py-1"
                    style={{ borderColor: ACCENT }}
                  >
                    <input
                      autoFocus
                      value={newSubject}
                      onChange={(e) => setNewSubject(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") addSubject();
                        if (e.key === "Escape") {
                          setAdding(false);
                          setNewSubject("");
                        }
                      }}
                      placeholder="과목명 (예: 전자기학)"
                      className="w-40 bg-transparent text-[13px] outline-none"
                    />
                    <button
                      onClick={addSubject}
                      className="rounded-full p-1 text-white"
                      style={{ backgroundColor: ACCENT }}
                    >
                      <Plus size={15} />
                    </button>
                    <button
                      onClick={() => {
                        setAdding(false);
                        setNewSubject("");
                      }}
                      className="rounded-full p-1 text-slate-400"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setAdding(true)}
                    className="flex items-center gap-1 rounded-full border border-dashed px-3 py-1.5 text-[13px] font-medium text-slate-500 hover:text-slate-700"
                    style={{ borderColor: "#C4CCD8" }}
                  >
                    <Plus size={14} /> 과목 추가
                  </button>
                )}
              </div>

              {!active ? (
                <div
                  className="mt-10 rounded-2xl border border-dashed py-16 text-center"
                  style={{ borderColor: "#D2D9E3" }}
                >
                  <p className="text-[15px] font-medium">시간표에 과목을 추가하거나 과목을 직접 만들어 주세요.</p>
                </div>
              ) : (
                <>
                  <div className="mt-5 flex items-center justify-between gap-3 border-b" style={{ borderColor: "#E4E9F0" }}>
                    <div className="flex gap-1" role="tablist" aria-label="시험 범위">
                      {(Object.keys(EXAM_PERIODS) as ExamPeriod[]).map((value) => (
                        <button
                          key={value}
                          role="tab"
                          aria-selected={period === value}
                          onClick={() => {
                            setPeriod(value);
                            setReview(null);
                            setFailure(null);
                            setOpenFiles(new Set());
                          }}
                          className="-mb-px border-b-2 px-3 py-2 text-[14px] font-semibold transition-colors"
                          style={
                            period === value
                              ? { borderColor: ACCENT, color: INK }
                              : { borderColor: "transparent", color: "#8A94A3" }
                          }
                        >
                          {EXAM_PERIODS[value]}
                          <span className="ml-1.5 text-[12px] font-medium opacity-60">{periodCount(value)}</span>
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={removeSubject}
                      className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-[12px] text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    >
                      <Trash2 size={13} /> 과목 삭제
                    </button>
                  </div>
                  <div className="mt-5 flex flex-wrap items-center gap-3">
                    <input
                      ref={fileRef}
                      type="file"
                      accept="application/pdf"
                      onChange={onPick}
                      className="hidden"
                    />
                    <button
                      onClick={() => fileRef.current?.click()}
                      disabled={busy || Boolean(review) || Boolean(askFile)}
                      className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-semibold text-white disabled:opacity-60"
                      style={{ backgroundColor: ACCENT }}
                    >
                      {busy ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                      {!busy ? "문제은행 PDF 넣기" : progress?.total ? `페이지 분석 중 ${progress.done}/${progress.total}` : "PDF 읽는 중…"}
                    </button>
                    <button
                      onClick={() => {
                        setFailure(null);
                        setReview({ fileName: "", labels: [] });
                      }}
                      disabled={busy || Boolean(review) || Boolean(askFile)}
                      className="flex items-center gap-1.5 rounded-xl border bg-white px-3.5 py-2.5 text-[13px] font-medium text-slate-600 disabled:opacity-50"
                      style={{ borderColor: "#DDE3EC" }}
                    >
                      <PencilLine size={15} /> 직접 입력
                    </button>
                    {stats && (
                      <div className="flex items-center gap-4 text-[13px] text-slate-600">
                        <span>
                          <b style={{ color: INK }}>{stats.files}</b>파일 · <b style={{ color: INK }}>{stats.n}</b>
                          문제
                        </span>
                        <span>
                          전체 이해도 <b style={{ color: rampFor(stats.percent) }}>{stats.percent}%</b>
                        </span>
                        <span>
                          마스터 <b style={{ color: RAMP[5] }}>{stats.mastered}</b>
                        </span>
                      </div>
                    )}
                  </div>

                  {error && (
                    <div className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
                      {error}
                    </div>
                  )}
                  {notice && !error && (
                    <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-[13px] text-emerald-800">
                      {notice}
                    </div>
                  )}

                  {askFile && (
                    <div className="mt-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-[13px] text-blue-950">
                      <p>
                        문제 PDF의 페이지 그림과 글자를 AI(OpenAI)로 보내 문항 번호·문제 내용·수식을 정리해요. 페이지 그림은 저장되지 않아요.
                      </p>
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => answerConsent("granted")} className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-white" style={{ backgroundColor: ACCENT }}>
                          동의하고 분석
                        </button>
                        <button onClick={() => answerConsent("declined")} className="rounded-lg border bg-white px-3 py-1.5 text-[13px]">
                          번호만 찾기
                        </button>
                      </div>
                    </div>
                  )}

                  {failure && (
                    <FailurePrompt
                      failure={failure}
                      onCancel={() => setFailure(null)}
                      onManual={() => {
                        setReview({ fileName: failure.fileName, labels: [] });
                        setFailure(null);
                      }}
                    />
                  )}

                  {review && (
                    <ReviewPanel
                      key={review.fileName + review.labels.length}
                      initial={review}
                      existingFiles={filesByName}
                      onCancel={() => setReview(null)}
                      onSubmit={saveReview}
                    />
                  )}

                  <div
                    className="mt-5 overflow-hidden rounded-2xl border bg-white"
                    style={{ borderColor: "#E4E9F0" }}
                  >
                    {fileOrder.length === 0 ? (
                      <div className="flex flex-col items-center gap-2 py-16 text-center">
                        <FileText size={28} className="text-slate-300" />
                        <p className="text-[14px] font-medium">아직 등록된 파일이 없어요.</p>
                      </div>
                    ) : (
                      fileOrder.map((name) => (
                        <FileGroup
                          key={name}
                          name={splitSourceFile(name).name}
                          problems={files.get(name) ?? []}
                          open={openFiles.has(name)}
                          onToggle={() => toggleFile(name)}
                          onLevel={setLevel}
                          onRename={rename}
                          onRemove={removeProblem}
                          onAdd={(labels) => addToFile(name, labels)}
                          onRemoveFile={() => removeFile(name)}
                          onConfirm={confirmProblem}
                        />
                      ))
                    )}
                  </div>

                  <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5">
                    {LEVELS.map((l) => (
                      <div key={l.v} className="flex items-center gap-1.5 text-[12px] text-slate-500">
                        <span
                          className="inline-block h-3 w-3 rounded-[3px]"
                          style={{ backgroundColor: RAMP[l.v] }}
                        />
                        <b style={{ color: INK }}>{l.v}</b> {l.desc} ({l.v * 20}%)
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
