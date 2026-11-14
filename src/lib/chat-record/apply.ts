// 홈 채팅 기록을 기존 저장 경로에 그대로 넣는다. 새 표를 만들지 않는다.
// - 주제 이해도: 원자적 주제 확인·관측 저장, 원문 제외, 관측 단위 취소
// - 수업 회차: 시간표 회차 진도(브라우저 저장 → DB 동기화)
// - 문제은행: 문항 이해도(0~5)
import { getSupabaseBrowserClient } from "../supabase-client";
import { captureStorageScope, getStorageUser, privateStorage } from "../private-storage";
import { flushP0Changes } from "../p0-sync";
import { getActiveTermCourses } from "../course-storage";
import { EXAM_PERIODS, listProblems, listSubjects, splitSourceFile } from "../problem-bank-storage";
import { getCourseSession, removeCourseSession, saveCourseSession, type CourseSessionProgress, type PaceLevel } from "../timetable-storage";
import type { Course } from "../types";
import type { ChatResult, TopicStatus } from "../../../supabase/functions/_shared/chatRecord.ts";
import { courseSlots, slotFor, type ChatAction, type ProblemFileIndex } from "./plan";

const CONSENT_KEY = "unilink:chat-record-consent";
export type ChatConsent = "granted" | "declined" | null;

export function getChatConsent(): ChatConsent {
  try {
    const value = privateStorage.getItem(CONSENT_KEY);
    return value === "granted" || value === "declined" ? value : null;
  } catch {
    return null;
  }
}

export function setChatConsent(value: Exclude<ChatConsent, null>) {
  try { privateStorage.setItem(CONSENT_KEY, value); } catch { /* 이번 화면에서만 유지 */ }
}

type Db = NonNullable<ReturnType<typeof getSupabaseBrowserClient>>;

async function signedInDb(): Promise<{ db: Db; userId: string } | null> {
  const db = getSupabaseBrowserClient();
  if (!db) return null;
  const user = (await db.auth.getUser()).data.user;
  return user && getStorageUser() === user.id ? { db, userId: user.id } : null;
}

export interface ChatContext {
  signedIn: boolean;
  userId: string | null;
  courses: Course[];
  /** 시간표 과목 id → 과목 학습 목표 id(DB) */
  goals: Map<string, string>;
  topics: Map<string, { id: string; title: string }[]>;
  files: Map<string, ProblemFileIndex[]>;
  /** 시간표 과목 id → 문제은행 과목 id */
  subjects: Map<string, string>;
}

/** 해석에 필요한 과목·주제·문제은행 목록을 모은다 */
export async function loadChatContext(): Promise<ChatContext> {
  const assertCurrent = captureStorageScope();
  const courses = getActiveTermCourses().courses;
  const context: ChatContext = { signedIn: false, userId: getStorageUser(), courses, goals: new Map(), topics: new Map(), files: new Map(), subjects: new Map() };
  const session = await signedInDb();
  assertCurrent();
  if (session) {
    context.signedIn = true;
    await flushP0Changes();
    assertCurrent();
    const goals = await session.db.from("learning_goals").select("id,course_id,metadata")
      .eq("user_id", session.userId).eq("goal_type", "course").eq("status", "active");
    if (goals.error) throw new Error("과목 정보를 불러오지 못했습니다.");
    assertCurrent();
    for (const goal of (goals.data ?? []) as { id: string; course_id: string | null; metadata: { legacy_record?: { courseId?: string } } | null }[]) {
      const courseId = goal.metadata?.legacy_record?.courseId ?? goal.course_id;
      if (courseId && courses.some((course) => course.id === courseId)) context.goals.set(courseId, goal.id);
    }
    if (context.goals.size) {
      const rows = await session.db.from("goal_topics").select("id,goal_id,title").eq("user_id", session.userId)
        .in("goal_id", [...context.goals.values()]).eq("status", "confirmed").order("created_at").limit(400);
      if (rows.error) throw new Error("학습 주제를 불러오지 못했습니다.");
      const courseByGoal = new Map([...context.goals].map(([courseId, goalId]) => [goalId, courseId]));
      for (const row of (rows.data ?? []) as { id: string; goal_id: string; title: string }[]) {
        const courseId = courseByGoal.get(row.goal_id)!;
        context.topics.set(courseId, [...(context.topics.get(courseId) ?? []), { id: row.id, title: row.title }]);
      }
    }
  }
  try {
    const subjects = (await listSubjects()).filter((subject) => subject.courseId && courses.some((course) => course.id === subject.courseId) && subject.count > 0);
    await Promise.all(subjects.map(async (subject) => {
      context.subjects.set(subject.courseId!, subject.id);
      const byFile = new Map<string, string[]>();
      for (const problem of await listProblems(subject.id)) byFile.set(problem.sourceFile, [...(byFile.get(problem.sourceFile) ?? []), problem.label]);
      context.files.set(subject.courseId!, [...byFile].map(([file, problems]) => {
        const { period, name } = splitSourceFile(file);
        return { file, label: `${EXAM_PERIODS[period]} · ${name || "이름 없는 파일"}`, problems };
      }));
    }));
  } catch {
    // 문제은행을 못 읽어도 다른 기록은 계속한다
  }
  assertCurrent();
  return context;
}

