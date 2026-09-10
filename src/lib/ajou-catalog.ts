import type { Course, CourseSchedule, DayOfWeek } from "./types";

export const AJOU_TERM = "2026년 2학기";
export const AJOU_AS_OF = "2026-09-02";
export interface CatalogSection {
  registrationNumber: string;
  name: string;
  department: string;
  major: string;
  credits: number;
  category: string;
  curriculum: string;
  professor: string;
  rawSchedule: string;
  courseCode: string;
  subjectId: string;
  englishName: string;
  targetYear: string;
  english: boolean;
  internationalOnly: boolean;
  priorityEnrollment: boolean;
  teamTaught: boolean;
  teachingMode: string;
  specialty: string;
}
export interface ParsedSection extends CatalogSection {
  schedules: CourseSchedule[];
  scheduleWarning: string | null;
}

const DAYS = "월화수목금토일";
const minutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;

// Ajou published periods: A 09:00–10:15, B 10:30–11:45, ... H 19:30–20:45.
// Numbered periods start at 08:00 + period*60 and last 50 minutes.
// Half periods shift the start by 30 minutes; explicit clock ranges take precedence.
// Source: https://www.ajou.ac.kr/gs/bachelor/enrolment.do
export function parseAjouSchedule(raw: string): { schedules: CourseSchedule[]; warning: string | null } {
  if (!raw.trim()) return { schedules: [], warning: "시간 미정·별도 운영: 강의계획서 확인 필요" };
  const token = /([월화수목금토일])?\s*(\d{1,2}:\d{2}\s*[~～–-]\s*\d{1,2}:\d{2}|[A-H]|\d+(?:\.5)?)(?:\s*\(([^)]*)\))?/g;
  const schedules: CourseSchedule[] = [];
  let day: DayOfWeek | undefined;
  let invalid = false;
  const remainder = raw.replace(token, (_, nextDay: DayOfWeek | undefined, period: string, room: string | undefined) => {
    day = nextDay || day;
    let start: number;
    let end: number;
    if (period.includes(":")) {
      const [from, to] = period.split(/\s*[~～–-]\s*/);
      start = minutes(from);
      end = minutes(to);
      if ([from, to].some((t) => Number(t.split(":")[1]) >= 60)) invalid = true;
    } else if (/^[A-H]$/.test(period)) {
      start = 540 + (period.charCodeAt(0) - 65) * 90;
      end = start + 75;
    } else {
      start = 480 + Number(period) * 60;
      end = start + 50;
    }
    if (!day || !Number.isFinite(start) || start < 0 || end > 1440 || end <= start) invalid = true;
    else schedules.push({ day, startTime: clock(start), endTime: clock(end), location: room?.trim() || "" });
    return "";
  });
  // Do not silently accept partially parsed schedules.
  if (invalid || remainder.trim() || schedules.length === 0) {
    return { schedules: [], warning: "시간 표기 확인 필요: 원본을 확인한 뒤 직접 추가해주세요" };
  }
  const sorted = schedules.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || minutes(a.startTime) - minutes(b.startTime));
  const merged: CourseSchedule[] = [];
  for (const entry of sorted) {
    const previous = merged.at(-1);
    if (previous && previous.day === entry.day && previous.location === entry.location && minutes(entry.startTime) <= minutes(previous.endTime) + 10) {
      previous.endTime = clock(Math.max(minutes(previous.endTime), minutes(entry.endTime)));
    } else merged.push({ ...entry });
  }
  return { schedules: merged, warning: null };
}

export function prepareSection(section: CatalogSection): ParsedSection {
  const { schedules, warning } = parseAjouSchedule(section.rawSchedule);
  return { ...section, schedules, scheduleWarning: warning };
}

export function courseSchedules(course: Pick<Course, "schedules" | "days" | "startTime" | "endTime">): CourseSchedule[] {
  return course.schedules?.length ? course.schedules : course.days.map((day) => ({ day, startTime: course.startTime, endTime: course.endTime }));
}

export function schedulesOverlap(a: CourseSchedule[], b: CourseSchedule[]) {
  return a.some((left) => b.some((right) => left.day === right.day && minutes(left.startTime) < minutes(right.endTime) && minutes(right.startTime) < minutes(left.endTime)));
}

export function sameCatalogSubject(section: Pick<CatalogSection, "registrationNumber" | "subjectId" | "courseCode">, course: Course) {
  return course.catalogSource === "ajou" && course.term === AJOU_TERM && (
    course.registrationNumber === section.registrationNumber ||
    Boolean(section.subjectId && section.subjectId === course.catalogSubjectId) ||
    Boolean(section.courseCode && section.courseCode === course.courseCode)
  );
}

export function sectionToCourse(section: ParsedSection, color: string): Course {
  if (section.scheduleWarning || !section.schedules.length) throw new Error("강의시간을 확인한 과목만 자동 추가할 수 있습니다.");
  const first = section.schedules[0];
  return {
    id: `ajou-2026-2-${section.registrationNumber}`, term: AJOU_TERM,
    catalogSource: "ajou", registrationNumber: section.registrationNumber,
    courseCode: section.courseCode, catalogSubjectId: section.subjectId,
    originalSchedule: section.rawSchedule,
    name: section.name, professor: section.professor,
    location: [...new Set(section.schedules.map((s) => s.location).filter(Boolean))].join(" / "),
    credits: section.credits, color,
    courseType: section.curriculum === "전공과목" ? "major" : "non-major",
    days: [...new Set(section.schedules.map((s) => s.day))], schedules: section.schedules,
    startTime: first.startTime, endTime: first.endTime,
  };
}

export function matchesCatalogSearch(section: CatalogSection, query: string) {
  const normalize = (value: string) => value.toLocaleLowerCase().replace(/\s+/g, "");
  const haystack = normalize([section.name, section.professor, section.registrationNumber, section.courseCode, section.department, section.major, section.englishName].join(" "));
  return query.trim().split(/\s+/).every((word) => haystack.includes(normalize(word)));
}
