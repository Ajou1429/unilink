// 홈 채팅 기록을 기존 저장 경로에 그대로 넣는다. 새 표를 만들지 않는다.
// - 주제 이해도: goal_topics(없으면 사용자 주제로 추가) + record_topic_observation (자기 보고, 이력 보존)
// - 수업 회차: 시간표 회차 진도(브라우저 저장 → DB 동기화)
// - 문제은행: 문항 이해도(0~5)
import { getSupabaseBrowserClient } from "../supabase-client";
import { getStorageUser, privateStorage } from "../private-storage";
import { flushP0Changes } from "../p0-sync";
import { getActiveTermCourses } from "../course-storage";
import { EXAM_PERIODS, listProblems, listSubjects, setProblemLevel, splitSourceFile } from "../problem-bank-storage";
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
  const courses = getActiveTermCourses().courses;
  const context: ChatContext = { signedIn: false, courses, goals: new Map(), topics: new Map(), files: new Map(), subjects: new Map() };
  const session = await signedInDb();
  if (session) {
    context.signedIn = true;
    await flushP0Changes();
    const goals = await session.db.from("learning_goals").select("id,course_id,metadata")
      .eq("user_id", session.userId).eq("goal_type", "course").eq("status", "active");
    if (goals.error) throw new Error("과목 정보를 불러오지 못했습니다.");
    for (const goal of (goals.data ?? []) as { id: string; metadata: { legacy_record?: { courseId?: string } } | null }[]) {
      const courseId = goal.metadata?.legacy_record?.courseId;
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
  return context;
}

export async function interpretMessage(context: ChatContext, message: string, history: { role: "user" | "assistant"; text: string }[], today: string): Promise<ChatResult> {
  const session = await signedInDb();
  if (!session) throw new Error("로그인이 필요합니다.");
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

interface TopicState { learning_status: TopicStatus; self_rating: number | null; memo: string; session_id: string | null; note_id: string | null; page_start: number | null; page_end: number | null }

export type Applied =
  | { kind: "topic"; courseId: string; courseName: string; topicId: string; topicTitle: string; created: boolean; status: TopicStatus; rating: number | null; memo: string; previous: TopicState | null }
  | { kind: "session"; courseId: string; courseName: string; date: string; startTime: string; current: CourseSessionProgress; previous: CourseSessionProgress | null }
  | { kind: "problem"; courseId: string; courseName: string; fileLabel: string; level: number; items: { id: string; label: string; previous: number }[] };

const normalize = (value: string) => value.replace(/\s+/g, "").toLowerCase();

async function recordObservation(db: Db, topicId: string, state: Omit<TopicState, "learning_status"> & { learning_status: TopicStatus }) {
  const result = await db.rpc("record_topic_observation", {
    p_topic: topicId, p_status: state.learning_status,
    p_rating: state.learning_status === "not_started" ? null : state.self_rating,
    p_memo: state.memo.slice(0, 1000), p_observed_at: new Date().toISOString(),
    p_session: state.session_id, p_note: state.note_id, p_page_start: state.page_start, p_page_end: state.page_end,
    p_request: crypto.randomUUID(),
  });
  if (result.error) throw new Error(result.error.message || "학습 상태를 저장하지 못했습니다.");
}

async function applyTopic(context: ChatContext, course: Course, action: ChatAction): Promise<Applied> {
  const session = await signedInDb();
  if (!session) throw new Error("주제별 이해도는 로그인해야 저장돼요.");
  const goalId = context.goals.get(course.id);
  if (!goalId) throw new Error("이 과목의 학습 목표를 찾지 못했어요. 잠시 후 다시 시도해 주세요.");
  const title = action.topic!.slice(0, 60);
  let topic = (context.topics.get(course.id) ?? []).find((item) => normalize(item.title) === normalize(title));
  let created = false;
  if (!topic) {
    const inserted = await session.db.from("goal_topics")
      .insert({ user_id: session.userId, goal_id: goalId, title, source_type: "user", metadata: { schema_version: 1, origin: "chat" } })
      .select("id,title").single();
    if (inserted.error || !inserted.data) throw new Error("주제를 추가하지 못했습니다.");
    topic = inserted.data as { id: string; title: string };
    created = true;
    context.topics.set(course.id, [...(context.topics.get(course.id) ?? []), topic]);
  }
  const prev = await session.db.from("topic_learning_states").select("learning_status,self_rating,memo,session_id,note_id,page_start,page_end")
    .eq("user_id", session.userId).eq("topic_id", topic.id).maybeSingle();
  const previous = (prev.data as TopicState | null) ?? null;
  const memo = action.quote ? `대화: ${action.quote}` : "대화로 기록";
  await recordObservation(session.db, topic.id, { learning_status: action.status!, self_rating: action.rating, memo, session_id: null, note_id: null, page_start: null, page_end: null });
  return { kind: "topic", courseId: course.id, courseName: course.name, topicId: topic.id, topicTitle: topic.title, created, status: action.status!, rating: action.status === "not_started" ? null : action.rating, memo, previous };
}

function applySession(course: Course, action: ChatAction): Applied {
  const date = action.date!;
  const { startTime, endTime } = slotFor(course, date);
  const previous = getCourseSession(course.id, date, startTime);
  const now = new Date().toISOString();
  const current: CourseSessionProgress = {
    id: previous?.id ?? `${course.id}-${date}`,
    courseId: course.id, courseName: course.name, date, startTime, endTime,
    progressTitle: action.progress_title ?? previous?.progressTitle ?? "",
    progressMemo: previous?.progressMemo ?? "",
    noteId: previous?.noteId ?? "", noteTitle: previous?.noteTitle ?? "",
    pageStart: action.page_start ? String(action.page_start) : previous?.pageStart ?? "",
    pageEnd: action.page_end ? String(action.page_end) : previous?.pageEnd ?? "",
    difficulty: action.difficulty ?? previous?.difficulty ?? "중",
    pace: action.pace ?? previous?.pace ?? "중",
    createdAt: previous?.createdAt ?? now, updatedAt: now,
  };
  saveCourseSession(current);
  return { kind: "session", courseId: course.id, courseName: course.name, date, startTime, current, previous };
}

async function applyProblem(context: ChatContext, course: Course, action: ChatAction): Promise<Applied> {
  const subjectId = context.subjects.get(course.id);
  if (!subjectId) throw new Error("이 과목의 문제은행을 찾지 못했어요.");
  const problems = (await listProblems(subjectId)).filter((problem) => problem.sourceFile === action.problem_file && action.problem_labels.includes(problem.label));
  if (!problems.length) throw new Error("말씀하신 문항을 문제은행에서 찾지 못했어요.");
  const level = action.problem_level!;
  for (const problem of problems) await setProblemLevel(problem.id, level);
  const file = (context.files.get(course.id) ?? []).find((item) => item.file === action.problem_file);
  return {
    kind: "problem", courseId: course.id, courseName: course.name, fileLabel: file?.label ?? "", level,
    items: problems.map((problem) => ({ id: problem.id, label: problem.label, previous: problem.level })),
  };
}

export async function applyAction(context: ChatContext, action: ChatAction): Promise<Applied> {
  const course = context.courses.find((item) => item.id === action.course_id);
  if (!course) throw new Error("과목을 찾지 못했어요.");
  if (action.kind === "topic") return applyTopic(context, course, action);
  if (action.kind === "session") return applySession(course, action);
  return applyProblem(context, course, action);
}

/** 되돌리기: 주제는 이전 상태를 새 기록으로 남기고(대화로 만든 주제는 숨김), 회차·문항은 이전 값으로 돌린다. */
export async function undoApplied(applied: Applied) {
  if (applied.kind === "topic") {
    const session = await signedInDb();
    if (!session) throw new Error("다시 로그인해 주세요.");
    if (applied.created) {
      const result = await session.db.from("goal_topics").update({ status: "archived" }).eq("id", applied.topicId).eq("user_id", session.userId);
      if (result.error) throw new Error("되돌리지 못했습니다.");
      return;
    }
    await recordObservation(session.db, applied.topicId, applied.previous ?? {
      learning_status: "not_started", self_rating: null, memo: "", session_id: null, note_id: null, page_start: null, page_end: null,
    });
    return;
  }
  if (applied.kind === "session") {
    if (applied.previous) saveCourseSession(applied.previous);
    else removeCourseSession(applied.courseId, applied.date, applied.startTime);
    return;
  }
  for (const item of applied.items) await setProblemLevel(item.id, item.previous);
}

export type AppliedEdit =
  | { kind: "topic"; status: TopicStatus; rating: number | null }
  | { kind: "session"; progressTitle: string; difficulty: PaceLevel; pace: PaceLevel }
  | { kind: "problem"; level: number };

/** 카드에서 고친 값을 다시 저장한다 */
export async function editApplied(applied: Applied, edit: AppliedEdit): Promise<Applied> {
  if (applied.kind === "topic" && edit.kind === "topic") {
    const session = await signedInDb();
    if (!session) throw new Error("다시 로그인해 주세요.");
    const rating = edit.status === "not_started" ? null : edit.rating;
    await recordObservation(session.db, applied.topicId, { learning_status: edit.status, self_rating: rating, memo: applied.memo, session_id: null, note_id: null, page_start: null, page_end: null });
    return { ...applied, status: edit.status, rating };
  }
  if (applied.kind === "session" && edit.kind === "session") {
    const current = { ...applied.current, progressTitle: edit.progressTitle.trim(), difficulty: edit.difficulty, pace: edit.pace, updatedAt: new Date().toISOString() };
    saveCourseSession(current);
    return { ...applied, current };
  }
  if (applied.kind === "problem" && edit.kind === "problem") {
    for (const item of applied.items) await setProblemLevel(item.id, edit.level);
    return { ...applied, level: edit.level };
  }
  return applied;
}
