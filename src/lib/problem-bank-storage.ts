import { captureStorageScope, privateStorage } from "./private-storage.ts";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { MAX_LABEL_LENGTH, MAX_LABELS } from "./problem-bank-labels.ts";
import { flushP0Changes } from "./p0-sync";

export const PROBLEM_BANK_SUBJECTS_KEY = "unilink:problem-bank-subjects";
export const PROBLEM_BANK_PROBLEMS_KEY = "unilink:problem-bank-problems";
/** 사용자가 지운 자동 연동 과목. 다시 자동으로 만들지 않는다. */
export const PROBLEM_BANK_DISMISSED_COURSES_KEY = "unilink:problem-bank-dismissed-courses";

export interface ProblemBankSubject {
  id: string;
  name: string;
  count: number;
  createdAt: string;
  /** 연동된 시간표 과목 id (자동 연동 과목만) */
  courseId?: string;
}

export { EXAM_PERIODS, joinSourceFile, splitSourceFile, type ExamPeriod } from "./problem-bank-labels.ts";

export interface SyncCourse {
  id: string;
  name: string;
}

function getDismissedCourses(): Set<string> {
  try {
    const raw = privateStorage.getItem(PROBLEM_BANK_DISMISSED_COURSES_KEY);
    const value = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set();
  }
}

function dismissCourse(courseId: string) {
  const next = getDismissedCourses();
  next.add(courseId);
  privateStorage.setItem(PROBLEM_BANK_DISMISSED_COURSES_KEY, JSON.stringify([...next]));
}

/** 문항 본문. 분석 전에 저장된 문항은 없다(null). */
export interface ProblemContent {
  v: 1;
  /** problem: 문제은행·기출 파일 / lecture: 강의노트 안의 문제 */
  kind: "problem" | "lecture";
  page: number | null;
  /** Markdown + LaTeX($…$, $$…$$). 정확히 옮기지 못한 문제는 null(그림만 보여 준다) */
  text: string | null;
  /** 크롭 그림. src는 "storage:<경로>"(로그인) 또는 "idb:<키>"(이 브라우저) */
  images: { src: string; w: number; h: number }[];
  /** 규칙과 AI가 찾은 번호가 달라 사용자 확인이 필요한 문항 */
  check: boolean;
  origin: "both" | "rule" | "ai";
}

export interface ProblemBankProblem {
  id: string;
  subjectId: string;
  label: string;
  level: number;
  /** 문항을 가져온 파일 이름. 파일 단위 기록 이전에 저장된 문항은 "" */
  sourceFile: string;
  createdAt: string;
  updatedAt: string;
  content?: ProblemContent | null;
}

export interface ProblemBankSaveResult {
  addedCount: number;
  /** 같은 파일에 이미 있어 건너뛴 문항 수 */
  skippedCount: number;
}

export const MAX_SOURCE_FILE_LENGTH = 200;

function cleanSave(sourceFile: string, labels: string[]) {
  const file = sourceFile.trim();
  if (!file || file.length > MAX_SOURCE_FILE_LENGTH) throw new Error("파일 이름을 1-200자로 입력해 주세요.");
  const clean = [...new Set(labels.map((l) => l.trim()))];
  if (!clean.length || clean.length > MAX_LABELS || clean.some((l) => !l || l.length > MAX_LABEL_LENGTH)) {
    throw new Error(`문항 번호는 1-${MAX_LABELS}개, 각 ${MAX_LABEL_LENGTH}자 이내로 입력해 주세요.`);
  }
  return { file, labels: clean };
}

function cleanLabel(label: string) {
  const clean = label.trim();
  if (!clean || clean.length > MAX_LABEL_LENGTH) throw new Error(`문항 번호는 1-${MAX_LABEL_LENGTH}자로 입력해 주세요.`);
  return clean;
}

const duplicateLabel = (label: string) => new Error(`이 파일에 이미 ${label} 문항이 있어요.`);

// ---------------------------------------------------------------------------
// localStorage 목업 — Supabase가 설정되지 않은 개발 환경(GitHub Pages 데모)에서만 쓰인다.
// PDF 문항 추출은 브라우저에서 하므로 로컬 모드에서도 같은 흐름을 쓴다.
// ---------------------------------------------------------------------------

