import { parseAjouSchedule } from "../ajou-catalog.ts";
import { formatAcademicTerm, type TermSeason } from "../academic-term.ts";
import type { Course, CourseSchedule, DayOfWeek } from "../types";

/** AI가 강의계획서에서 읽어 온 항목 (서버 file-classify의 syllabus 모드 응답) */
export interface SyllabusInfo {
  course_name: string | null;
  course_code: string | null;
  professor: string | null;
  credits: number | null;
  category: string | null;
  year: number | null;
  semester: TermSeason | null;
  meetings: { day: DayOfWeek; start: string; end: string; room: string | null }[];
  schedule_text: string | null;
  grading: { item: string; weight: number }[];
}

const DAYS: DayOfWeek[] = ["월", "화", "수", "목", "금", "토", "일"];
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const compact = (value: string) => value.replace(/\s+/g, "").toLowerCase();
const compactCode = (value?: string | null) => (value ?? "").toUpperCase().replace(/[\s-]/g, "");

/** 계획서에 적힌 학기. 없으면 fallback(현재 학기) */
export function syllabusTerm(info: Pick<SyllabusInfo, "year" | "semester">, fallback: string) {
  return info.year && info.semester && info.year >= 2000 && info.year <= 2100 ? formatAcademicTerm(info.year, info.semester) : fallback;
}

/** 수업 시간: 요일·시각이 구조화돼 있으면 그대로, 아니면 아주대 교시 표기(schedule_text)를 해석한다. */
export function syllabusSchedules(info: Pick<SyllabusInfo, "meetings" | "schedule_text">): CourseSchedule[] {
  const meetings = info.meetings
    .filter((m) => DAYS.includes(m.day) && TIME.test(m.start) && TIME.test(m.end) && m.start < m.end)
    .map((m) => ({ day: m.day, startTime: m.start, endTime: m.end, location: m.room?.trim() ?? "" }));
  if (meetings.length) return meetings;
  return info.schedule_text ? parseAjouSchedule(info.schedule_text).schedules : [];
}

/** 같은 학기 시간표에 이미 있는 과목: 과목코드가 같거나, 코드가 없을 때 과목명이 같으면 같은 과목 */
export function findSyllabusCourse(courses: Course[], info: Pick<SyllabusInfo, "course_code" | "course_name">, term: string) {
  const inTerm = courses.filter((course) => course.term === term);
  const code = compactCode(info.course_code);
  if (code) {
    const byCode = inTerm.find((course) => compactCode(course.courseCode) === code);
    if (byCode) return byCode;
  }
  const name = compact(info.course_name ?? "");
  return name ? inTerm.find((course) => compact(course.name) === name) : undefined;
}

export function cleanGrading(grading: SyllabusInfo["grading"]) {
  return grading
    .filter((g) => g.item.trim() && Number.isFinite(g.weight) && g.weight > 0 && g.weight <= 100)
    .map((g) => ({ item: g.item.trim().slice(0, 40), weight: Math.round(g.weight * 10) / 10 }))
    .slice(0, 12);
}

export function buildSyllabusCourse(info: SyllabusInfo, term: string, id: string, color: string): Course {
  const schedules = syllabusSchedules(info);
  const category = info.category?.trim() || undefined;
  return {
    id,
    term,
    name: (info.course_name ?? "").trim().slice(0, 100),
    courseCode: info.course_code?.trim() || undefined,
    professor: info.professor?.trim() ?? "",
    location: [...new Set(schedules.map((s) => s.location).filter(Boolean))].join(" / "),
    color,
    category,
    courseType: category && !category.startsWith("전") ? "non-major" : "major",
    credits: info.credits && info.credits > 0 && info.credits <= 30 ? info.credits : 3,
    days: [...new Set(schedules.map((s) => s.day))],
    schedules,
    startTime: schedules[0]?.startTime ?? "",
    endTime: schedules[0]?.endTime ?? "",
    gradingWeights: cleanGrading(info.grading),
  };
}

/** 이미 있는 과목에는 성적 반영비율과 비어 있던 정보만 채운다(시간표는 건드리지 않는다). */
export function mergeSyllabusIntoCourse(course: Course, info: SyllabusInfo): Course {
  const grading = cleanGrading(info.grading);
  return {
    ...course,
    courseCode: course.courseCode || info.course_code?.trim() || undefined,
    professor: course.professor || info.professor?.trim() || "",
    category: course.category || info.category?.trim() || undefined,
    gradingWeights: grading.length ? grading : course.gradingWeights,
  };
}
