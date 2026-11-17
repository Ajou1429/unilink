import { preferredLectureNotes } from "../lecture-content";
// 과목 화면(보기 전용 3단 + 설정)의 데이터. 새 저장소를 만들지 않고 기존 기능의 저장 경로를 그대로 쓴다.
// 여기서 지우거나 고치면 나의 노트·문제은행·학습 계획·시간표·코칭 데이터에 그대로 반영된다.
import { getSupabaseBrowserClient } from "../supabase-client";
import { getStorageUser } from "../private-storage";
import { flushP0Changes } from "../p0-sync";
import {
  getAllCoursePlans, getCourseFiles, getCourseNotes, removeCourseFile, removeCourseNote, saveCoursePlans, type CourseFile,
} from "../course-storage";
import { deleteNote, getMyNotes, type MyNote } from "../my-notes-storage";
import {
  deleteFile, deleteProblem, listProblems, listSubjects, setProblemLevel, splitSourceFile, type ProblemBankProblem,
} from "../problem-bank-storage";
import { removeCrops } from "../problem-bank/images";
import { getIntakeLog } from "../file-intake/settings";
import { getWeeklyStudyPlans, getMonthlyStudyPlans, saveMonthlyStudyPlans, saveWeeklyStudyPlans } from "../study-storage";
import {
  getCourseSessions, getMonthlyEvents, removeCourseSession, saveCourseSession, saveMonthlyEvents, type CourseSessionProgress,
} from "../timetable-storage";
import type { LectureNote, StudyPlan } from "../types";
import { pickMidtermDate } from "./period";

type Db = NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;

async function session(): Promise<{ db: Db; userId: string } | null> {
  const db = getSupabaseBrowserClient();
  if (!db) return null;
  const user = (await db.auth.getUser()).data.user;
  return user && getStorageUser() === user.id ? { db, userId: user.id } : null;
}

/** 과목 학습 목표(DB). 주제·AI 계획·시험 일정이 여기에 묶인다. */
export async function loadCourseGoal(courseId: string): Promise<{ db: Db; userId: string; goalId: string } | null> {
  const s = await session();
  if (!s) return null;
  await flushP0Changes();
  const { data, error } = await s.db.from("learning_goals").select("id,course_id,metadata")
    .eq("user_id", s.userId).eq("goal_type", "course").eq("status", "active");
  if (error) throw new Error("과목 정보를 불러오지 못했습니다.");
  const goal = (data ?? []).find((row: { metadata: { legacy_record?: { courseId?: string } } | null }) => row.metadata?.legacy_record?.courseId === courseId);
  return goal ? { ...s, goalId: goal.id } : null;
}

export async function loadMidtermDate(courseId: string): Promise<string | null> {
  const goal = await loadCourseGoal(courseId).catch(() => null);
  if (!goal) return null;
  const { data } = await goal.db.from("calendar_events").select("title,event_type,starts_at,due_at")
    .eq("user_id", goal.userId).eq("goal_id", goal.goalId);
  return pickMidtermDate((data ?? []).map((row: { title: string; event_type: string; starts_at: string | null; due_at: string | null }) => ({
    title: row.title, event_type: row.event_type, date: row.starts_at ?? row.due_at,
  })));
}

// ── 강의자료 ──────────────────────────────────────────────

export type Material =
  | { key: string; kind: "note"; id: string; title: string; date: string; label: string; note: MyNote }
  | { key: string; kind: "legacy"; id: string; title: string; date: string; label: string; content: string }
  | { key: string; kind: "file"; id: string; title: string; date: string; label: string; file: CourseFile };

function typeLabel(note: MyNote) {
  return note.tags.find((tag) => ["강의자료", "필기", "강의계획서", "문제은행", "과제", "기타"].includes(tag)) ?? (note.fileName ? "파일" : "노트");
}

export async function listMaterials(courseId: string): Promise<Material[]> {
  const notes = preferredLectureNotes((await getMyNotes()).filter((note) => note.linkedType === "course" && note.linkedId === courseId));
  return [
    ...notes.map((note): Material => ({ key: `note:${note.id}`, kind: "note", id: note.id, title: note.title || note.fileName || "제목 없음", date: note.createdAt, label: typeLabel(note), note })),
    ...getCourseNotes(courseId).map((note: LectureNote): Material => ({ key: `legacy:${note.id}`, kind: "legacy", id: note.id, title: note.title, date: note.createdAt, label: "노트", content: note.content })),
    ...getCourseFiles(courseId).map((file): Material => ({ key: `file:${file.id}`, kind: "file", id: file.id, title: file.name, date: file.createdAt, label: "파일", file })),
  ].sort((a, b) => b.date.localeCompare(a.date));
}

