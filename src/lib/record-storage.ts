export const GRADE_RECORDS_STORAGE_KEY = "unilink:grade-records";
export const SPEC_RECORDS_STORAGE_KEY = "unilink:spec-records";
export const RECORDS_CHANGED_EVENT = "unilink:recordsChanged";

export interface GradeRecord {
  id: string;
  term: string;
  courseId?: string;
  courseType?: "major" | "non-major";
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
  category: "certificate" | "competition" | "experience";
  status: "planned" | "in-progress" | "done";
  awardStatus: "awarded" | "not-awarded" | "not-applicable";
  awardRank: string;
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

function normalizeCourseType(value: unknown): GradeRecord["courseType"] {
  return value === "non-major" ? "non-major" : "major";
}

function normalizeSpecCategory(value: unknown): SpecRecord["category"] {
  if (value === "certificate" || String(value).includes("자격")) {
    return "certificate";
  }
  if (value === "competition" || String(value).includes("공모")) {
    return "competition";
  }
  return "experience";
}

function normalizeAwardStatus(value: unknown): SpecRecord["awardStatus"] {
  if (value === "awarded" || value === "not-awarded") {
    return value;
  }
  return "not-applicable";
}

function normalizeGradeRecord(record: GradeRecord): GradeRecord {
  return {
    ...record,
    courseType: normalizeCourseType(record.courseType),
  };
}

function normalizeSpecRecord(record: SpecRecord): SpecRecord {
  return {
    ...record,
    category: normalizeSpecCategory(record.category),
    awardStatus: normalizeAwardStatus(record.awardStatus),
    awardRank: record.awardStatus === "awarded" ? record.awardRank ?? "" : "",
  };
}

export function getGradeRecords(): GradeRecord[] {
  return readJson<GradeRecord[]>(GRADE_RECORDS_STORAGE_KEY, []).map(
    normalizeGradeRecord,
  );
}

export function saveGradeRecords(records: GradeRecord[]) {
  writeJson(GRADE_RECORDS_STORAGE_KEY, records);
  window.dispatchEvent(new Event(RECORDS_CHANGED_EVENT));
}

export function getSpecRecords(): SpecRecord[] {
  return readJson<SpecRecord[]>(SPEC_RECORDS_STORAGE_KEY, []).map(
    normalizeSpecRecord,
  );
}

export function saveSpecRecords(records: SpecRecord[]) {
  writeJson(SPEC_RECORDS_STORAGE_KEY, records);
  window.dispatchEvent(new Event(RECORDS_CHANGED_EVENT));
}
