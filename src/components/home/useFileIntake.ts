"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { COURSES_CHANGED_EVENT, getActiveTermCourses, getAllStoredCourses } from "@/lib/course-storage";
import { getDriveConnectionStatus } from "@/lib/drive-connection";
import { getMyNotes } from "@/lib/my-notes-storage";
import { aiClassificationAvailable } from "@/lib/file-intake/ai";
import type { DocType } from "@/lib/file-intake/classify-local";
import { processDriveNote, processUpload, reassignRecord, type IntakeContext } from "@/lib/file-intake/pipeline";
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
      setConsentState(getIntakeConsent());
      setDriveUploadState(getIntakeDriveUpload());
      const active = getActiveTermCourses().courses;
      const activeIds = new Set(active.map((course) => course.id));
      setCourses([...active, ...getAllStoredCourses().filter((course) => !activeIds.has(course.id))]);
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
  const drain = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    try {
      while (queue.current.length) {
        const { file, onRecord } = queue.current.shift()!;
        await processUpload(file, context(), (record) => {
          onRecord?.(record.id);
          upsert(record);
        });
      }
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
    upsert({ ...record, status: "processing" });
    try {
      upsert(await reassignRecord(record, patch));
    } catch (error) {
      upsert({ ...record, message: error instanceof Error ? error.message : "바꾸지 못했어요." });
    }
  }, [upsert]);

  const remove = useCallback((id: string) => {
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

  return { records, courses, consent, setConsent, signedIn, driveConnected, driveUpload, setDriveUpload, add, change, remove };
}
