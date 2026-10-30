import { privateStorage } from "./private-storage.ts";
import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { MAX_LABEL_LENGTH, MAX_LABELS } from "./problem-bank-labels.ts";

export const PROBLEM_BANK_SUBJECTS_KEY = "unilink:problem-bank-subjects";
export const PROBLEM_BANK_PROBLEMS_KEY = "unilink:problem-bank-problems";

export interface ProblemBankSubject {
  id: string;
  name: string;
  count: number;
  createdAt: string;
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
    count: problems.filter((p) => p.subjectId === s.id).length,
  }));
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

  return (subjects as SubjectRow[]).map((s) => ({
    id: s.id,
    name: s.name,
    createdAt: s.created_at,
    count: counts.get(s.id) ?? 0,
  }));
}

async function createSupabaseSubject(name: string): Promise<ProblemBankSubject> {
  const supabase = getSupabaseClient()!;
  const { data: userData } = await supabase.auth.getUser();
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
  const supabase = getSupabaseClient()!;
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) throw new Error("로그인이 필요합니다.");

  const { data: rows, error: existingError } = await supabase
    .from("problem_bank_problems")
    .select("label")
    .eq("subject_id", subjectId)
    .eq("source_file", sourceFile);
  if (existingError) throw new Error(existingError.message);
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

export async function listProblems(subjectId: string): Promise<ProblemBankProblem[]> {
  if (isSupabaseConfigured) return listSupabaseProblems(subjectId);
  return listLocalProblems(subjectId);
}

export async function setProblemLevel(id: string, level: number): Promise<ProblemBankProblem> {
  if (isSupabaseConfigured) return setSupabaseProblemLevel(id, level);
  return setLocalProblemLevel(id, level);
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
