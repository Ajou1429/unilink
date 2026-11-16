"use client";

import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DOC_TYPE_LABELS, DOC_TYPES, type DocType } from "@/lib/file-intake/classify-local";
import type { IntakeRecord } from "@/lib/file-intake/settings";
import type { Course } from "@/lib/types";

/** 파일 자동 분류 결과 한 줄: 종류·과목을 바로 고칠 수 있다 */
function destination(record: IntakeRecord) {
  if (record.docType === "problem_set" && record.problemSubjectId) return { href: "/problem-bank", label: "문제은행" };
  if (record.courseId) return { href: `/course?courseId=${encodeURIComponent(record.courseId)}`, label: record.courseName ?? "과목" };
  return { href: "/notes", label: "나의 노트" };
}

export function IntakeResultRow({ record, courses, onChange, onRemove }: {
  record: IntakeRecord;
  courses: Course[];
  onChange: (record: IntakeRecord, change: { courseId?: string | null; docType?: DocType }) => void;
  onRemove: (id: string) => void;
}) {
  const processing = record.status === "processing";
  const dest = destination(record);
  const control = "h-7 min-w-0 rounded-md border bg-white px-1.5 text-xs disabled:opacity-50";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b py-2 last:border-0">
      <span className="shrink-0">
        {processing ? <Loader2 className="h-4 w-4 animate-spin text-primary" />
          : record.status === "error" ? <AlertCircle className="h-4 w-4 text-destructive" />
          : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
      </span>
      <span className="min-w-0 flex-1 basis-40 truncate text-sm font-medium" title={record.fileName}>{record.fileName}</span>
      {record.status !== "error" && (
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            aria-label={`${record.fileName} 종류`}
            className={control}
            disabled={processing || !record.noteId}
            value={record.docType ?? "other"}
            onChange={(event) => onChange(record, { docType: event.target.value as DocType })}
          >
            {DOC_TYPES.map((type) => <option key={type} value={type}>{DOC_TYPE_LABELS[type]}</option>)}
          </select>
          <select
            aria-label={`${record.fileName} 과목`}
            className={cn(control, "max-w-40", !record.courseId && !processing && "border-amber-400 text-amber-700")}
            disabled={processing || !record.noteId}
            value={record.courseId ?? ""}
            onChange={(event) => onChange(record, { courseId: event.target.value || null })}
          >
            <option value="">미분류</option>
            {courses.map((course) => <option key={course.id} value={course.id}>{course.name}{course.term ? ` (${course.term})` : ""}</option>)}
          </select>
          {record.status === "done" && (
            <Link href={dest.href} className="text-xs text-primary hover:underline">{dest.label}</Link>
          )}
          {record.timetableAdded && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] font-medium text-blue-700">시간표 추가</span>}
          {Boolean(record.gradingCount) && <span className="rounded bg-violet-50 px-1.5 py-0.5 text-[11px] font-medium text-violet-700">성적 비율</span>}
          {Boolean(record.problemCount) && <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">{record.problemCount}문항</span>}
          {record.drive === "uploaded" && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">Drive</span>}
          {record.source === "drive" && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">Drive에서</span>}
        </div>
      )}
      {!processing && (
        <button type="button" aria-label={`${record.fileName} 목록에서 지우기`} onClick={() => onRemove(record.id)} className="shrink-0 rounded p-0.5 text-muted-foreground hover:bg-muted">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {record.message && <p className={cn("w-full pl-7 text-xs", record.status === "error" ? "text-destructive" : "text-amber-700")}>{record.message}</p>}
    </li>
  );
}