export async function interpretMessage(context: ChatContext, message: string, history: { role: "user" | "assistant"; text: string }[], today: string): Promise<ChatResult> {
  const assertCurrent = captureStorageScope(context.userId);
  const session = await signedInDb();
  if (!session) throw new Error("로그인이 필요합니다.");
  assertCurrent();
  const { data, error } = await session.db.functions.invoke<{ result: ChatResult }>("chat-record", {
    body: {
      consent: true, message, history, today,
      courses: context.courses.map((course) => ({
        id: course.id, name: course.name, code: course.courseCode ?? null,
        days: [...new Set(courseSlots(course).map((slot) => slot.day))].join(","),
      })),
      topics: [...context.topics].map(([courseId, topics]) => ({ course_id: courseId, titles: topics.map((topic) => topic.title) })),
      problems: [...context.files].map(([courseId, files]) => ({ course_id: courseId, files })),
    },
  });
  assertCurrent();
  if (error || !data?.result) {
    let text = "대화를 해석하지 못했습니다.";
    try {
      const response = (error as { context?: Response } | null)?.context;
      const body = response ? await response.json() : null;
      if (typeof body?.error === "string") text = body.error;
    } catch {
      // 기본 문구
    }
    throw new Error(text);
  }
  return data.result;
}

// ── 저장 ──────────────────────────────────────────────────────────────

export type Applied =
  | { kind: "topic"; userId: string; courseId: string; courseName: string; topicId: string; topicTitle: string; observationId: string; created: boolean; status: TopicStatus; rating: number | null }
  | { kind: "session"; userId: string | null; courseId: string; courseName: string; date: string; startTime: string; current: CourseSessionProgress; previous: CourseSessionProgress | null }
  | { kind: "problem"; userId: string; courseId: string; courseName: string; fileLabel: string; level: number; items: { id: string; label: string; previous: number; updatedAt: string }[] };

export type ObservationIdentity = { requestId: string; observedAt: string };

const normalize = (value: string) => value.replace(/\s+/g, "").toLowerCase();

function rpcError(error: { code?: string; message: string }) {
  return new Error(error.code === "PGRST202" || error.code === "42883"
    ? "학습 기록 DB 업데이트(0037)가 필요합니다. 저장하지 않았습니다." : error.message);
}

