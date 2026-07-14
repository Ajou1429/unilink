import { Course } from "./types";

export const MONTHLY_EVENTS_STORAGE_KEY = "unilink:monthly-events";
export const COURSE_SESSIONS_STORAGE_KEY = "unilink:course-sessions";
export const TIMETABLE_CHANGED_EVENT = "unilink:timetableChanged";

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

export function getMonthlyEvents(): MonthlyEvent[] {
  return readJson<MonthlyEvent[]>(MONTHLY_EVENTS_STORAGE_KEY, []);
}

export function saveMonthlyEvents(events: MonthlyEvent[]) {
  writeJson(MONTHLY_EVENTS_STORAGE_KEY, events);
  window.dispatchEvent(new Event(TIMETABLE_CHANGED_EVENT));
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
