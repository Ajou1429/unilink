import { privateStorage } from "./private-storage.ts";
import { Course, CourseSchedule } from "./types";

export const MONTHLY_EVENTS_STORAGE_KEY = "unilink:monthly-events";
export const COURSE_SESSIONS_STORAGE_KEY = "unilink:course-sessions";
export const TIMETABLE_CHANGED_EVENT = "unilink:timetableChanged";
export const WORK_SCHEDULES_STORAGE_KEY = "unilink:work-schedules";
export const WORK_SCHEDULES_CHANGED_EVENT = "unilink:workSchedulesChanged";

export type PaceLevel = "상" | "중" | "하";

export interface MonthlyEvent {
  id: string;
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  memo: string;
  color: string;
  createdAt: string;
  /** 하루 종일 일정: 시간 격자 대신 상단 종일 영역에 표시 */
  allDay?: boolean;
  kind?: "manual" | "personal-deadline" | "personal-plan-deadline";
  personalStudyId?: string;
}

export interface CourseSessionProgress {
  id: string;
  courseId: string;
  courseName: string;
  date: string;
  startTime: string;
  endTime: string;
  progressTitle: string;
  progressMemo: string;
  noteId: string;
  noteTitle: string;
  pageStart: string;
  pageEnd: string;
  difficulty: PaceLevel;
  pace: PaceLevel;
  updatedAt: string;
  createdAt: string;
}

export interface CourseOccurrence {
  course: Course;
  date: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
}

export interface WorkSchedule {
  id: string;
  title: string;
  days: Course["days"];
  schedules?: CourseSchedule[];
  startTime: string;
  endTime: string;
  location: string;
  color: string;
  createdAt: string;
  memo?: string;
  /** 하루 종일 반복 일정: 시간 겹침 검사에서 제외하고 상단 종일 영역에 표시 */
  allDay?: boolean;
}

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

export function getMonthlyEvents(): MonthlyEvent[] {
  return readJson<MonthlyEvent[]>(MONTHLY_EVENTS_STORAGE_KEY, []);
}

export function saveMonthlyEvents(events: MonthlyEvent[]) {
  writeJson(MONTHLY_EVENTS_STORAGE_KEY, events);
  window.dispatchEvent(new Event(TIMETABLE_CHANGED_EVENT));
}

export function getWorkSchedules(): WorkSchedule[] {
  return readJson<WorkSchedule[]>(WORK_SCHEDULES_STORAGE_KEY, []);
}

export function saveWorkSchedules(schedules: WorkSchedule[]) {
  writeJson(WORK_SCHEDULES_STORAGE_KEY, schedules);
  window.dispatchEvent(new Event(WORK_SCHEDULES_CHANGED_EVENT));
}

export function getCourseSessions(): CourseSessionProgress[] {
  return readJson<CourseSessionProgress[]>(COURSE_SESSIONS_STORAGE_KEY, []);
}

export function getCourseSession(
  courseId: string,
  date: string,
  startTime: string,
): CourseSessionProgress | null {
  return (
    getCourseSessions().find(
      (session) =>
        session.courseId === courseId &&
        session.date === date &&
        session.startTime === startTime,
    ) ?? null
  );
}

export function saveCourseSession(session: CourseSessionProgress) {
  const sessions = getCourseSessions();
  const existingIndex = sessions.findIndex(
    (item) =>
      item.courseId === session.courseId &&
      item.date === session.date &&
      item.startTime === session.startTime,
  );

  if (existingIndex >= 0) {
    sessions[existingIndex] = session;
    writeJson(COURSE_SESSIONS_STORAGE_KEY, sessions);
  } else {
    writeJson(COURSE_SESSIONS_STORAGE_KEY, [session, ...sessions]);
  }

  window.dispatchEvent(new Event(TIMETABLE_CHANGED_EVENT));
}

export const MAX_CREDITS_STORAGE_KEY = "unilink:max-credits";
export const DEFAULT_MAX_CREDITS = 18;
export const MAX_CREDITS_RANGE = { min: 9, max: 24 } as const;

/** 사용자가 설정한 학기당 최대 수강 학점 (학교·학년마다 달라 직접 설정) */
export function getMaxCredits(): number {
  const value = readJson<number>(MAX_CREDITS_STORAGE_KEY, DEFAULT_MAX_CREDITS);
  return Number.isInteger(value) && value >= MAX_CREDITS_RANGE.min && value <= MAX_CREDITS_RANGE.max
    ? value
    : DEFAULT_MAX_CREDITS;
}

export function saveMaxCredits(value: number) {
  writeJson(MAX_CREDITS_STORAGE_KEY, value);
}

export const TIMETABLE_TERMS_STORAGE_KEY = "unilink:timetable-terms";

/** 사용자가 직접 만든 시간표(학기) 목록. 과목이 없는 빈 시간표도 유지하기 위해 따로 저장한다. */
export function getTimetableTerms(): string[] {
  const value = readJson<unknown>(TIMETABLE_TERMS_STORAGE_KEY, []);
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function saveTimetableTerms(terms: string[]) {
  writeJson(TIMETABLE_TERMS_STORAGE_KEY, [...new Set(terms)]);
}

export const ALL_DAY_START = "00:00";
export const ALL_DAY_END = "23:59";
