import { StudyPlan } from "./types";

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
  createdAt: string;
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

export function getWeeklyStudyPlans(fallback: StudyPlan[] = []): StudyPlan[] {
  return readJson<StudyPlan[]>(WEEKLY_STUDY_PLANS_STORAGE_KEY, fallback);
}

export function saveWeeklyStudyPlans(plans: StudyPlan[]) {
  writeJson(WEEKLY_STUDY_PLANS_STORAGE_KEY, plans);
  window.dispatchEvent(new Event(STUDY_PLANS_CHANGED_EVENT));
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
