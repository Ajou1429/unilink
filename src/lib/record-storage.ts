export const GRADE_RECORDS_STORAGE_KEY = "unilink:grade-records";
export const SPEC_RECORDS_STORAGE_KEY = "unilink:spec-records";
export const RECORDS_CHANGED_EVENT = "unilink:recordsChanged";

export interface GradeRecord {
  id: string;
  term: string;
  courseId?: string;
  courseName: string;
  credits: number;
  grade: string;
  score: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpecRecord {
  id: string;
  personalStudyId?: string;
  title: string;
  category: string;
  status: "planned" | "in-progress" | "done";
  completedAt: string;
  memo: string;
  createdAt: string;
  updatedAt: string;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getGradeRecords(): GradeRecord[] {
  return readJson<GradeRecord[]>(GRADE_RECORDS_STORAGE_KEY, []);
}

export function saveGradeRecords(records: GradeRecord[]) {
  writeJson(GRADE_RECORDS_STORAGE_KEY, records);
  window.dispatchEvent(new Event(RECORDS_CHANGED_EVENT));
}

export function getSpecRecords(): SpecRecord[] {
  return readJson<SpecRecord[]>(SPEC_RECORDS_STORAGE_KEY, []);
}

export function saveSpecRecords(records: SpecRecord[]) {
  writeJson(SPEC_RECORDS_STORAGE_KEY, records);
  window.dispatchEvent(new Event(RECORDS_CHANGED_EVENT));
}
