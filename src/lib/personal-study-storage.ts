export const PERSONAL_STUDIES_STORAGE_KEY = "unilink:personal-studies";
export const PERSONAL_STUDY_NOTES_STORAGE_KEY = "unilink:personal-study-notes";
export const PERSONAL_STUDY_PLANS_STORAGE_KEY = "unilink:personal-study-plans";
export const PERSONAL_STUDY_FILES_STORAGE_KEY = "unilink:personal-study-files";
export const PERSONAL_STUDIES_CHANGED_EVENT = "unilink:personalStudiesChanged";
export const PERSONAL_STUDY_PLANS_CHANGED_EVENT = "unilink:personalStudyPlansChanged";

export interface PersonalStudy {
  id: string;
  title: string;
  category: string;
  goal: string;
  targetDate?: string;
  status?: "active" | "completed" | "cancelled";
  completedAt?: string;
  color: string;
  createdAt: string;
}

export interface PersonalStudyNote {
  id: string;
  studyId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface PersonalStudyPlan {
  id: string;
  studyId: string;
  title: string;
  description: string;
  dueDate: string;
  isCompleted: boolean;
  createdAt: string;
}

export interface PersonalStudyFile {
  id: string;
  studyId: string;
  name: string;
  type: string;
  size: number;
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

export function getPersonalStudies(): PersonalStudy[] {
  return readJson<PersonalStudy[]>(PERSONAL_STUDIES_STORAGE_KEY, []);
}

export function savePersonalStudies(studies: PersonalStudy[]) {
  writeJson(PERSONAL_STUDIES_STORAGE_KEY, studies);
  window.dispatchEvent(new Event(PERSONAL_STUDIES_CHANGED_EVENT));
}

export function completePersonalStudy(studyId: string) {
  const completedAt = new Date().toISOString();
  const studies = getPersonalStudies().map((study) =>
    study.id === studyId
      ? { ...study, status: "completed" as const, completedAt }
      : study,
  );
  savePersonalStudies(studies);
  return studies.find((study) => study.id === studyId) ?? null;
}

export function deletePersonalStudy(studyId: string) {
  const studies = getPersonalStudies().filter((study) => study.id !== studyId);
  const notes = readJson<PersonalStudyNote[]>(PERSONAL_STUDY_NOTES_STORAGE_KEY, []).filter(
    (note) => note.studyId !== studyId,
  );
  const plans = readJson<PersonalStudyPlan[]>(PERSONAL_STUDY_PLANS_STORAGE_KEY, []).filter(
    (plan) => plan.studyId !== studyId,
  );
  const files = readJson<PersonalStudyFile[]>(PERSONAL_STUDY_FILES_STORAGE_KEY, []).filter(
    (file) => file.studyId !== studyId,
  );
  writeJson(PERSONAL_STUDY_NOTES_STORAGE_KEY, notes);
  writeJson(PERSONAL_STUDY_PLANS_STORAGE_KEY, plans);
  writeJson(PERSONAL_STUDY_FILES_STORAGE_KEY, files);
  savePersonalStudies(studies);
  window.dispatchEvent(new Event(PERSONAL_STUDY_PLANS_CHANGED_EVENT));
}

export function getPersonalStudyNotes(studyId: string): PersonalStudyNote[] {
  return readJson<PersonalStudyNote[]>(PERSONAL_STUDY_NOTES_STORAGE_KEY, []).filter(
    (note) => note.studyId === studyId,
  );
}

export function savePersonalStudyNote(note: PersonalStudyNote) {
  const notes = readJson<PersonalStudyNote[]>(PERSONAL_STUDY_NOTES_STORAGE_KEY, []);
  writeJson(PERSONAL_STUDY_NOTES_STORAGE_KEY, [note, ...notes]);
}

export function getPersonalStudyPlans(studyId: string): PersonalStudyPlan[] {
  return readJson<PersonalStudyPlan[]>(PERSONAL_STUDY_PLANS_STORAGE_KEY, []).filter(
    (plan) => plan.studyId === studyId,
  );
}

export function savePersonalStudyPlan(plan: PersonalStudyPlan) {
  const plans = readJson<PersonalStudyPlan[]>(PERSONAL_STUDY_PLANS_STORAGE_KEY, []);
  writeJson(PERSONAL_STUDY_PLANS_STORAGE_KEY, [plan, ...plans]);
  window.dispatchEvent(new Event(PERSONAL_STUDY_PLANS_CHANGED_EVENT));
}

export function updatePersonalStudyPlan(
  planId: string,
  patch: Partial<PersonalStudyPlan>,
) {
  const plans = readJson<PersonalStudyPlan[]>(PERSONAL_STUDY_PLANS_STORAGE_KEY, []).map(
    (plan) => (plan.id === planId ? { ...plan, ...patch } : plan),
  );
  writeJson(PERSONAL_STUDY_PLANS_STORAGE_KEY, plans);
  window.dispatchEvent(new Event(PERSONAL_STUDY_PLANS_CHANGED_EVENT));
  return plans.find((plan) => plan.id === planId) ?? null;
}

export function deletePersonalStudyPlan(planId: string) {
  const plans = readJson<PersonalStudyPlan[]>(PERSONAL_STUDY_PLANS_STORAGE_KEY, []).filter(
    (plan) => plan.id !== planId,
  );
  writeJson(PERSONAL_STUDY_PLANS_STORAGE_KEY, plans);
  window.dispatchEvent(new Event(PERSONAL_STUDY_PLANS_CHANGED_EVENT));
}

export function getAllPersonalStudyPlans(): PersonalStudyPlan[] {
  return readJson<PersonalStudyPlan[]>(PERSONAL_STUDY_PLANS_STORAGE_KEY, []);
}

export function formatPersonalStudyDday(targetDate?: string, today = new Date()) {
  if (!targetDate) return "";

  const target = new Date(`${targetDate}T00:00:00`);
  const current = new Date(today);
  target.setHours(0, 0, 0, 0);
  current.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - current.getTime()) / 86400000);

  if (days === 0) return "D-Day";
  return days > 0 ? `D-${days}` : `D+${Math.abs(days)}`;
}

export function getPersonalStudyFiles(studyId: string): PersonalStudyFile[] {
  return readJson<PersonalStudyFile[]>(PERSONAL_STUDY_FILES_STORAGE_KEY, []).filter(
    (file) => file.studyId === studyId,
  );
}

export function savePersonalStudyFile(file: PersonalStudyFile) {
  const files = readJson<PersonalStudyFile[]>(PERSONAL_STUDY_FILES_STORAGE_KEY, []);
  writeJson(PERSONAL_STUDY_FILES_STORAGE_KEY, [file, ...files]);
}
