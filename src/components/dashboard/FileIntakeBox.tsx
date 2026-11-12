"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getAllStoredCourses, getActiveTermCourses, COURSES_CHANGED_EVENT } from "@/lib/course-storage";
import { getDriveConnectionStatus } from "@/lib/drive-connection";
import { getMyNotes } from "@/lib/my-notes-storage";
import { aiClassificationAvailable } from "@/lib/file-intake/ai";
import { DOC_TYPE_LABELS, DOC_TYPES, type DocType } from "@/lib/file-intake/classify-local";
import { INTAKE_ACCEPT } from "@/lib/file-intake/extract";
import { processDriveNote, processUpload, reassignRecord, type IntakeContext } from "@/lib/file-intake/pipeline";
import {
  FILE_INTAKE_CHANGED_EVENT, getIntakeConsent, getIntakeDriveUpload, getIntakeLog, getProcessedDriveNotes,
  markDriveNoteProcessed, removeIntakeRecord, setIntakeConsent, setIntakeDriveUpload, type IntakeRecord,
} from "@/lib/file-intake/settings";
import type { Course } from "@/lib/types";

/** 앱을 열 때 Drive에서 새로 들어온 미분류 노트를 한 번에 이만큼까지만 분류한다 */
const DRIVE_BATCH = 5;

function destination(record: IntakeRecord) {
  if (record.docType === "problem_set" && record.problemSubjectId) return { href: "/problem-bank", label: "문제은행" };
  if (record.courseId) return { href: `/course?courseId=${encodeURIComponent(record.courseId)}`, label: record.courseName ?? "과목" };
  return { href: "/notes", label: "나의 노트" };
}

function ResultRow({ record, courses, onChange, onRemove }: {
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

export function FileIntakeBox() {
  const [records, setRecords] = useState<IntakeRecord[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [consent, setConsent] = useState<"granted" | "declined" | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveUpload, setDriveUpload] = useState(false);
  const [dragging, setDragging] = useState(false);
  const busy = useRef(false);
  const queue = useRef<File[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const driveChecked = useRef(false);

  const context = useCallback((): IntakeContext => ({
    useAi: signedIn && getIntakeConsent() === "granted",
    uploadToDrive: driveConnected && getIntakeDriveUpload(),
  }), [signedIn, driveConnected]);

  const upsert = useCallback((record: IntakeRecord) => {
    setRecords((prev) => [record, ...prev.filter((item) => item.id !== record.id)]);
  }, []);

  useEffect(() => {
    function sync() {
      setRecords(getIntakeLog());
      setConsent(getIntakeConsent());
      setDriveUpload(getIntakeDriveUpload());
      const active = getActiveTermCourses().courses;
      const activeIds = new Set(active.map((course) => course.id));
      const others = getAllStoredCourses().filter((course) => !activeIds.has(course.id));
      setCourses([...active, ...others]);
    }
    const timeout = window.setTimeout(sync, 0);
    window.addEventListener(FILE_INTAKE_CHANGED_EVENT, sync);
    window.addEventListener(COURSES_CHANGED_EVENT, sync);
    aiClassificationAvailable().then(setSignedIn).catch(() => setSignedIn(false));
    getDriveConnectionStatus().then((status) => setDriveConnected(status.connected)).catch(() => setDriveConnected(false));
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener(FILE_INTAKE_CHANGED_EVENT, sync);
      window.removeEventListener(COURSES_CHANGED_EVENT, sync);
    };
  }, []);

  // 앱을 열 때 Drive에서 새로 동기화된 미분류 노트를 같은 과정으로 분류한다
  useEffect(() => {
    if (!signedIn || driveChecked.current) return;
    driveChecked.current = true;
    (async () => {
      const processed = getProcessedDriveNotes();
      const notes = (await getMyNotes().catch(() => []))
        .filter((note) => note.driveFileId && note.linkedType === "unassigned" && !processed.has(note.id))
        .slice(0, DRIVE_BATCH);
      for (const note of notes) {
        markDriveNoteProcessed(note.id);
        await processDriveNote(note, context(), upsert);
      }
    })();
  }, [signedIn, context, upsert]);

  // 파일은 한 개씩 차례로 처리한다 (시간표·노트 저장이 서로 겹치지 않게)
  async function drain() {
    if (busy.current) return;
    busy.current = true;
    try {
      while (queue.current.length) {
        const file = queue.current.shift()!;
        await processUpload(file, context(), upsert);
      }
    } finally {
      busy.current = false;
    }
  }

  function add(files: File[]) {
    if (!files.length) return;
    queue.current.push(...files);
    void drain();
  }

  async function change(record: IntakeRecord, patch: { courseId?: string | null; docType?: DocType }) {
    upsert({ ...record, status: "processing" });
    try {
      upsert(await reassignRecord(record, patch));
    } catch (error) {
      upsert({ ...record, message: error instanceof Error ? error.message : "바꾸지 못했어요." });
    }
  }

  return (
    <Card className="flex h-full min-h-0 flex-col border-0 shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">파일 추가</CardTitle>
          {driveConnected && (
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={driveUpload}
                onChange={(event) => { setDriveUpload(event.target.checked); setIntakeDriveUpload(event.target.checked); }}
              />
              Google Drive에도 저장
            </label>
          )}
        </div>
      </CardHeader>
      <CardContent className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div className="flex min-h-0 flex-col gap-2">
          {signedIn && consent === null && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900">
              <p>과목을 바로 알 수 없는 파일은 앞부분 일부(1~2쪽 글자, 글자가 없으면 첫 쪽 이미지)를 AI(OpenAI)로 보내 분류해요.</p>
              <div className="mt-2 flex gap-2">
                <Button size="sm" className="h-7" onClick={() => { setIntakeConsent("granted"); setConsent("granted"); }}>동의</Button>
                <Button size="sm" variant="outline" className="h-7 bg-white" onClick={() => { setIntakeConsent("declined"); setConsent("declined"); }}>브라우저에서만 분류</Button>
              </div>
            </div>
          )}
          <div
            onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
            onDrop={(event) => { event.preventDefault(); setDragging(false); add(Array.from(event.dataTransfer.files)); }}
            className={cn("flex min-h-28 flex-1 rounded-xl border-2 border-dashed transition-colors", dragging ? "border-primary bg-primary/10" : "border-border bg-muted/30")}
          >
            <input
              ref={input}
              type="file"
              multiple
              accept={INTAKE_ACCEPT}
              className="sr-only"
              aria-label="추가할 파일 선택"
              onChange={(event) => { add(Array.from(event.target.files ?? [])); event.target.value = ""; }}
            />
            <button
              type="button"
              onClick={() => input.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-1.5 rounded-xl px-4 py-5 text-center focus-visible:outline-2 focus-visible:outline-primary"
            >
              <Upload className="h-6 w-6 text-muted-foreground" aria-hidden />
              <span className="text-sm font-medium">{dragging ? "여기에 놓으세요" : "파일을 끌어다 놓거나 클릭해서 선택"}</span>
              <span className="text-xs text-muted-foreground">PDF · 이미지 · PPTX · DOCX</span>
            </button>
          </div>
        </div>
        <div className="min-h-0 overflow-y-auto rounded-lg border bg-white px-3 max-lg:max-h-80">
          {records.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">추가한 파일이 여기에 분류돼요.</p>
          ) : (
            <ul>
              {records.map((record) => (
                <ResultRow key={record.id} record={record} courses={courses} onChange={change} onRemove={(id) => { removeIntakeRecord(id); setRecords((prev) => prev.filter((item) => item.id !== id)); }} />
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
