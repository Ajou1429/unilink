// 과목 화면의 중간고사 / 기말고사 구분.
// - 문제은행은 저장할 때 정한 범위(source_file 접두사)를 그대로 쓴다.
// - 강의자료·계획은 날짜로 자동 분류한다: 그 과목의 중간고사 일정이 있으면 그날까지가 중간, 없으면 문제은행과 같은 월 기준.
// - 잘못 들어간 항목은 과목 설정에서 옮기며, 옮긴 결과는 이 브라우저에 저장한다.
import { privateStorage } from "../private-storage.ts";
import { examPeriodFor } from "../file-intake/classify-local.ts";

export type ExamPeriod = "midterm" | "final";
export const PERIOD_LABELS: Record<ExamPeriod, string> = { midterm: "중간고사", final: "기말고사" };

const OVERRIDES_KEY = "unilink:course-period-overrides";
export const PERIODS_CHANGED_EVENT = "unilink:coursePeriodsChanged";

const dateKey = (value: string) => value.slice(0, 10);

/** 날짜 기준 자동 분류. midtermDate: 중간고사 날짜(YYYY-MM-DD) */
export function periodByDate(date: string | null | undefined, midtermDate: string | null): ExamPeriod {
  if (!date || !/^\d{4}-\d{2}-\d{2}/.test(date)) return "midterm";
  if (midtermDate) return dateKey(date) <= midtermDate ? "midterm" : "final";
  const [y, m, d] = dateKey(date).split("-").map(Number);
  return examPeriodFor(new Date(y, m - 1, d));
}

export function getPeriodOverrides(): Record<string, ExamPeriod> {
  try {
    const value = JSON.parse(privateStorage.getItem(OVERRIDES_KEY) ?? "{}");
    return value && typeof value === "object" ? value : {};
  } catch {
    return {};
  }
}

export function setPeriodOverride(key: string, period: ExamPeriod | null) {
  const next = { ...getPeriodOverrides() };
  if (period) next[key] = period;
  else delete next[key];
  try { privateStorage.setItem(OVERRIDES_KEY, JSON.stringify(next)); } catch { /* 이번 화면에서만 */ }
  window.dispatchEvent(new Event(PERIODS_CHANGED_EVENT));
}

export function resolvePeriod(key: string, date: string | null | undefined, midtermDate: string | null, overrides: Record<string, ExamPeriod>) {
  return overrides[key] ?? periodByDate(date, midtermDate);
}

/** 중간고사 일정 고르기: 제목에 '중간'이 있는 시험 일정 중 가장 이른 날짜 */
export function pickMidtermDate(events: { title: string; event_type: string; date: string | null }[]): string | null {
  const dates = events
    .filter((event) => event.event_type === "exam" && /중간|midterm|mid-term/i.test(event.title) && event.date)
    .map((event) => dateKey(event.date!))
    .sort();
  return dates[0] ?? null;
}
