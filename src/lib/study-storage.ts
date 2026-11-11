import { privateStorage } from "./private-storage.ts";
import type { StudyPlan } from "./types";

export const WEEKLY_STUDY_PLANS_STORAGE_KEY = "unilink:weekly-study-plans";
export const MONTHLY_STUDY_GOALS_STORAGE_KEY = "unilink:monthly-study-goals";
export const MONTHLY_STUDY_PLANS_STORAGE_KEY = "unilink:monthly-study-plans";
export const STUDY_PLANS_CHANGED_EVENT = "unilink:studyPlansChanged";

export interface MonthlyStudyGoal {
  id: string;
  month: string;
  title: string;
  description: string;
  isCompleted?: boolean;
  createdAt: string;
}

export interface MonthlyStudyPlan {
  id: string;
  month: string;
  weekStart: string;
  courseId: string;
  courseName: string;
  title: string;
  description: string;
  isCompleted?: boolean;
  createdAt: string;
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

export function getWeeklyStudyPlans(fallback: StudyPlan[] = []): StudyPlan[] {
  return readJson<StudyPlan[]>(WEEKLY_STUDY_PLANS_STORAGE_KEY, fallback);
}

export function saveWeeklyStudyPlans(plans: StudyPlan[]) {
  writeJson(WEEKLY_STUDY_PLANS_STORAGE_KEY, plans);
  window.dispatchEvent(new Event(STUDY_PLANS_CHANGED_EVENT));
}

function shiftDateKey(dateKey: string, days: number) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function sundayWeekStart(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return shiftDateKey(dateKey, -new Date(year, month - 1, day).getDay());
}

/** 학습 계획을 하루 뒤로 미루고 미룬 횟수를 1 늘린다. 주간 묶음(weekStart)도 새 날짜 기준으로 맞춘다. */
export function postponeWeeklyStudyPlan(planId: string, fallback: StudyPlan[] = []) {
  const plans = getWeeklyStudyPlans(fallback);
  const next = plans.map((plan) => {
    if (plan.id !== planId || !/^\d{4}-\d{2}-\d{2}/.test(plan.dueDate)) return plan;
    const dueKey = shiftDateKey(plan.dueDate.slice(0, 10), 1);
    return {
      ...plan,
      dueDate: dueKey + plan.dueDate.slice(10),
      ...(plan.weekStart ? { weekStart: sundayWeekStart(dueKey) } : {}),
      postponedCount: (plan.postponedCount ?? 0) + 1,
    };
  });
  saveWeeklyStudyPlans(next);
  return next.find((plan) => plan.id === planId);
}

export function getMonthlyStudyGoals(): MonthlyStudyGoal[] {
  return readJson<MonthlyStudyGoal[]>(MONTHLY_STUDY_GOALS_STORAGE_KEY, []);
}

export function saveMonthlyStudyGoals(goals: MonthlyStudyGoal[]) {
  writeJson(MONTHLY_STUDY_GOALS_STORAGE_KEY, goals);
}

export function getMonthlyStudyPlans(): MonthlyStudyPlan[] {
  return readJson<MonthlyStudyPlan[]>(MONTHLY_STUDY_PLANS_STORAGE_KEY, []);
}

export function saveMonthlyStudyPlans(plans: MonthlyStudyPlan[]) {
  writeJson(MONTHLY_STUDY_PLANS_STORAGE_KEY, plans);
  window.dispatchEvent(new Event(STUDY_PLANS_CHANGED_EVENT));
}
