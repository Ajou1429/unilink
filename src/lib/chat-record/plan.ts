// 홈 채팅 기록의 순수 로직: 과목·날짜·파일이 비었는지, 그 날 수업 시간, 되물을 때 보여 줄 수업 날짜.
// 브라우저 저장소를 쓰지 않아 Node 테스트에서 바로 읽는다.
import type { ChatAction } from "../../../supabase/functions/_shared/chatRecord.ts";
import type { Course, DayOfWeek } from "../types.ts";

export type { ChatAction };
export type Missing = "course" | "date" | "file";

const DAY_NAMES: DayOfWeek[] = ["일", "월", "화", "수", "목", "금", "토"] as DayOfWeek[];

export function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function weekdayOf(dateValue: string): DayOfWeek {
  const [y, m, d] = dateValue.split("-").map(Number);
  return DAY_NAMES[new Date(y, m - 1, d).getDay()];
}

export function courseSlots(course: Pick<Course, "days" | "startTime" | "endTime" | "schedules">) {
  if (course.schedules?.length) return course.schedules;
  return (course.days ?? []).map((day) => ({ day, startTime: course.startTime, endTime: course.endTime }));
}

/** 그 날짜의 수업 시간. 수업이 없는 날(보강·시간 미정 과목)은 시간 없이 회차를 만든다. */
export function slotFor(course: Pick<Course, "days" | "startTime" | "endTime" | "schedules">, dateValue: string) {
  const day = weekdayOf(dateValue);
  const slot = courseSlots(course).filter((item) => item.day === day && item.startTime).sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
  return slot ? { startTime: slot.startTime, endTime: slot.endTime } : { startTime: "", endTime: "" };
}

/** 날짜를 되물을 때 버튼으로 보여 줄 최근 수업일(오늘 포함, 최신순) */
export function recentClassDates(course: Pick<Course, "days" | "startTime" | "endTime" | "schedules">, today: string, count = 3): string[] {
  const days = new Set(courseSlots(course).map((slot) => slot.day));
  const [y, m, d] = today.split("-").map(Number);
  const out: string[] = [];
  for (let offset = 0; offset < 21 && out.length < count; offset++) {
    const date = new Date(y, m - 1, d - offset);
    if (!days.size || days.has(DAY_NAMES[date.getDay()])) out.push(dateKey(date));
  }
  return out;
}

export interface ProblemFileIndex { file: string; label: string; problems: string[] }

/**
 * 저장 전에 사용자에게 물어봐야 할 것. 과목 → 날짜(회차) → 문제 파일 순.
 * 과목이 나중에 정해진 문제 기록은 여기서 그 과목의 문항 번호로 다시 맞춘다.
 */
export function missingOf(action: ChatAction, filesByCourse: Map<string, ProblemFileIndex[]>): Missing | null {
  if (!action.course_id) return "course";
  if (action.kind === "session" && !action.date) return "date";
  if (action.kind === "problem" && !action.problem_file) {
    const files = (filesByCourse.get(action.course_id) ?? []).filter((file) => action.problem_labels.some((label) => file.problems.includes(label)));
    if (files.length > 1) return "file";
  }
  return null;
}

/** 과목·파일이 정해진 뒤 문제 기록을 실제 문항에 맞춘다. 맞는 문항이 없으면 null. */
export function resolveProblemAction(action: ChatAction, filesByCourse: Map<string, ProblemFileIndex[]>): ChatAction | null {
  if (action.kind !== "problem" || !action.course_id) return action;
  const files = filesByCourse.get(action.course_id) ?? [];
  const candidates = action.problem_file ? files.filter((file) => file.file === action.problem_file)
    : files.filter((file) => action.problem_labels.some((label) => file.problems.includes(label)));
  if (candidates.length !== 1) return candidates.length ? action : null;
  const labels = action.problem_labels.filter((label) => candidates[0].problems.includes(label));
  return labels.length ? { ...action, problem_file: candidates[0].file, problem_labels: labels } : null;
}