/** 이 자료에서 만들어진 문제은행 파일 (대시보드 자동 분류 기록 → 없으면 같은 파일 이름) */
export async function linkedProblemFiles(courseId: string, material: Material): Promise<{ subjectId: string; sourceFile: string; count: number }[]> {
  if (material.kind !== "note") return [];
  const subject = (await listSubjects()).find((item) => item.courseId === courseId);
  if (!subject) return [];
  const problems = await listProblems(subject.id);
  const fromLog = getIntakeLog().filter((record) => record.noteId === material.id && record.problemSourceFile && record.problemSubjectId === subject.id)
    .map((record) => record.problemSourceFile!);
  const names = [material.note.fileName, material.note.title].filter(Boolean).map((name) => name!.slice(0, 180));
  const files = new Set([...fromLog, ...new Set(problems.map((p) => p.sourceFile))].filter((file) =>
    fromLog.includes(file) || names.includes(splitSourceFile(file).name)));
  return [...files].map((sourceFile) => ({ subjectId: subject.id, sourceFile, count: problems.filter((p) => p.sourceFile === sourceFile).length }));
}

/**
 * 강의자료 삭제: 노트·저장 파일·연결된 문제은행 문제(그림 포함)를 지운다.
 * Drive에서 온 파일은 UniLink에서만 지우고, 다음 동기화 때 다시 가져오지 않도록 기억한다(Drive 원본은 그대로).
 */
export async function deleteMaterial(courseId: string, material: Material) {
  if (material.kind === "legacy") { removeCourseNote(material.id); return; }
  if (material.kind === "file") { removeCourseFile(material.id); return; }
  const driveFileId = material.note.driveFileId;
  if (driveFileId) {
    const s = await session();
    if (s) {
      const { error } = await s.db.from("dismissed_drive_files").upsert({ user_id: s.userId, drive_file_id: driveFileId }, { onConflict: "user_id,drive_file_id" });
      if (error) throw new Error(error.code === "42P01" || error.code === "PGRST205"
        ? "Drive 자료 삭제를 위해 DB 업데이트 0040이 필요합니다."
        : "Drive 파일을 다시 가져오지 않도록 기억하지 못했습니다. 잠시 후 다시 시도해 주세요.");
    }
  }
  for (const linked of await linkedProblemFiles(courseId, material)) {
    const images = (await listProblems(linked.subjectId)).filter((p) => p.sourceFile === linked.sourceFile)
      .flatMap((p) => p.content?.images.map((image) => image.src) ?? []);
    await deleteFile(linked.subjectId, linked.sourceFile);
    void removeCrops(images);
  }
  await deleteNote(material.id);
}

// ── 문제 ──────────────────────────────────────────────────

export async function loadCourseProblems(courseId: string): Promise<{ subjectId: string | null; problems: ProblemBankProblem[] }> {
  const subject = (await listSubjects()).find((item) => item.courseId === courseId);
  return subject ? { subjectId: subject.id, problems: await listProblems(subject.id) } : { subjectId: null, problems: [] };
}

export async function deleteProblemFile(subjectId: string, sourceFile: string, problems: ProblemBankProblem[]) {
  const images = problems.filter((p) => p.sourceFile === sourceFile).flatMap((p) => p.content?.images.map((image) => image.src) ?? []);
  await deleteFile(subjectId, sourceFile);
  void removeCrops(images);
}

export async function deleteOneProblem(problem: ProblemBankProblem) {
  await deleteProblem(problem.id);
  void removeCrops(problem.content?.images.map((image) => image.src) ?? []);
}

export { setProblemLevel };

// ── 계획 ──────────────────────────────────────────────────

export type CoursePlan =
  | { key: string; kind: "manual"; id: string; title: string; date: string; done: boolean }
  | { key: string; kind: "ai"; id: string; title: string; date: string; done: boolean; start: string | null; end: string | null };