async function applyTopic(context: ChatContext, course: Course, action: ChatAction, identity: ObservationIdentity, assertCurrent: () => void): Promise<Applied> {
  const session = await signedInDb();
  assertCurrent();
  if (!session) throw new Error("주제별 이해도는 로그인해야 저장돼요.");
  const goalId = context.goals.get(course.id);
  if (!goalId) throw new Error("이 과목의 학습 목표를 찾지 못했어요. 잠시 후 다시 시도해 주세요.");
  const title = action.topic!.slice(0, 60);
  const topic = (context.topics.get(course.id) ?? []).find((item) => normalize(item.title) === normalize(title));
  const rating = action.status === "not_started" ? null : action.rating;
  const result = await session.db.rpc("record_chat_topic_observation", {
    p_goal: goalId, p_topic: topic?.id ?? null, p_title: title, p_status: action.status!, p_rating: rating,
    p_observed_at: identity.observedAt, p_request: identity.requestId,
  });
  assertCurrent();
  if (result.error) throw rpcError(result.error);
  const saved = result.data as { observation_id: string; topic_id: string; title: string; created: boolean };
  if (!saved?.observation_id || !saved.topic_id) throw new Error("저장된 관측을 확인하지 못했습니다.");
  if (!topic) context.topics.set(course.id, [...(context.topics.get(course.id) ?? []), { id: saved.topic_id, title: saved.title }]);
  return { kind: "topic", userId: session.userId, courseId: course.id, courseName: course.name, topicId: saved.topic_id,
    topicTitle: saved.title, observationId: saved.observation_id, created: saved.created, status: action.status!, rating };
}

function applySession(course: Course, action: ChatAction, userId: string | null): Applied {
  const date = action.date!;
  const { startTime, endTime } = slotFor(course, date);
  const previous = getCourseSession(course.id, date, startTime);
  const now = new Date().toISOString();
  const current: CourseSessionProgress = {
    id: previous?.id ?? crypto.randomUUID(),
    courseId: course.id, courseName: course.name, date, startTime, endTime,
    progressTitle: action.progress_title ?? previous?.progressTitle ?? "",
    progressMemo: previous?.progressMemo ?? "",
    noteId: previous?.noteId ?? "", noteTitle: previous?.noteTitle ?? "",
    pageStart: action.page_start ? String(action.page_start) : previous?.pageStart ?? "",
    pageEnd: action.page_end ? String(action.page_end) : previous?.pageEnd ?? "",
    difficulty: action.difficulty ?? previous?.difficulty ?? null,
    pace: action.pace ?? previous?.pace ?? null,
    createdAt: previous?.createdAt ?? now, updatedAt: now,
  };
  saveCourseSession(current);
  return { kind: "session", userId, courseId: course.id, courseName: course.name, date, startTime, current, previous };
}

async function applyProblem(context: ChatContext, course: Course, action: ChatAction, assertCurrent: () => void): Promise<Applied> {
  const subjectId = context.subjects.get(course.id);
  if (!subjectId) throw new Error("이 과목의 문제은행을 찾지 못했어요.");
  const problems = (await listProblems(subjectId)).filter((problem) => problem.sourceFile === action.problem_file && action.problem_labels.includes(problem.label));
  assertCurrent();
  if (problems.length !== new Set(action.problem_labels).size) throw new Error("문항이 변경됐습니다. 다시 확인해 주세요.");
  const level = action.problem_level!;
  const saved = await changeProblemLevels(problems.map(p => ({ id: p.id, expected: p.updatedAt, level })), context.userId!, assertCurrent);
  assertCurrent();
  const file = (context.files.get(course.id) ?? []).find((item) => item.file === action.problem_file);
  return {
    kind: "problem", userId: context.userId!, courseId: course.id, courseName: course.name, fileLabel: file?.label ?? "", level,
    items: problems.map((problem) => ({ id: problem.id, label: problem.label, previous: problem.level, updatedAt: saved.find(p => p.id === problem.id)!.updated_at })),
  };
}

export async function applyAction(context: ChatContext, action: ChatAction, identity: ObservationIdentity = { requestId: crypto.randomUUID(), observedAt: new Date().toISOString() }, assertActive?: () => void): Promise<Applied> {
  const owner = captureStorageScope(context.userId);
  const assertCurrent = () => { owner(); assertActive?.(); }; assertCurrent();
  const course = context.courses.find((item) => item.id === action.course_id);
  if (!course) throw new Error("과목을 찾지 못했어요.");
  if (action.kind === "topic") return applyTopic(context, course, action, identity, assertCurrent);
  if (action.kind === "session") return applySession(course, action, context.userId);
  return applyProblem(context, course, action, assertCurrent);
}

