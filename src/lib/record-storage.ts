import { privateStorage } from "./private-storage.ts";
export const GRADE_RECORDS_STORAGE_KEY = "unilink:grade-records";
export const SPEC_RECORDS_STORAGE_KEY = "unilink:spec-records";
export const GRADE_SETTINGS_STORAGE_KEY = "unilink:grade-settings";
export const RECORDS_CHANGED_EVENT = "unilink:recordsChanged";

// ---------------------------------------------------------------------------
// 성적
// ---------------------------------------------------------------------------

export const LETTER_GRADES = ["A+", "A0", "B+", "B0", "C+", "C0", "D+", "D0", "F"] as const;
export const GRADE_OPTIONS = [...LETTER_GRADES, "P", "NP"] as const;
export type GradeValue = (typeof GRADE_OPTIONS)[number];

export const GRADE_POINTS: Record<(typeof LETTER_GRADES)[number], number> = {
  "A+": 4.5, A0: 4, "B+": 3.5, B0: 3, "C+": 2.5, C0: 2, "D+": 1.5, D0: 1, F: 0,
};
export const MAX_GPA = 4.5;

/** 학점계산기 학기 칸. 표준 8칸 외에 사용자가 쓰던 다른 학기 이름도 그대로 보존한다. */
export const STANDARD_GRADE_TERMS = [1, 2, 3, 4].flatMap((year) => [1, 2].map((term) => `${year}학년 ${term}학기`));

export interface GradeRecord {
  id: string;
  /** 학점계산기 학기 칸 (예: "1학년 1학기") */
  term: string;
  courseId?: string;
  courseType?: "major" | "non-major";
  courseName: string;
  credits: number;
  /** 현재 성적. 아직 모르면 빈 문자열 */
  grade: GradeValue | "";
  /** 재수강 예정 여부와 재수강 시 예상 성적 */
  retake?: boolean;
  retakeGrade?: GradeValue | "";
  score?: string;
  memo?: string;
  createdAt: string;
  updatedAt: string;
}

export interface GradeSettings {
  /** 졸업에 필요한 학점 */
  requiredCredits: number;
}

export const DEFAULT_GRADE_SETTINGS: GradeSettings = { requiredCredits: 150 };

function isGradeValue(value: unknown): value is GradeValue {
  return GRADE_OPTIONS.includes(value as GradeValue);
}

function normalizeGradeRecord(record: GradeRecord): GradeRecord {
  return {
    ...record,
    credits: Number.isFinite(Number(record.credits)) ? Number(record.credits) : 0,
    courseType: record.courseType === "non-major" ? "non-major" : "major",
    grade: isGradeValue(record.grade) ? record.grade : "",
    retake: Boolean(record.retake),
    retakeGrade: isGradeValue(record.retakeGrade) ? record.retakeGrade : "",
  };
}

export interface GradeSummary {
  /** 평점 (평점 반영 과목이 없으면 null) */
  gpa: number | null;
  majorGpa: number | null;
  /** 취득 학점 (F·NP·미입력 제외) */
  earnedCredits: number;
  /** 평점에 들어간 학점 (P/NP 제외) */
  gpaCredits: number;
}

/** 재수강 예정 과목은 useRetake가 켜져 있고 예상 성적이 있으면 그 성적으로 계산한다. */
export function effectiveGrade(record: GradeRecord, useRetake: boolean): GradeValue | "" {
  return useRetake && record.retake && record.retakeGrade ? record.retakeGrade : record.grade;
}

export function summarizeGrades(records: GradeRecord[], useRetake = false): GradeSummary {
  let points = 0, credits = 0, majorPoints = 0, majorCredits = 0, earned = 0;
  for (const record of records) {
    const grade = effectiveGrade(record, useRetake);
    const value = record.credits;
    if (!grade || !(value > 0)) continue;
    if (grade !== "F" && grade !== "NP") earned += value;
    if (grade === "P" || grade === "NP") continue;
    const point = GRADE_POINTS[grade];
    points += point * value;
    credits += value;
    if (record.courseType !== "non-major") { majorPoints += point * value; majorCredits += value; }
  }
  return {
    gpa: credits ? points / credits : null,
    majorGpa: majorCredits ? majorPoints / majorCredits : null,
    earnedCredits: earned,
    gpaCredits: credits,
  };
}

export function hasRetakePlan(records: GradeRecord[]) {
  return records.some((record) => record.retake && record.retakeGrade);
}

/** 성적 분포 (평점 반영 과목, 학점 가중) */
export function gradeDistribution(records: GradeRecord[]) {
  const totals = new Map<string, number>();
  let sum = 0;
  for (const record of records) {
    if (!record.grade || !(record.credits > 0)) continue;
    totals.set(record.grade, (totals.get(record.grade) ?? 0) + record.credits);
    sum += record.credits;
  }
  return GRADE_OPTIONS.filter((grade) => totals.has(grade)).map((grade) => ({
    grade,
    credits: totals.get(grade)!,
    ratio: sum ? totals.get(grade)! / sum : 0,
  }));
}

export function gradeTerms(records: GradeRecord[]) {
  const extra = [...new Set(records.map((record) => record.term))].filter((term) => !STANDARD_GRADE_TERMS.includes(term));
  return [...STANDARD_GRADE_TERMS, ...extra];
}

