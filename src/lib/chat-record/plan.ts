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

export const STATUS_LABELS = { not_started: "미학습", in_progress: "학습 중", needs_review: "복습 필요", understood: "이해함" } as const;
export const LEVEL_LABELS = { 상: "상", 중: "중", 하: "하" } as const;

export function formatDate(dateValue: string) {
  const [, m, d] = dateValue.split("-").map(Number);
  return `${m}/${d}(${weekdayOf(dateValue)})`;
}
