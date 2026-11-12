"use client";

import { useState } from "react";
import { Check, Loader2, Pencil, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Course } from "@/lib/types";
import type { PaceLevel } from "@/lib/timetable-storage";
import type { Applied, AppliedEdit } from "@/lib/chat-record/apply";
import {
  formatDate, recentClassDates, STATUS_LABELS, type ChatAction, type Missing, type ProblemFileIndex,
} from "@/lib/chat-record/plan";

export interface RecordEntry {
  key: string;
  action: ChatAction;
  status: "waiting" | "saving" | "saved" | "undoing" | "undone" | "error";
  missing: Missing | null;
  applied?: Applied;
  error?: string;
}

const STATUSES = Object.keys(STATUS_LABELS) as (keyof typeof STATUS_LABELS)[];
const LEVELS: PaceLevel[] = ["상", "중", "하"];
const control = "rounded-md border bg-white px-2 py-1 text-xs";
const chip = "rounded-full border bg-white px-3 py-1 text-xs hover:border-primary/50 hover:bg-primary/5";

function title(entry: RecordEntry, courses: Course[]) {
  const course = courses.find((item) => item.id === entry.action.course_id)?.name;
  const a = entry.applied;
  if (a?.kind === "topic") return `${a.courseName} · ${a.topicTitle}`;
  if (a?.kind === "session") return `${a.courseName} · ${formatDate(a.date)} 수업`;
  if (a?.kind === "problem") return `${a.courseName}${a.fileLabel ? ` · ${a.fileLabel}` : ""}`;
  const head = course ?? "과목 미정";
  if (entry.action.kind === "topic") return `${head} · ${entry.action.topic}`;
  if (entry.action.kind === "session") return `${head} · ${entry.action.date ? `${formatDate(entry.action.date)} ` : ""}수업`;
  return `${head} · 문제 ${entry.action.problem_labels.join(", ")}`;
}

function detail(entry: RecordEntry) {
  const a = entry.applied;
  if (a?.kind === "topic") return [STATUS_LABELS[a.status], a.rating ? `이해도 ${a.rating}/5` : null].filter(Boolean).join(" · ");
  if (a?.kind === "session") {
    const s = a.current;
    return [s.progressTitle && `진도 ${s.progressTitle}`, s.pageStart && `${s.pageStart}–${s.pageEnd}쪽`, `난이도 ${s.difficulty}`, `빠르기 ${s.pace}`].filter(Boolean).join(" · ");
  }
  if (a?.kind === "problem") return `${a.items.map((item) => item.label).join(", ")}번 → 이해도 ${a.level}/5`;
  const x = entry.action;
  if (x.kind === "topic") return [x.status && STATUS_LABELS[x.status], x.rating ? `이해도 ${x.rating}/5` : null].filter(Boolean).join(" · ");
  if (x.kind === "session") return [x.progress_title && `진도 ${x.progress_title}`, x.difficulty && `난이도 ${x.difficulty}`, x.pace && `빠르기 ${x.pace}`].filter(Boolean).join(" · ");
  return `이해도 ${x.problem_level}/5`;
}

function Editor({ applied, onSave, onCancel }: { applied: Applied; onSave: (edit: AppliedEdit) => void; onCancel: () => void }) {
  const [status, setStatus] = useState(applied.kind === "topic" ? applied.status : "in_progress");
  const [rating, setRating] = useState(applied.kind === "topic" ? applied.rating ?? 0 : 0);
  const [progress, setProgress] = useState(applied.kind === "session" ? applied.current.progressTitle : "");
  const [difficulty, setDifficulty] = useState<PaceLevel>(applied.kind === "session" ? applied.current.difficulty : "중");
  const [pace, setPace] = useState<PaceLevel>(applied.kind === "session" ? applied.current.pace : "중");
  const [level, setLevel] = useState(applied.kind === "problem" ? applied.level : 0);

  function save() {
    if (applied.kind === "topic") onSave({ kind: "topic", status, rating: rating || null });
    else if (applied.kind === "session") onSave({ kind: "session", progressTitle: progress, difficulty, pace });
    else onSave({ kind: "problem", level });
  }

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      {applied.kind === "topic" && (
        <>
          <select aria-label="학습 상태" className={control} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
            {STATUSES.map((value) => <option key={value} value={value}>{STATUS_LABELS[value]}</option>)}
          </select>
          <select aria-label="이해도" className={control} value={rating} disabled={status === "not_started"} onChange={(e) => setRating(Number(e.target.value))}>
            <option value={0}>이해도 없음</option>
            {[1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>이해도 {value}/5</option>)}
          </select>
        </>
      )}
      {applied.kind === "session" && (
        <>
          <input aria-label="진도" className={cn(control, "w-40")} value={progress} maxLength={100} onChange={(e) => setProgress(e.target.value)} placeholder="진도" />
          <select aria-label="난이도" className={control} value={difficulty} onChange={(e) => setDifficulty(e.target.value as PaceLevel)}>
            {LEVELS.map((value) => <option key={value} value={value}>난이도 {value}</option>)}
          </select>
          <select aria-label="빠르기" className={control} value={pace} onChange={(e) => setPace(e.target.value as PaceLevel)}>
            {LEVELS.map((value) => <option key={value} value={value}>빠르기 {value}</option>)}
          </select>
        </>
      )}
      {applied.kind === "problem" && (
        <select aria-label="문항 이해도" className={control} value={level} onChange={(e) => setLevel(Number(e.target.value))}>
          {[0, 1, 2, 3, 4, 5].map((value) => <option key={value} value={value}>이해도 {value}/5</option>)}
        </select>
      )}
      <button type="button" onClick={save} className="rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-foreground">저장</button>
      <button type="button" onClick={onCancel} className="rounded-md border bg-white px-2.5 py-1 text-xs">닫기</button>
    </div>
  );
}

