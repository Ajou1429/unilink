"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { COURSES_CHANGED_EVENT, getActiveTermCourses } from "@/lib/course-storage";
import { getDriveConnectionStatus } from "@/lib/drive-connection";
import { getMyNotes } from "@/lib/my-notes-storage";
import { aiClassificationAvailable } from "@/lib/file-intake/ai";
import type { DocType } from "@/lib/file-intake/classify-local";
import { classifyUpload, commitUpload, discardUpload, processDriveNote, reassignRecord, type IntakeContext } from "@/lib/file-intake/pipeline";
import {
  FILE_INTAKE_CHANGED_EVENT, getIntakeConsent, getIntakeDriveUpload, getIntakeLog, getProcessedDriveNotes,
  markDriveNoteProcessed, removeIntakeRecord, setIntakeConsent, setIntakeDriveUpload, type IntakeRecord,
} from "@/lib/file-intake/settings";
import type { Course } from "@/lib/types";

/** 앱을 열 때 Drive에서 새로 들어온 미분류 노트를 한 번에 이만큼까지만 분류한다 */
const DRIVE_BATCH = 5;

/**
 * 파일 자동 분류 상태와 동작 (이전 파일 추가 박스의 로직을 그대로 옮김).
 * 화면 모양과 분리해 채팅 입력창에서 쓴다.
 */
export function useFileIntake() {
  const [records, setRecords] = useState<IntakeRecord[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [consent, setConsentState] = useState<"granted" | "declined" | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  const [driveUpload, setDriveUploadState] = useState(false);
  const busy = useRef(false);
  const queue = useRef<{ file: File; onRecord?: (id: string) => void }[]>([]);
  const driveChecked = useRef(false);
  const lifecycle = useRef({ version: 0 });
  const recordsRef = useRef<IntakeRecord[]>([]);
  useEffect(() => { recordsRef.current = records; }, [records]);

  const context = useCallback((): IntakeContext => {
    const version = lifecycle.current.version;
    return {
      useAi: signedIn && getIntakeConsent() === "granted",
      uploadToDrive: driveConnected && getIntakeDriveUpload(),
      assertActive: () => { if (version !== lifecycle.current.version) throw new Error("파일 처리가 중단되었습니다."); },
    };
  }, [signedIn, driveConnected]);

  const upsert = useCallback((record: IntakeRecord) => {
    setRecords((prev) => [record, ...prev.filter((item) => item.id !== record.id)]);
  }, []);

  useEffect(() => {
    const lifecycleState = lifecycle.current;
    lifecycleState.version++;
    function sync() {
      // 저장 전(확인 대기) 결과는 기록에 없으므로 화면에 남겨 둔다
      setRecords((prev) => [...prev.filter((item) => item.status === "review" || item.status === "processing"), ...getIntakeLog().filter((item) => !prev.some((p) => p.id === item.id && (p.status === "review" || p.status === "processing")))]);
      setConsentState(getIntakeConsent());
      setDriveUploadState(getIntakeDriveUpload());
      // 지금 진행 중인 학기 과목만 고를 수 있다
      setCourses(getActiveTermCourses().courses);
    }
    const timeout = window.setTimeout(sync, 0);
    window.addEventListener(FILE_INTAKE_CHANGED_EVENT, sync);
    window.addEventListener(COURSES_CHANGED_EVENT, sync);
    aiClassificationAvailable().then(setSignedIn).catch(() => setSignedIn(false));
    getDriveConnectionStatus().then((status) => setDriveConnected(status.connected)).catch(() => setDriveConnected(false));
    return () => {
      lifecycleState.version++; queue.current = [];
      window.clearTimeout(timeout);
      window.removeEventListener(FILE_INTAKE_CHANGED_EVENT, sync);
      window.removeEventListener(COURSES_CHANGED_EVENT, sync);
    };
  }, []);

  // 앱을 열 때 Drive에서 새로 동기화된 미분류 노트를 같은 과정으로 분류한다
  useEffect(() => {
    if (!signedIn || driveChecked.current) return;
    driveChecked.current = true;
    const ctx = context();
    void (async () => {
      const processed = getProcessedDriveNotes();
      const notes = (await getMyNotes().catch(() => []))
        .filter((note) => note.driveFileId && note.linkedType === "unassigned" && !processed.has(note.id))
        .slice(0, DRIVE_BATCH);
      ctx.assertActive?.();
      for (const note of notes) {
        ctx.assertActive?.();
        const result = await processDriveNote(note, ctx, upsert);
        ctx.assertActive?.();
        if (result.status === "done") markDriveNoteProcessed(note.id);
      }
    })().catch(() => { /* Account/lifecycle changes cancel the old queue. */ });
  }, [signedIn, context, upsert]);

  // 파일은 한 개씩 차례로 처리한다 (시간표·노트 저장이 서로 겹치지 않게)
  const drain = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      while (queue.current.length) {
        const { file, onRecord } = queue.current.shift()!;
        // 채팅에 올린 파일은 분류만 하고, 사용자가 확인하면 commit으로 저장한다
        await classifyUpload(file, context(), (record) => {
          onRecord?.(record.id);
          upsert(record);
        });
      }
    } catch {
      queue.current = [];
    } finally {
      busy.current = false;
    }
  }, [context, upsert]);

  /** 파일을 분류 대기열에 넣는다. onRecord로 만들어지는 결과 id를 받을 수 있다. */
  const add = useCallback((files: File[], onRecord?: (id: string) => void) => {
    if (!files.length) return;
    queue.current.push(...files.map((file) => ({ file, onRecord })));
    void drain();
  }, [drain]);

  const change = useCallback(async (record: IntakeRecord, patch: { courseId?: string | null; docType?: DocType }) => {
    // 저장 전(확인 대기)에는 화면의 분류만 고친다. 저장은 commit에서 한다.
    if (record.status === "review") {
      const course = patch.courseId ? getActiveTermCourses().courses.find((item) => item.id === patch.courseId) : undefined;
      upsert({ ...record, ...patch, ...(patch.courseId !== undefined ? { courseName: course?.name } : {}) });
      return;
    }
    upsert({ ...record, status: "processing" });
    try {
      upsert(await reassignRecord(record, patch));
    } catch (error) {
      upsert({ ...record, message: error instanceof Error ? error.message : "바꾸지 못했어요." });
    }
  }, [upsert]);

  /** 확인 대기 중인 분류를 지금 화면의 종류·과목대로 저장한다 */
  const commit = useCallback(async (ids: string[], patches: Record<string, { docType?: DocType; courseId?: string | null }> = {}) => {
    const ctx = context();
    for (const id of ids) {
      const found = recordsRef.current.find((item) => item.id === id && item.status === "review");
      if (!found) continue;
      const record = { ...found, ...patches[id] };
      try {
        await commitUpload(record, ctx, upsert);
      } catch (error) {
        upsert({ ...record, status: "error", message: error instanceof Error ? error.message : "저장하지 못했어요." });
      }
    }
  }, [context, upsert]);

  const remove = useCallback((id: string) => {
    discardUpload(id);
    removeIntakeRecord(id);
    setRecords((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const setConsent = useCallback((value: "granted" | "declined") => {
    setIntakeConsent(value);
    setConsentState(value);
  }, []);

  const setDriveUpload = useCallback((value: boolean) => {
    setIntakeDriveUpload(value);
    setDriveUploadState(value);
  }, []);

  return { records, courses, consent, setConsent, signedIn, driveConnected, driveUpload, setDriveUpload, add, change, commit, remove };
}
