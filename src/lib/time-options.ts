// 시간 선택지와 수업 시간 칸 계산 (순수 함수, Node 테스트 대상)
import type { DayOfWeek } from "./types.ts";

/** start~end(포함)을 step분 간격으로. 예: 과목 시간 09:00~21:00, 15분 */
export function makeTimeOptions(start: string, end: string, step: number) {
  const toMinutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  const out: string[] = [];
  for (let minutes = toMinutes(start); minutes <= toMinutes(end); minutes += step) {
    out.push(`${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`);
  }
  return out;
}

/** 수업 시간: 오전 9시 ~ 오후 9시, 15분 단위 */
export const COURSE_TIME_OPTIONS = makeTimeOptions("09:00", "21:00", 15);

/** 목록 밖 시간(직접 입력)은 가장 가까운 선택지로 맞춘다 */
export function snapToOptions(time: string, options: string[]) {
  if (options.includes(time)) return time;
  if (!/^\d{2}:\d{2}$/.test(time)) return options[0];
  const target = toMinutes(time);
  return options.reduce((best, option) => (Math.abs(toMinutes(option) - target) < Math.abs(toMinutes(best) - target) ? option : best), options[0]);
}

export function toMinutes(time: string) {
  return Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
}
const toTime = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
const LAST = toMinutes(COURSE_TIME_OPTIONS[COURSE_TIME_OPTIONS.length - 1]);

/** 같은 요일에 한 번 더: 그 요일 마지막 수업이 끝난 뒤 같은 길이로 (오후 9시를 넘지 않게) */
export function nextSlotTimes(sameDay: { startTime: string; endTime: string }[]) {
  if (!sameDay.length) return { startTime: "09:00", endTime: "10:15" };
  const last = [...sameDay].sort((a, b) => toMinutes(a.endTime) - toMinutes(b.endTime)).at(-1)!;
  const length = Math.max(15, toMinutes(last.endTime) - toMinutes(last.startTime));
  const start = Math.min(toMinutes(last.endTime) + 15, LAST - 15);
  return { startTime: toTime(start), endTime: toTime(Math.min(start + length, LAST)) };
}

/** 같은 과목의 두 시간이 겹치는지 */
export function slotsOverlap(slots: { day: DayOfWeek; startTime: string; endTime: string }[]) {
  return slots.some((a, i) => slots.some((b, j) => i < j && a.day === b.day && toMinutes(a.startTime) < toMinutes(b.endTime) && toMinutes(b.startTime) < toMinutes(a.endTime)));
}