/** 과목 계획: 직접 만든 계획(과목·주간 학습 계획) + 승인된 AI 코칭 계획 */
export async function listPlans(courseId: string): Promise<CoursePlan[]> {
  const manual = new Map<string, StudyPlan>();
  for (const plan of getAllCoursePlans()) if (plan.courseId === courseId) manual.set(plan.id, plan);
  // 미루기 등은 주간 계획에 먼저 반영되므로 주간 쪽 값을 우선한다
  for (const plan of getWeeklyStudyPlans()) if (plan.courseId === courseId) manual.set(plan.id, plan);
  const plans: CoursePlan[] = [...manual.values()].map((plan) => ({
    key: `plan:${plan.id}`, kind: "manual", id: plan.id, title: plan.title, date: plan.dueDate || plan.createdAt, done: plan.isCompleted,
  }));
  const goal = await loadCourseGoal(courseId).catch(() => null);
  if (goal) {
    const { data } = await goal.db.from("study_plan_items")
      .select("id,title,scheduled_start,scheduled_end,status,created_at,study_plans!inner(source_type,status)")
      .eq("user_id", goal.userId).eq("goal_id", goal.goalId).eq("study_plans.source_type", "ai")
      .in("study_plans.status", ["approved", "active", "completed"]).in("status", ["planned", "in_progress", "completed"]);
    for (const row of (data ?? []) as { id: string; title: string; scheduled_start: string | null; scheduled_end: string | null; status: string; created_at: string }[]) {
      plans.push({ key: `ai:${row.id}`, kind: "ai", id: row.id, title: row.title, date: kstDateKey(row.scheduled_start ?? row.created_at), done: row.status === "completed", start: row.scheduled_start, end: row.scheduled_end });
    }
  }
  return plans.sort((a, b) => a.date.localeCompare(b.date));
}

function weekStartOf(dateKey: string) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const date = new Date(y, m - 1, d - new Date(y, m - 1, d).getDay());
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** 직접 만든 계획은 과목 계획·주간 계획·월간 계획·월간 일정 네 곳에 복사돼 있으므로 모두 고친다 */
function patchManual(id: string, patch: { title?: string; dueDate?: string; isCompleted?: boolean } | null) {
  const apply = (plan: StudyPlan): StudyPlan => {
    const next = { ...plan, ...patch };
    if (patch?.dueDate) next.weekStart = weekStartOf(patch.dueDate);
    return next;
  };
  saveCoursePlans(patch ? getAllCoursePlans().map((p) => (p.id === id ? apply(p) : p)) : getAllCoursePlans().filter((p) => p.id !== id));
  saveWeeklyStudyPlans(patch ? getWeeklyStudyPlans().map((p) => (p.id === id ? apply(p) : p)) : getWeeklyStudyPlans().filter((p) => p.id !== id));
  const monthlyId = `weekly-${id}`;
  saveMonthlyStudyPlans(patch
    ? getMonthlyStudyPlans().map((p) => (p.id === monthlyId ? {
      ...p, title: patch.title ?? p.title, isCompleted: patch.isCompleted ?? p.isCompleted,
      ...(patch.dueDate ? { weekStart: weekStartOf(patch.dueDate), month: patch.dueDate.slice(0, 7) } : {}),
    } : p))
    : getMonthlyStudyPlans().filter((p) => p.id !== monthlyId));
  const eventId = `course-plan-event-${id}`;
  saveMonthlyEvents(patch
    ? getMonthlyEvents().map((e) => (e.id === eventId ? { ...e, title: patch.title ? `학습 계획: ${patch.title}` : e.title, date: patch.dueDate ?? e.date } : e))
    : getMonthlyEvents().filter((e) => e.id !== eventId));
}

export interface PlanEdit { title: string; date: string; done: boolean }

/** 한국 날짜(YYYY-MM-DD). AI 계획 시각은 UTC로 저장돼 있다. */
export function kstDateKey(iso: string) {
  return /T/.test(iso) ? new Date(Date.parse(iso) + 9 * 3600_000).toISOString().slice(0, 10) : iso.slice(0, 10);
}

export async function updatePlan(plan: CoursePlan, edit: PlanEdit) {
  const title = edit.title.trim();
  if (!title) throw new Error("계획 제목을 입력해 주세요.");
  if (plan.kind === "manual") { patchManual(plan.id, { title, dueDate: edit.date, isCompleted: edit.done }); return; }
  const s = await session();
  if (!s) throw new Error("다시 로그인해 주세요.");
  const update: Record<string, unknown> = { title, status: edit.done ? "completed" : "planned" };
  // 날짜만 바꾸고 시작 시각·길이는 유지한다
  if (plan.start && plan.end && edit.date && edit.date !== kstDateKey(plan.start)) {
    const shift = Date.parse(`${edit.date}T00:00:00+09:00`) - Date.parse(`${kstDateKey(plan.start)}T00:00:00+09:00`);
    update.scheduled_start = new Date(Date.parse(plan.start) + shift).toISOString();
    update.scheduled_end = new Date(Date.parse(plan.end) + shift).toISOString();
  }
  const { error } = await s.db.from("study_plan_items").update(update).eq("id", plan.id).eq("user_id", s.userId);
  if (error) throw new Error("AI 계획을 고치지 못했습니다.");
  window.dispatchEvent(new Event("unilink:studyPlansChanged"));
}

