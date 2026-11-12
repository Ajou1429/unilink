import { privateStorage } from "../private-storage.ts";
import type { DocType } from "./classify-local.ts";

const CONSENT_KEY = "unilink:file-intake-consent";
const DRIVE_KEY = "unilink:file-intake-drive";
const LOG_KEY = "unilink:file-intake-log";
const PROCESSED_KEY = "unilink:file-intake-drive-processed";
export const FILE_INTAKE_CHANGED_EVENT = "unilink:fileIntakeChanged";
const MAX_LOG = 50;

export type IntakeConsent = "granted" | "declined" | null;

/** 대시보드·Drive 파일 한 건의 분류 결과 */
export interface IntakeRecord {
  id: string;
  fileName: string;
  source: "upload" | "drive";
  status: "processing" | "done" | "error";
  docType?: DocType;
  courseId?: string | null;
  courseName?: string;
  term?: string;
  noteId?: string;
  problemSubjectId?: string;
  problemSourceFile?: string;
  problemCount?: number;
  timetableAdded?: boolean;
  gradingCount?: number;
  drive?: "uploaded" | "failed";
  aiUsed?: boolean;
  message?: string;
  createdAt: string;
}

function read<T>(key: string, fallback: T): T {
  try {
    const raw = privateStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    privateStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 저장 공간이 없어도 분류 자체는 계속한다
  }
}

/** AI 분류 전송 동의 (처음 한 번 묻고, 설정에서 바꿀 수 있다) */
export function getIntakeConsent(): IntakeConsent {
  const value = read<string | null>(CONSENT_KEY, null);
  return value === "granted" || value === "declined" ? value : null;
}

export function setIntakeConsent(value: Exclude<IntakeConsent, null>) {
  write(CONSENT_KEY, value);
  window.dispatchEvent(new Event(FILE_INTAKE_CHANGED_EVENT));
}

export function getIntakeDriveUpload(): boolean {
  return read<boolean>(DRIVE_KEY, false) === true;
}

export function setIntakeDriveUpload(value: boolean) {
  write(DRIVE_KEY, value);
}

export function getIntakeLog(): IntakeRecord[] {
  const value = read<IntakeRecord[]>(LOG_KEY, []);
  return Array.isArray(value) ? value : [];
}

export function saveIntakeRecord(record: IntakeRecord) {
  const log = getIntakeLog();
  const next = [record, ...log.filter((item) => item.id !== record.id)].slice(0, MAX_LOG);
  write(LOG_KEY, next);
  window.dispatchEvent(new Event(FILE_INTAKE_CHANGED_EVENT));
}

export function removeIntakeRecord(id: string) {
  write(LOG_KEY, getIntakeLog().filter((item) => item.id !== id));
  window.dispatchEvent(new Event(FILE_INTAKE_CHANGED_EVENT));
}

/** Drive에서 동기화된 노트 중 이미 자동 분류를 시도한 것 (다시 분석하지 않는다) */
export function getProcessedDriveNotes(): Set<string> {
  const value = read<string[]>(PROCESSED_KEY, []);
  return new Set(Array.isArray(value) ? value : []);
}

export function markDriveNoteProcessed(noteId: string) {
  const set = getProcessedDriveNotes();
  set.add(noteId);
  write(PROCESSED_KEY, [...set].slice(-2000));
}