function Question({ entry, courses, today, files, onPick }: {
  entry: RecordEntry; courses: Course[]; today: string; files: Map<string, ProblemFileIndex[]>;
  onPick: (patch: Partial<ChatAction>) => void;
}) {
  const course = courses.find((item) => item.id === entry.action.course_id);
  if (entry.missing === "course") {
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {courses.map((item) => (
          <button key={item.id} type="button" onClick={() => onPick({ course_id: item.id })} className={chip}>
            <span className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />{item.name}
          </button>
        ))}
      </div>
    );
  }
  if (entry.missing === "date" && course) {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {recentClassDates(course, today).map((date) => (
          <button key={date} type="button" onClick={() => onPick({ date })} className={chip}>{date === today ? "오늘" : formatDate(date)}</button>
        ))}
        <input type="date" aria-label="수업 날짜" max={today} className={cn(control, "rounded-full")} onChange={(e) => e.target.value && onPick({ date: e.target.value })} />
      </div>
    );
  }
  if (entry.missing === "file" && course) {
    const candidates = (files.get(course.id) ?? []).filter((file) => entry.action.problem_labels.some((label) => file.problems.includes(label)));
    return (
      <div className="mt-2 flex flex-wrap gap-1.5">
        {candidates.map((file) => <button key={file.file} type="button" onClick={() => onPick({ problem_file: file.file })} className={chip}>{file.label}</button>)}
      </div>
    );
  }
  return null;
}

const QUESTIONS: Record<Missing, string> = { course: "어느 과목인가요?", date: "언제 수업인가요?", file: "어느 파일의 문제인가요?" };

/** 대화 한 번으로 저장한 기록 묶음. 바로 저장되고, 여기서 고치거나 되돌린다. */
export function ChatRecordCard({ entries, courses, today, files, onPick, onUndo, onEdit }: {
  entries: RecordEntry[];
  courses: Course[];
  today: string;
  files: Map<string, ProblemFileIndex[]>;
  onPick: (key: string, patch: Partial<ChatAction>) => void;
  onUndo: (key: string) => void;
  onEdit: (key: string, edit: AppliedEdit) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  if (!entries.length) return null;
  return (
    <ul className="divide-y rounded-2xl border bg-white px-4">
      {entries.map((entry) => (
        <li key={entry.key} className={cn("py-2.5", entry.status === "undone" && "opacity-50")}>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center">
              {entry.status === "saving" || entry.status === "undoing" ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                : entry.status === "saved" ? <Check className="h-4 w-4 text-emerald-600" />
                  : entry.status === "undone" ? <RotateCcw className="h-3.5 w-3.5 text-muted-foreground" />
                    : <span className={cn("h-2 w-2 rounded-full", entry.status === "error" ? "bg-destructive" : "bg-amber-400")} />}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-sm font-medium", entry.status === "undone" && "line-through")}>
                {title(entry, courses)}
                {entry.applied?.kind === "topic" && entry.applied.created && <span className="ml-1.5 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">새 주제</span>}
              </p>
              <p className="text-xs text-muted-foreground">{detail(entry)}</p>
              {entry.status === "waiting" && entry.missing && (
                <>
                  <p className="mt-1.5 text-sm">{QUESTIONS[entry.missing]}</p>
                  <Question entry={entry} courses={courses} today={today} files={files} onPick={(patch) => onPick(entry.key, patch)} />
                </>
              )}
              {entry.status === "error" && <p role="alert" className="mt-1 text-xs text-destructive">{entry.error}</p>}
              {editing === entry.key && entry.applied && (
                <Editor applied={entry.applied} onCancel={() => setEditing(null)} onSave={(edit) => { setEditing(null); onEdit(entry.key, edit); }} />
              )}
            </div>
            {entry.status === "saved" && editing !== entry.key && (
              <div className="flex shrink-0 gap-1">
                <button type="button" onClick={() => setEditing(entry.key)} aria-label="수정" title="수정" className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => onUndo(entry.key)} aria-label="취소" title="취소" className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground">
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