/** 삭제: 직접 만든 계획은 지우고, AI 계획 항목은 취소 상태로 바꾼다(실행 기록과 연결돼 있을 수 있어서) */
export async function deletePlan(plan: CoursePlan) {
  if (plan.kind === "manual") { patchManual(plan.id, null); return; }
  const s = await session();
  if (!s) throw new Error("다시 로그인해 주세요.");
  const { error } = await s.db.from("study_plan_items").update({ status: "cancelled" }).eq("id", plan.id).eq("user_id", s.userId);
  if (error) throw new Error("AI 계획을 삭제하지 못했습니다.");
  window.dispatchEvent(new Event("unilink:studyPlansChanged"));
}

// ── 주제별 이해도 (채팅·코칭 기록) ────────────────────────────

export type TopicStatus = "not_started" | "in_progress" | "needs_review" | "understood";
export interface TopicState { learning_status: TopicStatus; self_rating: number | null; memo: string; observed_at: string; session_id: string | null; note_id: string | null; page_start: number | null; page_end: number | null }
export interface TopicRow { id: string; title: string; state: TopicState | null }

export async function loadTopics(courseId: string): Promise<TopicRow[] | null> {
  const goal = await loadCourseGoal(courseId);
  if (!goal) return null;
  const [topics, states] = await Promise.all([
    goal.db.from("goal_topics").select("id,title").eq("user_id", goal.userId).eq("goal_id", goal.goalId).eq("status", "confirmed").order("created_at").limit(300),
    goal.db.from("topic_learning_states").select("topic_id,learning_status,self_rating,memo,observed_at,session_id,note_id,page_start,page_end").eq("user_id", goal.userId).eq("goal_id", goal.goalId).limit(300),
  ]);
  if (topics.error || states.error) throw new Error("주제별 이해도를 불러오지 못했습니다.");
  const byTopic = new Map((states.data ?? []).map((row: TopicState & { topic_id: string }) => [row.topic_id, row]));
  return (topics.data ?? []).map((topic: { id: string; title: string }) => ({ ...topic, state: byTopic.get(topic.id) ?? null }));
}

/** 고친 값은 새 관측 기록으로 남는다(이력 보존). 코칭이 바로 최신 값을 쓴다. */
export async function saveTopicState(topic: TopicRow, edit: { status: TopicStatus; rating: number | null; memo: string }) {
  const s = await session();
  if (!s) throw new Error("다시 로그인해 주세요.");
  const { error } = await s.db.rpc("record_topic_observation", {
    p_topic: topic.id, p_status: edit.status, p_rating: edit.status === "not_started" ? null : edit.rating,
    p_memo: edit.memo.slice(0, 1000), p_observed_at: new Date().toISOString(),
    p_session: topic.state?.session_id ?? null, p_note: topic.state?.note_id ?? null,
    p_page_start: topic.state?.page_start ?? null, p_page_end: topic.state?.page_end ?? null, p_request: crypto.randomUUID(),
  });
  if (error) throw new Error(error.message || "이해도를 저장하지 못했습니다.");
}

/** 주제 삭제: 숨김(archived). 코칭·채팅 해석에서 더 이상 쓰지 않는다. */
export async function archiveTopic(topic: TopicRow) {
  const s = await session();
  if (!s) throw new Error("다시 로그인해 주세요.");
  const { error } = await s.db.from("goal_topics").update({ status: "archived" }).eq("id", topic.id).eq("user_id", s.userId);
  if (error) throw new Error("주제를 삭제하지 못했습니다.");
}

// ── 수업 회차 진도 ─────────────────────────────────────────

export function listSessions(courseId: string): CourseSessionProgress[] {
  return getCourseSessions().filter((s) => s.courseId === courseId).sort((a, b) => b.date.localeCompare(a.date));
}

export function updateSession(sessionRecord: CourseSessionProgress, edit: Pick<CourseSessionProgress, "progressTitle" | "pageStart" | "pageEnd" | "difficulty" | "pace">) {
  saveCourseSession({ ...sessionRecord, ...edit, progressTitle: edit.progressTitle.trim(), updatedAt: new Date().toISOString() });
}

export function deleteSession(sessionRecord: CourseSessionProgress) {
  removeCourseSession(sessionRecord.courseId, sessionRecord.date, sessionRecord.startTime);
}


export { sortMaterials, type MaterialSort } from "./sort";