export function formatGpa(value: number | null) {
  return value === null ? "-" : (Math.round(value * 100) / 100).toFixed(2);
}

// ---------------------------------------------------------------------------
// 스펙
// ---------------------------------------------------------------------------

export type SpecCategory = "certificate" | "language" | "competition" | "other";

export const SPEC_CATEGORY_LABELS: Record<SpecCategory, string> = {
  certificate: "자격증",
  language: "어학",
  competition: "공모전",
  other: "기타",
};

export interface SpecRecord {
  id: string;
  personalStudyId?: string;
  category: SpecCategory;
  /** 자격증명 · 공모전명 · 제목 */
  title: string;
  /** 취득연월 (YYYY-MM) */
  acquiredAt?: string;
  /** 만기연월 (YYYY-MM). lifetime이면 비움 */
  expiresAt?: string;
  lifetime?: boolean;
  /** 발급기관 (자격증) · 주최기관 (공모전) */
  issuer?: string;
  /** 어학 점수·등급 */
  score?: string;
  /** 공모전 수상 이력 */
  award?: string;
  /** 기타 내용 */
  content?: string;
  createdAt: string;
  updatedAt: string;
}

type LegacySpec = Partial<SpecRecord> & {
  category?: string;
  status?: string;
  awardStatus?: string;
  awardRank?: string;
  completedAt?: string;
  memo?: string;
};

function categoryFromText(text: string): SpecCategory {
  if (/어학|토익|토플|TOEIC|TOEFL|OPIc|IELTS|텝스|TEPS|JLPT|HSK/i.test(text)) return "language";
  if (text.includes("자격")) return "certificate";
  if (text.includes("공모")) return "competition";
  return "other";
}

/** 이전 형식(certificate/competition/experience + memo/awardRank)을 새 형식으로 옮긴다. */
export function normalizeSpecRecord(record: LegacySpec): SpecRecord {
  const raw = String(record.category ?? "");
  const category: SpecCategory =
    raw === "certificate" || raw === "language" || raw === "competition" || raw === "other"
      ? raw
      : raw === "experience" ? "other" : categoryFromText(raw);
  const now = new Date().toISOString();
  return {
    id: String(record.id ?? `spec-${Date.now()}`),
    personalStudyId: record.personalStudyId,
    category,
    title: String(record.title ?? ""),
    acquiredAt: record.acquiredAt ?? (record.completedAt ? String(record.completedAt).slice(0, 7) : ""),
    expiresAt: record.expiresAt ?? "",
    lifetime: Boolean(record.lifetime),
    issuer: record.issuer ?? "",
    score: record.score ?? "",
    award: record.award ?? (record.awardStatus === "awarded" ? record.awardRank ?? "" : ""),
    content: record.content ?? record.memo ?? "",
    createdAt: record.createdAt ?? now,
    updatedAt: record.updatedAt ?? now,
  };
}

// ---------------------------------------------------------------------------
// 저장소
// ---------------------------------------------------------------------------

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = privateStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  privateStorage.setItem(key, JSON.stringify(value));
}

export function getGradeRecords(): GradeRecord[] {
  return readJson<GradeRecord[]>(GRADE_RECORDS_STORAGE_KEY, []).map(normalizeGradeRecord);
}

export function saveGradeRecords(records: GradeRecord[]) {
  writeJson(GRADE_RECORDS_STORAGE_KEY, records);
  window.dispatchEvent(new Event(RECORDS_CHANGED_EVENT));
}

export function getGradeSettings(): GradeSettings {
  const value = readJson<Partial<GradeSettings>>(GRADE_SETTINGS_STORAGE_KEY, {});
  const required = Number(value.requiredCredits);
  return { requiredCredits: Number.isInteger(required) && required > 0 && required <= 300 ? required : DEFAULT_GRADE_SETTINGS.requiredCredits };
}

export function saveGradeSettings(settings: GradeSettings) {
  writeJson(GRADE_SETTINGS_STORAGE_KEY, settings);
  window.dispatchEvent(new Event(RECORDS_CHANGED_EVENT));
}

export function getSpecRecords(): SpecRecord[] {
  return readJson<LegacySpec[]>(SPEC_RECORDS_STORAGE_KEY, []).map(normalizeSpecRecord);
}

export function saveSpecRecords(records: SpecRecord[]) {
  writeJson(SPEC_RECORDS_STORAGE_KEY, records);
  window.dispatchEvent(new Event(RECORDS_CHANGED_EVENT));
}

export function addCompletedPersonalStudySpec(study: {
  id: string;
  title: string;
  category: string;
  goal: string;
  completedAt?: string;
}) {
  const records = getSpecRecords();
  if (records.some((record) => record.personalStudyId === study.id)) return false;

  const now = new Date().toISOString();
  saveSpecRecords([
    normalizeSpecRecord({
      id: `spec-study-${study.id}`,
      personalStudyId: study.id,
      title: study.title,
      category: categoryFromText(`${study.category} ${study.title}`),
      acquiredAt: (study.completedAt ?? now).slice(0, 7),
      content: study.goal,
      createdAt: now,
      updatedAt: now,
    }),
    ...records,
  ]);
  return true;
}
