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

// ── 아주대 강의계획서 양식 읽기 (AI 없이) ─────────────────────────────
// 아주대 포털 강의계획서는 항목 이름이 정해져 있다: 학수구분(학점/시간) 전선(3/3) · 교과목코드 ECE256 ·
// 개설년도/학기 2026년도 2학기 · 강의시간 및 강의실 월B(원340) 목B(원340) · 담당교수 성명(소속) 이정원(전자공학과) ·
// 9. 학습평가 방법 표(평가항목 횟수 평가비율: 중간고사 1 30) · 과목명은 '담당교수' 바로 위 줄.

const SEASON_BY_NUMBER: Record<string, TermSeason> = { "1": "1학기", "2": "2학기" };
const GRADING_ROW = /^(출석|중간고사|기말고사|과제|퀴즈|발표|토론|보고서|프로젝트|실습)\s+(?:(\d{1,2})회?\s+)?(\d{1,3}(?:\.\d)?)(?:\s*~\s*(\d{1,3}))?\s*%?(?:\s|$)/;
const LABEL_LINE = /^(교과목|교육과정|참고사항|선수과목|관련 기초과목|동시수강 추천과목|관련 고급과목|담당교수|담당조교|\d{4}\s*교육우수\s*교수)/;

/** 아주대 양식인지 (항목 이름이 여럿 보이면) */
export function isAjouSyllabus(text: string) {
  return ["학수구분", "교과목코드", "개설년도/학기", "강의시간 및 강의실", "담당교수"].filter((label) => text.includes(label)).length >= 3;
}

export function parseAjouSyllabus(text: string): SyllabusInfo | null {
  if (!isAjouSyllabus(text)) return null;
  const lines = text.split(/\n/).map((line) => line.trim()).filter(Boolean);
  const after = (label: RegExp) => {
    for (const line of lines) {
      const m = label.exec(line);
      if (m) return line.slice(m.index + m[0].length).trim();
    }
    return "";
  };
  const code = /교과목코드\s*([A-Z]{2,5}\s?\d{3,4}[A-Z]?)/.exec(text)?.[1]?.replace(/\s/g, "") ?? null;
  const kind = /학수구분\(학점\/시간\)\s*([가-힣]{1,4})\s*\((\d+(?:\.\d)?)\s*\/\s*\d+/.exec(text);
  const term = /개설년도\/학기\s*(\d{4})\s*년도\s*(\d)\s*학기/.exec(text);
  // "목B(원340)(원340)"처럼 강의실이 한 번 더 붙어 나오면 하나만 남긴다
  const schedule = after(/강의시간 및 강의실\s*/).replace(/\s*영어등급.*$/, "").replace(/(\([^)]*\))(?:\s*\1)+/g, "$1").trim();
  const professor = /담당교수\s*성명\(소속\)\s*([가-힣A-Za-z ]{2,30}?)\s*\(/.exec(text)?.[1]?.trim()
    ?? /성명\(소속\)\s*([가-힣A-Za-z ]{2,30}?)\s*\(/.exec(text)?.[1]?.trim() ?? null;
  // 과목명: '담당교수' 줄 바로 위의 짧은 줄(항목 이름이 아닌 것)
  const profAt = lines.findIndex((line) => line === "담당교수" || line.startsWith("담당교수"));
  let name: string | null = null;
  for (let i = profAt - 1; i >= 0 && i >= profAt - 2; i--) {
    const line = lines[i];
    if (line.length <= 40 && !LABEL_LINE.test(line) && !/[,，]/.test(line)) { name = line; break; }
    // "관련 고급과목 A, B 과목명"처럼 같은 줄에 붙은 경우는 건너뛴다
  }
  const grading: SyllabusInfo["grading"] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const m = GRADING_ROW.exec(line);
    if (!m || seen.has(m[1])) continue;
    const weight = Number(m[4] ?? m[3]);
    if (weight > 0 && weight <= 100) { grading.push({ item: m[1], weight }); seen.add(m[1]); }
  }
  return {
    course_name: name, course_code: code, professor, credits: kind ? Number(kind[2]) : null, category: kind?.[1] ?? null,
    year: term ? Number(term[1]) : null, semester: term ? SEASON_BY_NUMBER[term[2]] ?? null : null,
    meetings: [], schedule_text: schedule || null, grading,
  };
}