// 과목 이름 일부처럼 보이지만 흔히 쓰는 말 (예: "알고 있어" ≠ 알고리즘)
const COMMON_WORDS = new Set(["알고", "알겠", "수업", "오늘", "어제", "이해", "모르", "공부", "데이", "문제"]);
const PARTICLES = /(에서|으로|이랑|하고|까지|부터|은|는|이|가|을|를|에|도|의|랑|로|만)$/;
const squash = (value: string) => value.replace(/\s+/g, "").toLowerCase();

function isAbbreviation(token: string, name: string) {
  if (token.length < 2 || token.length >= name.length || token[0] !== name[0]) return false;
  let at = 0;
  for (const char of token) {
    at = name.indexOf(char, at);
    if (at < 0) return false;
    at += 1;
  }
  return true;
}

/**
 * 과목을 사용자가 직접 말했는지(이름·과목 코드·약칭). 사용자가 "과목은 항상 되묻기"를 골랐으므로
 * AI가 주제만 보고 과목을 짐작해 채운 경우를 걸러 낸다.
 */
export function courseMentioned(course: { name: string; courseCode?: string }, texts: string[]) {
  const name = squash(course.name);
  const code = course.courseCode ? squash(course.courseCode) : "";
  return texts.some((text) => {
    const flat = squash(text);
    if (flat.includes(name) || (code && flat.includes(code))) return true;
    return text.split(/[^\p{L}\p{N}]+/u).some((raw) => {
      const token = raw.toLowerCase().replace(PARTICLES, "");
      return !COMMON_WORDS.has(token) && isAbbreviation(token, name);
    });
  });
}

/** 같은 기록인지(되묻던 기록에 사용자가 글로 답해 다시 해석된 경우) */
export function sameRecord(a: ChatAction, b: ChatAction) {
  if (a.kind !== b.kind) return false;
  if (a.kind === "topic") return squash(a.topic ?? "") === squash(b.topic ?? "");
  if (a.kind === "session") return (a.course_id === null || b.course_id === null || a.course_id === b.course_id)
    && ((!!a.progress_title && squash(a.progress_title) === squash(b.progress_title ?? ""))
      || (!!a.pace && a.pace === b.pace) || (!!a.difficulty && a.difficulty === b.difficulty));
  return a.problem_labels.some((label) => b.problem_labels.includes(label));
}

const PENDING_QUESTIONS: Record<Missing, string> = { course: "어느 과목인가요?", date: "언제 수업인가요?", file: "어느 파일의 문제인가요?" };

/** 되묻는 중인 기록을 AI에게 알려 주는 한 줄 (사용자가 버튼 대신 글로 답할 때 이어서 해석하도록) */
export function pendingNote(action: ChatAction, missing: Missing, courseName?: string) {
  const what = action.kind === "topic" ? `주제 ${action.topic} (${action.status ? STATUS_LABELS[action.status] : ""})`
    : action.kind === "session" ? `수업 진도 ${[action.progress_title, action.pace && `빠르기 ${action.pace}`, action.difficulty && `난이도 ${action.difficulty}`].filter(Boolean).join(", ")}`
      : `문제 ${action.problem_labels.join(", ")}번 이해도 ${action.problem_level}`;
  return `확인 중: ${PENDING_QUESTIONS[missing]} — ${courseName ? `${courseName} ` : ""}${what}`;
}

export const STATUS_LABELS = { not_started: "미학습", in_progress: "학습 중", needs_review: "복습 필요", understood: "이해함" } as const;
export const LEVEL_LABELS = { 상: "상", 중: "중", 하: "하" } as const;

export function formatDate(dateValue: string) {
  const [, m, d] = dateValue.split("-").map(Number);
  return `${m}/${d}(${weekdayOf(dateValue)})`;
}