interface LocalSubject {
  id: string;
  name: string;
  createdAt: string;
  courseId?: string;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = privateStorage.getItem(key);
    if (!raw) {
      privateStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  privateStorage.setItem(key, JSON.stringify(value));
}

function getLocalSubjects(): LocalSubject[] {
  return readJson<LocalSubject[]>(PROBLEM_BANK_SUBJECTS_KEY, []);
}

function getLocalProblems(): ProblemBankProblem[] {
  return readJson<ProblemBankProblem[]>(PROBLEM_BANK_PROBLEMS_KEY, []).map((p) => ({ ...p, sourceFile: p.sourceFile ?? "" }));
}

async function listLocalSubjects(): Promise<ProblemBankSubject[]> {
  const subjects = getLocalSubjects();
  const problems = getLocalProblems();
  return subjects.map((s) => ({
    id: s.id,
    name: s.name,
    createdAt: s.createdAt,
    courseId: s.courseId,
    count: problems.filter((p) => p.subjectId === s.id).length,
  }));
}

async function syncLocalSubjects(courses: SyncCourse[]) {
  const subjects = getLocalSubjects();
  const dismissed = getDismissedCourses();
  let changed = false;
  for (const course of courses) {
    if (dismissed.has(course.id) || subjects.some((s) => s.courseId === course.id)) continue;
    const sameName = subjects.find((s) => !s.courseId && s.name.trim() === course.name.trim());
    if (sameName) sameName.courseId = course.id;
    else subjects.push({ id: `subject-${Date.now()}-${subjects.length}`, name: course.name, createdAt: new Date().toISOString(), courseId: course.id });
    changed = true;
  }
  if (changed) writeJson(PROBLEM_BANK_SUBJECTS_KEY, subjects);
}

async function deleteLocalSubject(id: string) {
  writeJson(PROBLEM_BANK_SUBJECTS_KEY, getLocalSubjects().filter((s) => s.id !== id));
  writeJson(PROBLEM_BANK_PROBLEMS_KEY, getLocalProblems().filter((p) => p.subjectId !== id));
}

async function createLocalSubject(name: string): Promise<ProblemBankSubject> {
  const subjects = getLocalSubjects();
  const subject: LocalSubject = {
    id: `subject-${Date.now()}`,
    name,
    createdAt: new Date().toISOString(),
  };
  writeJson(PROBLEM_BANK_SUBJECTS_KEY, [...subjects, subject]);
  return { ...subject, count: 0 };
}

async function listLocalProblems(subjectId: string): Promise<ProblemBankProblem[]> {
  return getLocalProblems()
    .filter((p) => p.subjectId === subjectId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function setLocalProblemLevel(id: string, level: number): Promise<ProblemBankProblem> {
  const problems = getLocalProblems();
  const now = new Date().toISOString();
  const next = problems.map((p) => (p.id === id ? { ...p, level, updatedAt: now } : p));
  writeJson(PROBLEM_BANK_PROBLEMS_KEY, next);
  const updated = next.find((p) => p.id === id);
  if (!updated) throw new Error("문제를 찾을 수 없어요.");
  return updated;
}

async function saveLocalProblems(subjectId: string, sourceFile: string, labels: string[]): Promise<ProblemBankSaveResult> {
  const problems = getLocalProblems();
  const existing = new Set(problems.filter((p) => p.subjectId === subjectId && p.sourceFile === sourceFile).map((p) => p.label));
  const fresh = labels.filter((l) => !existing.has(l));
  const now = new Date().toISOString();
  const added = fresh.map((label, i) => ({
    id: `problem-${Date.now()}-${i}`,
    subjectId,
    label,
    level: 0,
    sourceFile,
    createdAt: now,
    updatedAt: now,
  }));
  writeJson(PROBLEM_BANK_PROBLEMS_KEY, [...problems, ...added]);
  return { addedCount: added.length, skippedCount: labels.length - added.length };
}

async function renameLocalProblem(id: string, label: string): Promise<ProblemBankProblem> {
  const problems = getLocalProblems();
  const target = problems.find((p) => p.id === id);
  if (!target) throw new Error("문제를 찾을 수 없어요.");
  if (problems.some((p) => p.id !== id && p.subjectId === target.subjectId && p.sourceFile === target.sourceFile && p.label === label)) {
    throw duplicateLabel(label);
  }
  const updated = { ...target, label, updatedAt: new Date().toISOString() };
  writeJson(PROBLEM_BANK_PROBLEMS_KEY, problems.map((p) => (p.id === id ? updated : p)));
  return updated;
}

async function deleteLocalFile(subjectId: string, sourceFile: string): Promise<void> {
  writeJson(
    PROBLEM_BANK_PROBLEMS_KEY,
    getLocalProblems().filter((p) => !(p.subjectId === subjectId && p.sourceFile === sourceFile)),
  );
}

async function deleteLocalProblem(id: string): Promise<void> {
  writeJson(
    PROBLEM_BANK_PROBLEMS_KEY,
    getLocalProblems().filter((p) => p.id !== id),
  );
}

// ---------------------------------------------------------------------------
// Supabase 연동
// ---------------------------------------------------------------------------

interface SubjectRow {
  id: string;
  name: string;
  created_at: string;
}

interface ProblemRow {
  id: string;
  subject_id: string;
  label: string;
  level: number;
  source_file: string | null;
  created_at: string;
  updated_at: string;
  content?: ProblemContent | null;
}

function rowToProblem(row: ProblemRow): ProblemBankProblem {
  return {
    id: row.id,
    subjectId: row.subject_id,
    label: row.label,
    level: row.level,
    sourceFile: row.source_file ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    content: row.content ?? null,
  };
}

async function listSupabaseSubjects(): Promise<ProblemBankSubject[]> {
  const supabase = getSupabaseClient()!;
  const { data: subjects, error } = await supabase
    .from("problem_bank_subjects")
    .select("*")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const { data: problems, error: countError } = await supabase
    .from("problem_bank_problems")
    .select("subject_id");
  if (countError) throw new Error(countError.message);

  const counts = new Map<string, number>();
  (problems ?? []).forEach((p: { subject_id: string }) => {
    counts.set(p.subject_id, (counts.get(p.subject_id) ?? 0) + 1);
  });

  const courseBySubject = await loadSubjectCourses().catch(() => new Map<string, string>());
  return (subjects as SubjectRow[]).map((s) => ({
    id: s.id,
    name: s.name,
    createdAt: s.created_at,
    courseId: courseBySubject.get(s.id),
    count: counts.get(s.id) ?? 0,
  }));
}

const missingTable = (code?: string) => code === "42P01" || code === "PGRST205";

/** 과목 학습 목표(learning_goals)를 시간표 과목 id 기준으로 찾는다. */
async function loadCourseGoals() {
  const supabase = getSupabaseClient()!;
  const { data, error } = await supabase.from("learning_goals").select("id,course_id,metadata")
    .eq("goal_type", "course").eq("status", "active");
  if (error) throw new Error(error.message);
  const goalToCourse = new Map<string, string>();
  for (const row of (data ?? []) as { id: string; course_id: string | null; metadata: { legacy_record?: { courseId?: string } } | null }[]) {
    const courseId = row.metadata?.legacy_record?.courseId ?? row.course_id;
    if (courseId) goalToCourse.set(row.id, courseId);
  }
  return goalToCourse;
}

/** 문제은행 과목 → 시간표 과목 (코칭 연결 problem_bank_coaching_links 기준) */
async function loadSubjectCourses() {
  const supabase = getSupabaseClient()!;
  const links = await supabase.from("problem_bank_coaching_links").select("subject_id,goal_id");
  if (links.error) {
    if (missingTable(links.error.code)) return new Map<string, string>();
    throw new Error(links.error.message);
  }
  const goalToCourse = await loadCourseGoals();
  const result = new Map<string, string>();
  for (const link of (links.data ?? []) as { subject_id: string; goal_id: string }[]) {
    const courseId = goalToCourse.get(link.goal_id);
    if (courseId) result.set(link.subject_id, courseId);
  }
  return result;
}

/**
 * 시간표 과목마다 문제은행 과목을 만들고 그 과목의 학습 목표에 연결한다.
 * 연결된 과목의 문제 이해도는 AI 코칭에 자동으로 들어간다(coaching_problem_bank_states).
 * 이름이 같은 기존 미연결 과목이 있으면 새로 만들지 않고 그 과목을 연결한다.
 */
async function syncSupabaseSubjects(courses: SyncCourse[]) {
  const assertCurrent = captureStorageScope();
  const supabase = getSupabaseClient()!;
  const { data: userData } = await supabase.auth.getUser();
  assertCurrent();
  const userId = userData.user?.id;
  if (!userId || !courses.length) return;
  await flushP0Changes();
  assertCurrent();

  const links = await supabase.from("problem_bank_coaching_links").select("subject_id,goal_id");
  if (links.error) {
    if (missingTable(links.error.code)) return;
    throw new Error(links.error.message);
  }
  const goalToCourse = await loadCourseGoals();
  assertCurrent();
  const courseToGoal = new Map([...goalToCourse].map(([goal, course]) => [course, goal]));
  const linkedGoals = new Set((links.data ?? []).map((l: { goal_id: string }) => l.goal_id));
  const linkedSubjects = new Set((links.data ?? []).map((l: { subject_id: string }) => l.subject_id));
  const { data: subjects, error } = await supabase.from("problem_bank_subjects").select("id,name");
  assertCurrent();
  if (error) throw new Error(error.message);
  const dismissed = getDismissedCourses();

  for (const course of courses) {
    assertCurrent();
    const goalId = courseToGoal.get(course.id);
    if (!goalId || linkedGoals.has(goalId) || dismissed.has(course.id)) continue;
    const sameName = ((subjects ?? []) as { id: string; name: string }[])
      .find((s) => !linkedSubjects.has(s.id) && s.name.trim() === course.name.trim());
    let subjectId = sameName?.id;
    if (!subjectId) {
      const created = await supabase.from("problem_bank_subjects").insert({ user_id: userId, name: course.name }).select("id").single();
      assertCurrent();
      if (created.error) throw new Error(created.error.message);
      subjectId = (created.data as { id: string }).id;
    }
    const link = await supabase.from("problem_bank_coaching_links")
      .upsert({ subject_id: subjectId, user_id: userId, goal_id: goalId, topic_id: null }, { onConflict: "subject_id,user_id" });
    assertCurrent();
    if (link.error) throw new Error(link.error.message);
    linkedGoals.add(goalId);
    linkedSubjects.add(subjectId);
  }
}

async function deleteSupabaseSubject(id: string) {
  const supabase = getSupabaseClient()!;
  const { error } = await supabase.from("problem_bank_subjects").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

async function createSupabaseSubject(name: string): Promise<ProblemBankSubject> {
  const assertCurrent = captureStorageScope();
  const supabase = getSupabaseClient()!;
  const { data: userData } = await supabase.auth.getUser();
  assertCurrent();
  const userId = userData.user?.id;
  if (!userId) throw new Error("로그인이 필요합니다.");

  const { data, error } = await supabase
    .from("problem_bank_subjects")
    .insert({ user_id: userId, name })
    .select("*")
    .single();
  if (error) throw new Error(error.message);

  const row = data as SubjectRow;
  return { id: row.id, name: row.name, createdAt: row.created_at, count: 0 };
}

async function listSupabaseProblems(subjectId: string): Promise<ProblemBankProblem[]> {
  const supabase = getSupabaseClient()!;
  const { data, error } = await supabase
    .from("problem_bank_problems")
    .select("*")
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data as ProblemRow[]).map(rowToProblem);
}

async function setSupabaseProblemLevel(id: string, level: number): Promise<ProblemBankProblem> {
  const supabase = getSupabaseClient()!;
  const { data, error } = await supabase
    .from("problem_bank_problems")
    .update({ level })
    .eq("id", id)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return rowToProblem(data as ProblemRow);
}

async function deleteSupabaseProblem(id: string): Promise<void> {
  const supabase = getSupabaseClient()!;
  const { error } = await supabase.from("problem_bank_problems").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

async function saveSupabaseProblems(subjectId: string, sourceFile: string, labels: string[]): Promise<ProblemBankSaveResult> {
  const assertCurrent = captureStorageScope();
  const supabase = getSupabaseClient()!;
  const { data: userData } = await supabase.auth.getUser();
  assertCurrent();
  const userId = userData.user?.id;
  if (!userId) throw new Error("로그인이 필요합니다.");

  const { data: rows, error: existingError } = await supabase
    .from("problem_bank_problems")
    .select("label")
    .eq("subject_id", subjectId)
    .eq("source_file", sourceFile);
  if (existingError) throw new Error(existingError.message);
  assertCurrent();
  const existing = new Set((rows ?? []).map((r: { label: string }) => r.label));
  const fresh = labels.filter((l) => !existing.has(l));
  if (fresh.length) {
    const { error } = await supabase
      .from("problem_bank_problems")
      .insert(fresh.map((label) => ({ subject_id: subjectId, user_id: userId, label, source_file: sourceFile })));
    if (error) throw new Error(error.message);
  }
  return { addedCount: fresh.length, skippedCount: labels.length - fresh.length };
}

async function renameSupabaseProblem(id: string, label: string): Promise<ProblemBankProblem> {
  const supabase = getSupabaseClient()!;
  const { data, error } = await supabase
    .from("problem_bank_problems")
    .update({ label })
    .eq("id", id)
    .select("*")
    .single();
  if (error?.code === "23505") throw duplicateLabel(label);
  if (error) throw new Error(error.message);
  return rowToProblem(data as ProblemRow);
}

async function deleteSupabaseFile(subjectId: string, sourceFile: string): Promise<void> {
  const supabase = getSupabaseClient()!;
  const { error } = await supabase
    .from("problem_bank_problems")
    .delete()
    .eq("subject_id", subjectId)
    .eq("source_file", sourceFile);
  if (error) throw new Error(error.message);
}

// ---------------------------------------------------------------------------
// Public API — 호출부는 Supabase 설정 여부를 신경 쓰지 않는다.
// ---------------------------------------------------------------------------

export async function listSubjects(): Promise<ProblemBankSubject[]> {
  if (isSupabaseConfigured) return listSupabaseSubjects();
  return listLocalSubjects();
}

export async function createSubject(name: string): Promise<ProblemBankSubject> {
  if (isSupabaseConfigured) return createSupabaseSubject(name);
  return createLocalSubject(name);
}

/** 현재 학기 시간표 과목을 문제은행 과목으로 자동 연동한다. 사용자가 지운 과목은 다시 만들지 않는다. */
export async function syncSubjectsWithCourses(courses: SyncCourse[]): Promise<void> {
  if (isSupabaseConfigured) return syncSupabaseSubjects(courses);
  return syncLocalSubjects(courses);
}

/** 과목과 그 과목의 모든 문항·이해도 기록을 지운다. 자동 연동 과목이면 다시 만들지 않도록 기억한다. */
export async function deleteSubject(subject: Pick<ProblemBankSubject, "id" | "courseId">): Promise<void> {
  if (isSupabaseConfigured) await deleteSupabaseSubject(subject.id);
  else await deleteLocalSubject(subject.id);
  if (subject.courseId) dismissCourse(subject.courseId);
}

export async function listProblems(subjectId: string): Promise<ProblemBankProblem[]> {
  if (isSupabaseConfigured) return listSupabaseProblems(subjectId);
  return listLocalProblems(subjectId);
}

export async function setProblemLevel(id: string, level: number): Promise<ProblemBankProblem> {
  if (isSupabaseConfigured) return setSupabaseProblemLevel(id, level);
  return setLocalProblemLevel(id, level);
}

/** 문항 본문을 채우거나 고친다(확인 필요 해제 포함). 이해도는 건드리지 않는다. */
export async function setProblemContent(id: string, content: ProblemContent | null): Promise<void> {
  if (isSupabaseConfigured) {
    const { error } = await getSupabaseClient()!.from("problem_bank_problems").update({ content }).eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  const problems = getLocalProblems();
  if (!problems.some((p) => p.id === id)) throw new Error("문제를 찾을 수 없어요.");
  writeJson(PROBLEM_BANK_PROBLEMS_KEY, problems.map((p) => (p.id === id ? { ...p, content } : p)));
}

export async function deleteProblem(id: string): Promise<void> {
  if (isSupabaseConfigured) return deleteSupabaseProblem(id);
  return deleteLocalProblem(id);
}

/** 사용자가 확인한 문항 번호를 파일 단위로 저장한다. 같은 파일에 이미 있는 번호는 건너뛴다. */
export async function saveProblems(subjectId: string, sourceFile: string, labels: string[]): Promise<ProblemBankSaveResult> {
  const clean = cleanSave(sourceFile, labels);
  if (isSupabaseConfigured) return saveSupabaseProblems(subjectId, clean.file, clean.labels);
  return saveLocalProblems(subjectId, clean.file, clean.labels);
}

export async function renameProblem(id: string, label: string): Promise<ProblemBankProblem> {
  const clean = cleanLabel(label);
  if (isSupabaseConfigured) return renameSupabaseProblem(id, clean);
  return renameLocalProblem(id, clean);
}

export async function deleteFile(subjectId: string, sourceFile: string): Promise<void> {
  if (isSupabaseConfigured) return deleteSupabaseFile(subjectId, sourceFile);
  return deleteLocalFile(subjectId, sourceFile);
}