async function changeProblemLevels(changes: { id: string; expected: string; level: number }[], userId: string, assertActive?: () => void) {
  const owner = captureStorageScope(userId);
  const assertCurrent = () => { owner(); assertActive?.(); };
  const session = await signedInDb(); assertCurrent();
  if (!session) throw new Error("다시 로그인해 주세요.");
  const result = await session.db.rpc("set_chat_problem_levels", { p_changes: changes });
  assertCurrent();
  if (result.error) throw rpcError(result.error);
  return result.data as { id: string; updated_at: string }[];
}

function assertSessionUnchanged(applied: Extract<Applied, { kind: "session" }>) {
  if (JSON.stringify(getCourseSession(applied.courseId, applied.date, applied.startTime)) !== JSON.stringify(applied.current)) {
    throw new Error("이후에 수업 기록이 변경됐습니다. 최신 기록에서 수정해 주세요.");
  }
}

/** Cancel only this observation; never turn a rollback into a new learning result. */
export async function undoApplied(applied: Applied) {
  const assertCurrent = captureStorageScope(applied.userId);
  if (applied.kind === "topic") {
    const session = await signedInDb();
    assertCurrent();
    if (!session) throw new Error("다시 로그인해 주세요.");
    const result = await session.db.rpc("void_chat_topic_observation", { p_observation: applied.observationId });
    assertCurrent();
    if (result.error) throw rpcError(result.error);
    return;
  }
  if (applied.kind === "session") {
    assertSessionUnchanged(applied);
    if (applied.previous) saveCourseSession(applied.previous);
    else removeCourseSession(applied.courseId, applied.date, applied.startTime);
    return;
  }
  await changeProblemLevels(applied.items.map(item => ({ id: item.id, expected: item.updatedAt, level: item.previous })), applied.userId, assertCurrent);
}

export type AppliedEdit =
  | { kind: "topic"; status: TopicStatus; rating: number | null }
  | { kind: "session"; progressTitle: string; difficulty: PaceLevel | null; pace: PaceLevel | null }
  | { kind: "problem"; level: number };

/** 카드에서 고친 값을 다시 저장한다 */
export async function editApplied(applied: Applied, edit: AppliedEdit): Promise<Applied> {
  const assertCurrent = captureStorageScope(applied.userId);
  if (applied.kind === "topic" && edit.kind === "topic") {
    const session = await signedInDb();
    assertCurrent();
    if (!session) throw new Error("다시 로그인해 주세요.");
    const rating = edit.status === "not_started" ? null : edit.rating;
    const result = await session.db.rpc("revise_chat_topic_observation", {
      p_observation: applied.observationId, p_status: edit.status, p_rating: rating, p_request: crypto.randomUUID(),
    });
    assertCurrent();
    if (result.error) throw rpcError(result.error);
    return { ...applied, status: edit.status, rating, observationId: result.data as string };
  }
  if (applied.kind === "session" && edit.kind === "session") {
    assertSessionUnchanged(applied);
    const current = { ...applied.current, progressTitle: edit.progressTitle.trim(), difficulty: edit.difficulty, pace: edit.pace, updatedAt: new Date().toISOString() };
    saveCourseSession(current);
    return { ...applied, current };
  }
  if (applied.kind === "problem" && edit.kind === "problem") {
    const saved = await changeProblemLevels(applied.items.map(item => ({ id: item.id, expected: item.updatedAt, level: edit.level })), applied.userId, assertCurrent);
    return { ...applied, level: edit.level, items: applied.items.map(item => ({ ...item, updatedAt: saved.find(p => p.id === item.id)!.updated_at })) };
  }
  return applied;
}
