import { getSupabaseClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { describeFunctionError } from "@/lib/supabase/function-error";

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
  sourceFile: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProblemBankUploadResult {
  addedCount: number;
  extractedCount: number;
}

// ---------------------------------------------------------------------------
// localStorage 목업 — Supabase가 설정되지 않은 개발 환경(GitHub Pages 데모)에서만 쓰인다.
// PDF 업로드(Gemini 추출)는 서버가 필요해 로컬 모드에서는 지원하지 않는다.
// ---------------------------------------------------------------------------

interface LocalSubject {
  id: string;
  name: string;
  createdAt: string;
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      window.localStorage.setItem(key, JSON.stringify(fallback));
      return fallback;
    }
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(value));
}

function getLocalSubjects(): LocalSubject[] {
  return readJson<LocalSubject[]>(PROBLEM_BANK_SUBJECTS_KEY, []);
}

function getLocalProblems(): ProblemBankProblem[] {
  return readJson<ProblemBankProblem[]>(PROBLEM_BANK_PROBLEMS_KEY, []);
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
    sourceFile: row.source_file,
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

async function uploadSupabasePDF(subjectId: string, file: File): Promise<ProblemBankUploadResult> {
  const supabase = getSupabaseClient()!;
  const formData = new FormData();
  formData.append("subjectId", subjectId);
  formData.append("file", file);

  const { data, error } = await supabase.functions.invoke<ProblemBankUploadResult>(
    "problem-bank-upload",
    { body: formData },
  );
  if (error || !data) {
    throw new Error(await describeFunctionError(error, "PDF에서 문제를 읽지 못했어요."));
  }
  return data;
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

export async function uploadPDF(subjectId: string, file: File): Promise<ProblemBankUploadResult> {
  if (!isSupabaseConfigured) {
    throw new Error("Supabase가 설정되지 않아 PDF 업로드(Gemini 추출)는 사용할 수 없습니다.");
  }
  return uploadSupabasePDF(subjectId, file);
}
